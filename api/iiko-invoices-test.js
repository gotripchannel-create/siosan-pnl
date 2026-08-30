// Vercel Serverless Function: /api/iiko-invoices-test
// ЭКСПЕРИМЕНТАЛЬНЫЙ тестовый запрос для проверки, можно ли получить накладные
// от поставщиков через отчёт по проводкам (TRANSACTIONS). Ранее в этом же отчёте
// уже встречались проводки типа INVOICE (счёт «Задолженность перед поставщиками»),
// значит принципиально данные доступны — нужно проверить, можно ли получить их
// с разбивкой по поставщику, номеру документа и позициям, а не только общей суммой.
// Поля угаданы по общей структуре iiko OLAP — этот эндпоинт может вернуть ошибку
// с точным списком того, что сервер ожидает. Изолирован в отдельный файл.

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

async function olapAttempt(serverUrl, token, body) {
  const resp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { ok: resp.ok, status: resp.status, json, text };
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
  const dateTo = to || new Date().toISOString().slice(0, 10);
  const dateFrom = from || dateTo;

  let token = null;
  try {
    token = await iikoAuth(serverUrl, login, password);

    // Попытка №1: TRANSACTIONS с полями поставщика (без DocumentNumber — сервер сказал,
    // что такого поля нет).
    const bodyA = {
      reportType: 'TRANSACTIONS',
      buildSummary: false,
      groupByRowFields: ['DateTime.Typed', 'Counteragent.Name', 'Account.Name'],
      groupByColFields: [],
      aggregateFields: ['Sum.Incoming', 'Sum.Outgoing'],
      filters: {
        'DateTime.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from: dateFrom, to: dateTo, includeLow: true, includeHigh: true },
        'TransactionType': { filterType: 'IncludeValues', values: ['INVOICE'] }
      }
    };
    const attemptA = await olapAttempt(serverUrl, token, bodyA);

    // Попытка №2: reportType STOCK (правильное имя — сервер сам подсказал список типов:
    // STOCK, SALES, TRANSACTIONS, DELIVERIES) — пробуем минимальный набор полей.
    const bodyB = {
      reportType: 'STOCK',
      buildSummary: false,
      groupByRowFields: ['DocumentType', 'Counteragent.Name', 'Store.Name'],
      groupByColFields: [],
      aggregateFields: ['Amount', 'Sum'],
      filters: {
        'DocumentType': { filterType: 'IncludeValues', values: ['INCOMING_INVOICE'] }
      }
    };
    const attemptB = await olapAttempt(serverUrl, token, bodyB);

    // Попытка №3: STOCK с составом накладной — по товарам, на случай если попытка №2
    // сработает и захочется сразу увидеть позиции.
    const bodyC = {
      reportType: 'STOCK',
      buildSummary: false,
      groupByRowFields: ['DocumentType', 'Counteragent.Name', 'Product.Name', 'Date.Typed'],
      groupByColFields: [],
      aggregateFields: ['Amount', 'Sum'],
      filters: {
        'Date.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from: dateFrom, to: dateTo, includeLow: true, includeHigh: true },
        'DocumentType': { filterType: 'IncludeValues', values: ['INCOMING_INVOICE'] }
      }
    };
    const attemptC = await olapAttempt(serverUrl, token, bodyC);

    res.status(200).json({
      connected: true,
      from: dateFrom, to: dateTo,
      attempt_TRANSACTIONS: { ok: attemptA.ok, status: attemptA.status, requestBody: bodyA, raw: attemptA.json ?? attemptA.text?.slice(0, 3000) },
      attempt_STOCK_min: { ok: attemptB.ok, status: attemptB.status, requestBody: bodyB, raw: attemptB.json ?? attemptB.text?.slice(0, 3000) },
      attempt_STOCK_items: { ok: attemptC.ok, status: attemptC.status, requestBody: bodyC, raw: attemptC.json ?? attemptC.text?.slice(0, 3000) },
      note: 'Три попытки получить накладные разными способами. Пришлите весь этот JSON целиком — по нему увидим, что реально доступно на вашей версии сервера.'
    });
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Не удалось подключиться к серверу iiko.' });
  } finally {
    if (token) await iikoLogout(serverUrl, token);
  }
}
