// Vercel Serverless Function: /api/iiko-invoices
// Получает накладные от поставщиков за период через отчёт по проводкам (TRANSACTIONS,
// TransactionType=INVOICE). Группируем по дате и контрагенту (поставщику) — сумма
// приходования на склад ("Sum.Incoming") уже сама по себе равна сумме накладной, так
// как обе стороны проводки (задолженность/склад) при группировке без разбивки по счёту
// автоматически сворачиваются в одно число, без задвоения. Дополнительно вторым запросом
// получаем состав каждой накладной (товар + количество в собственной единице измерения
// товара — API не отдаёт саму единицу измерения, только число).

export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

import { createHash } from 'crypto';

function sha1Hex(str) {
  return createHash('sha1').update(str, 'utf8').digest('hex');
}

async function iikoAuth(serverUrl, login, password) {
  const url = `${serverUrl.replace(/\/$/, '')}/resto/api/auth?login=${encodeURIComponent(login)}&pass=${sha1Hex(password)}`;
  const resp = await fetch(url);
  const text = await resp.text();
  if (!resp.ok) {
    const err = new Error(`Ошибка авторизации на сервере iiko (${resp.status}): ${text.slice(0, 300)}`);
    err.status = resp.status;
    throw err;
  }
  return text.trim();
}

async function iikoLogout(serverUrl, token) {
  try { await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/logout?key=${encodeURIComponent(token)}`); } catch (_) {}
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const authHeader = req.headers.authorization || '';
  const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!supabaseUrl || !supabaseAnonKey) { res.status(500).json({ error: 'Supabase не настроен на сервере.' }); return; }
  if (!userToken) { res.status(401).json({ error: 'Требуется авторизация.' }); return; }
  try {
    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: `Bearer ${userToken}`, apikey: supabaseAnonKey } });
    if (!userResp.ok) { res.status(401).json({ error: 'Сессия недействительна. Войдите заново.' }); return; }
  } catch (e) { res.status(401).json({ error: 'Не удалось проверить авторизацию.' }); return; }

  const serverUrl = process.env.IIKO_SERVER_URL;
  const login = process.env.IIKO_API_LOGIN;
  const password = process.env.IIKO_API_PASSWORD;
  if (!serverUrl || !login || !password) {
    res.status(500).json({ error: 'iiko не настроен: добавьте IIKO_SERVER_URL, IIKO_API_LOGIN, IIKO_API_PASSWORD в Environment Variables на Vercel.' });
    return;
  }

  const { from, to } = req.body || {};
  if (!from || !to) { res.status(400).json({ error: 'Не указан диапазон дат.' }); return; }

  let token = null;
  try {
    token = await iikoAuth(serverUrl, login, password);

    const resp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportType: 'TRANSACTIONS',
        buildSummary: false,
        groupByRowFields: ['DateTime.Typed', 'Counteragent.Name'],
        groupByColFields: [],
        aggregateFields: ['Sum.Incoming'],
        filters: {
          'DateTime.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true },
          'TransactionType': { filterType: 'IncludeValues', values: ['INVOICE'] }
        }
      })
    });
    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}

    if (!resp.ok) {
      res.status(502).json({ error: `Сервер iiko ответил ошибкой (${resp.status}).`, raw: json || text.slice(0, 1000) });
      return;
    }

    const rows = json?.data || [];
    const invoices = rows
      .map(r => ({
        date: (r['DateTime.Typed'] || '').slice(0, 10),
        supplier: (r['Counteragent.Name'] || '').replace(/"/g, '').replace(/\s+/g, ' ').trim() || 'Без названия',
        amount: Math.round((Number(r['Sum.Incoming']) || 0) * 100) / 100
      }))
      .filter(inv => inv.amount > 0 && inv.date)
      .sort((a, b) => a.date.localeCompare(b.date) || a.supplier.localeCompare(b.supplier));

    // Состав накладных (товар + количество + единица измерения) — тот же отчёт, но с
    // разбивкой по товару вместо дня целиком. Поле количества у iiko называется просто
    // "Amount" (без суффикса .Incoming, в отличие от Sum.Incoming), а единица измерения —
    // "Product.MeasureUnit" (даёт готовое "кг"/"шт"/"л" из справочника номенклатуры,
    // гадать по названию товара не нужно).
    let itemsByKey = {};
    try {
      const itemsResp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType: 'TRANSACTIONS',
          buildSummary: false,
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
      // Ошибку состава не считаем фатальной для всего эндпоинта — сумма важнее.
    } catch (_) {}

    for (const inv of invoices) {
      inv.items = itemsByKey[`${inv.date}::${inv.supplier}`] || [];
    }

    res.status(200).json({ from, to, invoices });
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Не удалось подключиться к серверу iiko.' });
  } finally {
    if (token) await iikoLogout(serverUrl, token);
  }
}
