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

// Та же логика сопоставления, что и на клиенте (src/App.jsx, matchIikoPayTypeToChannel) —
// продублирована здесь, так как cron выполняется отдельно от фронтенда.
function matchPayTypeToChannel(payType, channels) {
  const pt = String(payType || '').toLowerCase();
  const aliases = { cash: ['наличн', 'внесени'], card: ['банковск', 'карт'], yandex: ['яндекс'], netmonet: ['нетмонет', 'нет монет'] };
  for (const ch of channels) {
    const al = aliases[ch.id];
    if (al && al.some((a) => pt.includes(a))) return ch;
  }
  for (const ch of channels) {
    const cn = String(ch.name || '').toLowerCase();
    if (cn && (pt.includes(cn) || cn.includes(pt))) return ch;
  }
  return null;
}

async function fetchPayoutExpenses(serverUrl, token, from, to) {
  const resp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reportType: 'TRANSACTIONS', buildSummary: false,
      groupByRowFields: ['DateTime.Typed', 'Comment'], groupByColFields: [],
      aggregateFields: ['Sum.Incoming'],
      filters: {
        'DateTime.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true },
        'TransactionType': { filterType: 'IncludeValues', values: ['PAYOUT'] }
      }
    })
  });
  const json = JSON.parse(await resp.text());
  if (!resp.ok) return [];
  return (json?.data || [])
    .map((r) => ({
      date: (r['DateTime.Typed'] || '').slice(0, 10),
      comment: String(r['Comment'] || '').trim().toLowerCase() || 'без комментария',
      amount: Math.round((Number(r['Sum.Incoming']) || 0) * 100) / 100
    }))
    .filter((e) => e.amount > 0 && e.date && e.comment !== 'дб' && e.comment !== 'зп');
}

