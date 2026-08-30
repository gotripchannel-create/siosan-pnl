// Vercel Cron Job: /api/cron-sync-invoices
// Автоматическая синхронизация накладных от поставщиков — работает САМА, по расписанию
// (см. vercel.json → crons), без нажатия кнопки в интерфейсе. Логика дедупликации и
// дозаполнения состава — та же, что в ручной синхронизации на странице «Поставщики»
// (src/App.jsx, функция syncFromIiko), продублирована здесь, потому что cron-функция
// выполняется на сервере без пользовательской сессии и работает с Supabase напрямую
// через service-role ключ (в обход обычной RLS-авторизации по JWT пользователя).
//
// ТРЕБУЕТ дополнительную переменную окружения на Vercel: SUPABASE_SERVICE_ROLE_KEY
// (Supabase → Project Settings → API → service_role key — секретный, не публиковать).
// А также CRON_SECRET — Vercel сам добавляет заголовок Authorization: Bearer <CRON_SECRET>
// при вызове зарегистрированных cron-задач, если эта переменная задана в окружении;
// без неё любой человек в интернете смог бы дёргать этот эндпоинт вручную.

export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

import { createHash } from 'crypto';

const RESTAURANT_ID = 'siosan';

function sha1Hex(str) {
  return createHash('sha1').update(str, 'utf8').digest('hex');
}

async function iikoAuth(serverUrl, login, password) {
  const url = `${serverUrl.replace(/\/$/, '')}/resto/api/auth?login=${encodeURIComponent(login)}&pass=${sha1Hex(password)}`;
  const resp = await fetch(url);
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Ошибка авторизации iiko (${resp.status}): ${text.slice(0, 300)}`);
  return text.trim();
}

async function iikoLogout(serverUrl, token) {
  try { await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/logout?key=${encodeURIComponent(token)}`); } catch (_) {}
}

async function fetchInvoices(serverUrl, token, from, to) {
  const resp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reportType: 'TRANSACTIONS', buildSummary: false,
      groupByRowFields: ['DateTime.Typed', 'Counteragent.Name'],
      groupByColFields: [],
      aggregateFields: ['Sum.Incoming'],
      filters: {
        'DateTime.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true },
        'TransactionType': { filterType: 'IncludeValues', values: ['INVOICE'] }
      }
    })
  });
  const json = JSON.parse(await resp.text());
  if (!resp.ok) throw new Error(`Отчёт по накладным вернул ошибку (${resp.status}).`);
  const invoices = (json?.data || [])
    .map(r => ({
      date: (r['DateTime.Typed'] || '').slice(0, 10),
      supplier: (r['Counteragent.Name'] || '').replace(/"/g, '').replace(/\s+/g, ' ').trim() || 'Без названия',
      amount: Math.round((Number(r['Sum.Incoming']) || 0) * 100) / 100
    }))
    .filter(inv => inv.amount > 0 && inv.date);

  // Состав каждой накладной — товар, количество, единица измерения.
  const itemsByKey = {};
  try {
    const itemsResp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportType: 'TRANSACTIONS', buildSummary: false,
        groupByRowFields: ['DateTime.Typed', 'Counteragent.Name', 'Product.Name', 'Product.MeasureUnit'],
        groupByColFields: [],
        aggregateFields: ['Sum.Incoming', 'Amount'],
        filters: {
          'DateTime.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true },
          'TransactionType': { filterType: 'IncludeValues', values: ['INVOICE'] }
        }
      })
    });
    const itemsJson = JSON.parse(await itemsResp.text());
    if (itemsResp.ok) {
      for (const r of (itemsJson?.data || [])) {
        const date = (r['DateTime.Typed'] || '').slice(0, 10);
        const supplier = (r['Counteragent.Name'] || '').replace(/"/g, '').replace(/\s+/g, ' ').trim() || 'Без названия';
        const key = `${date}::${supplier}`;
        (itemsByKey[key] ||= []).push({
          name: r['Product.Name'] || 'Без названия',
          qty: Number(r['Amount']) || 0,
          unit: r['Product.MeasureUnit'] || '',
          sum: Math.round((Number(r['Sum.Incoming']) || 0) * 100) / 100
        });
      }
    }
  } catch (_) {}

  for (const inv of invoices) inv.items = itemsByKey[`${inv.date}::${inv.supplier}`] || [];
  return invoices;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Та же логика слияния, что в ручной синхронизации: найти/создать поставщика по имени,
