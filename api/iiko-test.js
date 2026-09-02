// Vercel Serverless Function: /api/iiko-test
// Тестовое подключение к iikoServer API (iikoRMS/iikoOffice). Авторизуется на сервере
// клиента, запрашивает OLAP-отчёт по продажам за один день и возвращает СЫРОЙ ответ —
// это НЕ финальная синхронизация, а разведывательный запрос, чтобы увидеть, какие поля
// реально доступны на конкретном сервере iiko, прежде чем строить точный маппинг в P&L.
// Логин/пароль/адрес сервера хранятся только на сервере (Vercel env vars), никогда не
// уходят на клиент.

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
  // iikoServer возвращает токен как обычный текст (не JSON).
  return text.trim();
}

async function iikoLogout(serverUrl, token) {
  try {
    await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/logout?key=${encodeURIComponent(token)}`);
  } catch (_) { /* best-effort */ }
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

  const { date } = req.body || {};
  // Сервер Vercel работает в UTC — new Date().toISOString() даёт "вчера" по московскому
  // времени с полуночи до 3 утра, поэтому явно берём московскую дату.
  const targetDate = date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  let token = null;
  try {
    token = await iikoAuth(serverUrl, login, password);

    const olapResp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportType: 'SALES',
        buildSummary: true,
        groupByRowFields: ['OpenDate.Typed', 'PayTypes'],
        groupByColFields: [],
        aggregateFields: ['DishDiscountSumInt', 'DishAmountInt'],
        filters: {
          'OpenDate.Typed': {
            filterType: 'DateRange',
            periodType: 'CUSTOM',
            from: targetDate,
            to: targetDate,
            includeLow: true,
            includeHigh: true
          }
        }
      })
    });

    const olapText = await olapResp.text();
    let olapJson = null;
    try { olapJson = JSON.parse(olapText); } catch (_) { /* оставим как текст, если не JSON */ }

    if (!olapResp.ok) {
      res.status(502).json({
        error: `Сервер iiko ответил ошибкой на OLAP-запрос (${olapResp.status}). Это нормально на этапе теста — значит нужно уточнить названия полей.`,
        raw: olapJson || olapText
      });
      return;
    }

    res.status(200).json({
      connected: true,
      date: targetDate,
      raw: olapJson || olapText,
      note: 'Это сырой ответ iiko. Пришлите его — по нему настроим точный маппинг на каналы выручки в P&L.'
    });
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Не удалось подключиться к серверу iiko.' });
  } finally {
    if (token) await iikoLogout(serverUrl, token);
  }
}
