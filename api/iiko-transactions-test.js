// Vercel Serverless Function: /api/iiko-transactions-test
// ЭКСПЕРИМЕНТАЛЬНЫЙ тестовый запрос к OLAP-отчёту ПО ПРОВОДКАМ (не по продажам).
// Гипотеза: именно здесь можно получить каждую отдельную операцию внесения/изъятия
// наличных со своим комментарием («заказ», «АБ», «ошибка» и т.п.) — то, чего нет
// в сводке по смене (/resto/api/v2/cashshifts/list), где всё лежит одной суммой.
// Поля угаданы по общедоступным описаниям отчёта по проводкам — этот эндпоинт может
// вернуть ошибку с точным списком того, что сервер ожидает. Изолирован в отдельный
// файл, чтобы не сломать уже работающий дашборд выручки.

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

  const { date } = req.body || {};
  const targetDate = date || new Date().toISOString().slice(0, 10);

  let token = null;
  try {
    token = await iikoAuth(serverUrl, login, password);

    // Попытка №1: минимальный набор полей, максимально близкий к тому, что видно
    // на бумажном чеке — тип проводки, счёт, комментарий, сумма, дата/время.
    const body = {
      reportType: 'TRANSACTIONS',
      buildSummary: false,
      groupByRowFields: ['DateTime.Typed', 'TransactionType', 'Account.Name', 'Comment'],
      groupByColFields: [],
      aggregateFields: ['Sum.Incoming', 'Sum.Outgoing'],
      filters: {
        'DateTime.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from: targetDate, to: targetDate, includeLow: true, includeHigh: true }
      }
    };

    const resp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}

    if (!resp.ok) {
      res.status(502).json({
        error: `Отчёт по проводкам ответил ошибкой (${resp.status}). Это ожидаемо на этапе теста — поля могли называться иначе на вашей версии сервера.`,
        requestBody: body,
        raw: (json || text) ? (typeof (json || text) === 'string' ? (json || text).slice(0, 3000) : json) : null
      });
      return;
    }

    res.status(200).json({
      connected: true,
      date: targetDate,
      requestBody: body,
      raw: json ?? text.slice(0, 5000),
      note: 'Сырой ответ отчёта по проводкам. Пришлите его целиком — по нему найдём поле с комментарием к внесениям.'
    });
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Не удалось подключиться к серверу iiko.' });
  } finally {
    if (token) await iikoLogout(serverUrl, token);
  }
}