// не задвоить уже загруженную поставку, дозаполнить составом то, что грузили раньше без него.
function mergeInvoicesIntoData(data, invoices) {
  data.suppliers = data.suppliers || [];
  data.months = data.months || {};
  const normalize = (s) => String(s || '').trim().toLowerCase();
  const existingByName = new Map(data.suppliers.map((s) => [normalize(s.name), s]));
  let added = 0, filledIn = 0, newSuppliers = 0;

  for (const inv of invoices) {
    const monthKey = inv.date.slice(0, 7); // YYYY-MM
    if (!data.months[monthKey]) data.months[monthKey] = {};
    const month = data.months[monthKey];
    month.supplierOrders = month.supplierOrders || [];

    const key = normalize(inv.supplier);
    let supplierId;
    const found = existingByName.get(key);
    if (found) {
      supplierId = found.id;
    } else {
      const created = { id: uid(), name: inv.supplier, archived: false };
      data.suppliers.push(created);
      existingByName.set(key, created);
      supplierId = created.id;
      newSuppliers += 1;
    }

    const existing = month.supplierOrders.find(
      (o) => o.source === 'iiko' && o.supplierId === supplierId && o.date === inv.date && o.amount === inv.amount
    );
    if (existing) {
      if ((!existing.items || existing.items.length === 0) && inv.items?.length > 0) {
        existing.items = inv.items;
        filledIn += 1;
      }
      continue;
    }
    month.supplierOrders.push({
      id: uid(), supplierId, date: inv.date, amount: inv.amount,
      invoice: '', comment: 'Импортировано из iiko (авто)', source: 'iiko', items: inv.items || []
    });
    added += 1;
  }

  return { data, added, filledIn, newSuppliers };
}

export default async function handler(req, res) {
  // Защита: без CRON_SECRET любой в интернете смог бы дёргать эндпоинт и плодить записи.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${cronSecret}`) { res.status(401).json({ error: 'Unauthorized' }); return; }
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Не настроено: добавьте SUPABASE_SERVICE_ROLE_KEY в Environment Variables на Vercel (Supabase → Project Settings → API → service_role key).' });
    return;
  }

  const serverUrl = process.env.IIKO_SERVER_URL;
  const login = process.env.IIKO_API_LOGIN;
  const password = process.env.IIKO_API_PASSWORD;
  if (!serverUrl || !login || !password) {
    res.status(500).json({ error: 'iiko не настроен: добавьте IIKO_SERVER_URL, IIKO_API_LOGIN, IIKO_API_PASSWORD.' });
    return;
  }

  let token = null;
  try {
    // Окно в 21 день — с запасом покрывает и еженедельные, и двухнедельные поставки,
    // плюс ловит накладные, задним числом проведённые в iiko после факта поставки.
    const to = new Date().toISOString().slice(0, 10);
    const fromObj = new Date(); fromObj.setDate(fromObj.getDate() - 21);
    const from = fromObj.toISOString().slice(0, 10);

    token = await iikoAuth(serverUrl, login, password);
    const invoices = await fetchInvoices(serverUrl, token, from, to);

    // Читаем текущие данные напрямую из Supabase (service-role — в обход RLS).
    const getResp = await fetch(`${supabaseUrl}/rest/v1/restaurant_data?restaurant_id=eq.${RESTAURANT_ID}&select=id,data`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
    });
    if (!getResp.ok) throw new Error(`Не удалось прочитать данные из Supabase (${getResp.status}).`);
    const rows = await getResp.json();
    const row = rows?.[0];
    if (!row) throw new Error('Строка restaurant_data не найдена — сначала откройте приложение хотя бы раз, чтобы она создалась.');

    const { data: merged, added, filledIn, newSuppliers } = mergeInvoicesIntoData(row.data || {}, invoices);

    if (added > 0 || filledIn > 0 || newSuppliers > 0) {
      const patchResp = await fetch(`${supabaseUrl}/rest/v1/restaurant_data?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: {
          apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal'
        },
        body: JSON.stringify({ data: merged, updated_at: new Date().toISOString() })
      });
      if (!patchResp.ok) throw new Error(`Не удалось сохранить данные в Supabase (${patchResp.status}).`);
    }

    res.status(200).json({ ok: true, from, to, invoicesFound: invoices.length, added, filledIn, newSuppliers });
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Не удалось выполнить автоматическую синхронизацию.' });
  } finally {
    if (token) await iikoLogout(serverUrl, token);
  }
}
