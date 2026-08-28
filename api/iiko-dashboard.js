// Vercel Serverless Function: /api/iiko-dashboard
// Отдельный источник данных для дашборда iiko. НЕ пересекается с ручным вводом P&L —
// это read-only витрина «что реально происходит по кассе», без применения куда-либо.
// Забирает OLAP-отчёт по продажам за диапазон дат, группирует по дню и по способу оплаты.

export const config = { runtime: 'nodejs' };

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

    const olapResp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportType: 'SALES',
        buildSummary: false,
        groupByRowFields: ['OpenDate.Typed', 'PayTypes'],
        groupByColFields: [],
        aggregateFields: ['DishDiscountSumInt', 'DishAmountInt'],
        filters: {
          'OpenDate.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true }
        }
      })
    });

    const olapText = await olapResp.text();
    let olapJson = null;
    try { olapJson = JSON.parse(olapText); } catch (_) {}

    if (!olapResp.ok) {
      res.status(502).json({ error: `Сервер iiko ответил ошибкой (${olapResp.status}).`, raw: olapJson || olapText });
      return;
    }

    const rows = olapJson?.data || [];
    const byDay = new Map(); // date -> { total, byPayType: {} }
    const totalsByPayType = {};
    let grandTotal = 0;
    let totalChecks = 0;

    for (const row of rows) {
      const date = row['OpenDate.Typed'];
      const payType = row['PayTypes'] || 'Не указано';
      const amount = Number(row['DishDiscountSumInt']) || 0;
      const checks = Number(row['DishAmountInt']) || 0;
      if (/без оплаты/i.test(payType)) continue; // не считаем неоплаченные/открытые заказы выручкой

      if (!byDay.has(date)) byDay.set(date, { date, total: 0, byPayType: {} });
      const dayEntry = byDay.get(date);
      dayEntry.total += amount;
      dayEntry.byPayType[payType] = (dayEntry.byPayType[payType] || 0) + amount;

      totalsByPayType[payType] = (totalsByPayType[payType] || 0) + amount;
      grandTotal += amount;
      totalChecks += checks;
    }

    const days = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));

    res.status(200).json({
      from, to,
      days,
      totalsByPayType,
      grandTotal: Math.round(grandTotal * 100) / 100,
      totalChecks,
      avgCheck: totalChecks ? Math.round((grandTotal / totalChecks) * 100) / 100 : 0
    });
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Не удалось подключиться к серверу iiko.' });
  } finally {
    if (token) await iikoLogout(serverUrl, token);
  }
}
