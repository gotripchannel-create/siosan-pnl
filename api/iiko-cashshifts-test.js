// Vercel Serverless Function: /api/iiko-cashshifts-test
// ЭКСПЕРИМЕНТАЛЬНЫЙ тестовый запрос кассовых смен (внесения/изъятия/инкассация).
// Это отдельная область API от OLAP-отчётов по продажам — намеренно изолирована в
// собственный эндпоинт, чтобы неудача здесь не ломала уже работающий дашборд выручки.
// Возвращает сырой ответ сервера для разбора — если сработает, на основе реальной
// структуры допишем интеграцию в основной дашборд.

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

    const url = `${serverUrl.replace(/\/$/, '')}/resto/api/v2/cashshifts/list?openDateFrom=${targetDate}&openDateTo=${targetDate}&status=ANY&key=${encodeURIComponent(token)}`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}

    if (!resp.ok) {
      res.status(502).json({
        error: `Эндпоинт кассовых смен ответил ошибкой (${resp.status}). Это ожидаемо на этапе теста.`,
        raw: (json || text) ? JSON.stringify(json || text).slice(0, 3000) : null
      });
      return;
    }

    res.status(200).json({
      connected: true,
      date: targetDate,
      raw: json ?? text.slice(0, 5000),
      note: 'Сырой ответ по кассовым сменам. Пришлите его — по нему настроим внесения/изъятия/инкассацию в дашборде.'
    });
  } catch (err) {
    const msg = err?.message || '';
    if (/terminated|aborted|timeout/i.test(msg)) {
      res.status(502).json({ error: 'Соединение оборвалось на этом эндпоинте (та же картина, что была с меню) — похоже, права техпользователя не покрывают кассовые смены, либо путь другой на вашей версии сервера.' });
    } else {
      res.status(502).json({ error: msg || 'Не удалось подключиться к серверу iiko.' });
    }
  } finally {
    if (token) await iikoLogout(serverUrl, token);
  }
}