// Категоризация расходов через уже существующий ИИ-парсер (/api/parse-report) —
// вызываем именно его, а не отдельную копию промпта, чтобы логика категоризации
// была одна на всё приложение (и для ручной вставки из ВК, и для авторасходов из
// iiko). Аутентифицируемся как "внутренний" вызов через уже настроенный CRON_SECRET
// (см. изменение авторизации в api/parse-report.js).
async function categorizeExpenses(host, expensesByDay, settingsObj, employees) {
  const syntheticText = Object.entries(expensesByDay)
    .map(([date, items]) => `Расходы за ${date}:\n` + items.map((i) => `${i.comment} ${i.amount}`).join('\n'))
    .join('\n\n');
  if (!syntheticText.trim()) return [];

  const to = Object.keys(expensesByDay).sort().slice(-1)[0] || new Date().toISOString().slice(0, 10);
  const resp = await fetch(`https://${host}/api/parse-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': process.env.CRON_SECRET || '' },
    body: JSON.stringify({
      text: syntheticText,
      revenueChannels: settingsObj.revenueChannels || [], employees: employees || [],
      expenseCategories: settingsObj.expenseCategories || [], fallbackDate: to,
      glossary: settingsObj.reportGlossary || ''
    })
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.reports || [];
}

function mergeExpensesIntoData(data, reports) {
  data.months = data.months || {};
  let added = 0;
  for (const report of reports) {
    if (!report.date) continue;
    const mk = report.date.slice(0, 7);
    if (!data.months[mk]) data.months[mk] = {};
    const month = data.months[mk];
    month.days = month.days || {};
    const existing = month.days[report.date] || { closed: false, revenue: {}, kitchenExpenses: [], otherExpenses: [], courier: { deliveries: 0, pay: 0, km: 0, comment: '' }, promo: { pay: 0, comment: '' } };
    const newKitchen = (report.kitchenExpenses || []).map((e) => ({ id: uid(), category: e.category, amount: e.amount, comment: 'Из iiko (авто)', method: 'cash', source: 'iiko' }));
    const newOther = (report.otherExpenses || []).map((e) => ({ id: uid(), category: e.category, amount: e.amount, comment: 'Из iiko (авто)', method: 'cash', source: 'iiko' }));
    month.days[report.date] = {
      ...existing,
      kitchenExpenses: [...(existing.kitchenExpenses || []), ...newKitchen],
      otherExpenses: [...(existing.otherExpenses || []), ...newOther]
    };
    added += newKitchen.length + newOther.length;
  }
  return { data, added };
}

async function fetchRevenueByDay(serverUrl, token, from, to) {
  const resp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reportType: 'SALES', buildSummary: false,
      groupByRowFields: ['OpenDate.Typed', 'PayTypes'], groupByColFields: [],
      aggregateFields: ['DishDiscountSumInt'],
      filters: { 'OpenDate.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true } }
    })
  });
  const json = JSON.parse(await resp.text());
  if (!resp.ok) throw new Error(`Отчёт по продажам вернул ошибку (${resp.status}).`);
  const byDay = {}; // date -> { payType: amount }
  for (const r of (json?.data || [])) {
    const date = r['OpenDate.Typed'];
    const payType = r['PayTypes'] || 'Не указано';
    if (/без оплаты/i.test(payType) || !date) continue;
    (byDay[date] ||= {})[payType] = (byDay[date][payType] || 0) + (Number(r['DishDiscountSumInt']) || 0);
  }

  // Внесения по заказу (деньги, принятые за заказ отдельной кассовой операцией, а не
  // обычной продажей) — не попадают в отчёт по продажам выше, поэтому раньше терялись.
  // Берём из отчёта по проводкам, исключая «дб» (начальный остаток) и «зп» (зарплата).
  try {
    const txResp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportType: 'TRANSACTIONS', buildSummary: false,
        groupByRowFields: ['DateTime.Typed', 'Comment'], groupByColFields: [],
        aggregateFields: ['Sum.Incoming'],
        filters: {
          'DateTime.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true },
          'TransactionType': { filterType: 'IncludeValues', values: ['PAYIN'] }
        }
      })
    });
    const txJson = JSON.parse(await txResp.text());
    if (txResp.ok) {
      for (const r of (txJson?.data || [])) {
        const comment = String(r['Comment'] || '').trim().toLowerCase();
        if (comment === 'дб' || comment === 'зп') continue;
        const date = (r['DateTime.Typed'] || '').slice(0, 10);
        const amt = Number(r['Sum.Incoming']) || 0;
        if (!date || amt <= 0) continue;
        (byDay[date] ||= {})['Внесение по заказу'] = (byDay[date]['Внесение по заказу'] || 0) + amt;
      }
    }
  } catch (_) {
    // Не считаем фатальным для всей синхронизации — выручка по продажам важнее.
  }

  return byDay;
}

function mergeRevenueIntoData(data, revenueByDay) {
  data.months = data.months || {};
  data.settings = data.settings || {};
  const channels = data.settings.revenueChannels || [];
  const unmatched = new Set();
  let daysUpdated = 0;

  for (const [date, byPayType] of Object.entries(revenueByDay)) {
    const monthKey = date.slice(0, 7);
    if (!data.months[monthKey]) data.months[monthKey] = {};
    const month = data.months[monthKey];
    month.days = month.days || {};
    const existingDay = month.days[date] || { closed: false, revenue: {}, kitchenExpenses: [], otherExpenses: [], courier: { deliveries: 0, pay: 0, km: 0, comment: '' }, promo: { pay: 0, comment: '' } };
    const revenue = { ...existingDay.revenue };
    for (const [payType, amount] of Object.entries(byPayType)) {
      const channel = matchPayTypeToChannel(payType, channels);
      if (channel) revenue[channel.id] = (revenue[channel.id] || 0) + amount;
      else unmatched.add(payType);
    }
    month.days[date] = { ...existingDay, revenue, revenueSource: 'iiko' };
    daysUpdated += 1;
  }
  return { data, daysUpdated, unmatched: [...unmatched] };
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
    const revenueByDay = await fetchRevenueByDay(serverUrl, token, from, to);
    const payoutExpenses = await fetchPayoutExpenses(serverUrl, token, from, to);

    // Читаем текущие данные напрямую из Supabase (service-role — в обход RLS).
    const getResp = await fetch(`${supabaseUrl}/rest/v1/restaurant_data?restaurant_id=eq.${RESTAURANT_ID}&select=id,data`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
    });
    if (!getResp.ok) throw new Error(`Не удалось прочитать данные из Supabase (${getResp.status}).`);
    const rows = await getResp.json();
    const row = rows?.[0];
    if (!row) throw new Error('Строка restaurant_data не найдена — сначала откройте приложение хотя бы раз, чтобы она создалась.');

    const { data: withInvoices, added, filledIn, newSuppliers } = mergeInvoicesIntoData(row.data || {}, invoices);
    const { data: withRevenue, daysUpdated, unmatched } = mergeRevenueIntoData(withInvoices, revenueByDay);

    // Расходы (изъятия наличных) — категоризируем только те, что ещё не обрабатывали
    // раньше (settings.iikoExpensesSyncedKeys — тот же список, что используется при
    // ручной синхронизации на "Входящие отчёты"/Дашборде, дедуп общий для всех путей).
    withRevenue.settings = withRevenue.settings || {};
    const syncedKeys = new Set(withRevenue.settings.iikoExpensesSyncedKeys || []);
    const keyOf = (e) => `${e.date}::${e.comment}::${e.amount}`;
    const newExpenses = payoutExpenses.filter((e) => !syncedKeys.has(keyOf(e)));
    let expensesAdded = 0;
    let merged = withRevenue;
    if (newExpenses.length > 0) {
      const byDay = {};
      for (const e of newExpenses) { (byDay[e.date] ||= []).push(e); }
      const host = req.headers.host;
      const reports = await categorizeExpenses(host, byDay, withRevenue.settings, withRevenue.employees || []);
      const merged2 = mergeExpensesIntoData(withRevenue, reports);
      merged = merged2.data;
      expensesAdded = merged2.added;
      merged.settings.iikoExpensesSyncedKeys = [...syncedKeys, ...newExpenses.map(keyOf)];
    }

    if (added > 0 || filledIn > 0 || newSuppliers > 0 || daysUpdated > 0 || expensesAdded > 0) {
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

    res.status(200).json({ ok: true, from, to, invoicesFound: invoices.length, added, filledIn, newSuppliers, daysUpdated, unmatchedPayTypes: unmatched, expensesAdded });
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Не удалось выполнить автоматическую синхронизацию.' });
  } finally {
    if (token) await iikoLogout(serverUrl, token);
  }
}
