// Vercel Serverless Function: /api/iiko-expenses
// Получает изъятия наличных (TransactionType=PAYOUT) за период через отчёт по
// проводкам — те самые операции с кратким комментарием («закуп», «курьер», «калик»
// и т.п.), которые раньше нужно было переписывать вручную из бумажного чека. Дальше
// категоризацией по смыслу комментария занимается уже существующий ИИ-парсер
// (/api/parse-report), сюда просто отдаём сырой список — сумма и комментарий,
// сгруппированные по дате.

export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

import { createHash } from 'crypto';

function sha1Hex(str) {
  return createHash('sha1').update(str, 'utf8').digest('hex');
}

// Комментарий "зп" может быть с именем сотрудника ("зп курьер", "зп орхан",
// "рома зп") — считаем зарплатной выплатой, если "зп" встречается отдельным словом
// в любом месте комментария, а не только когда комментарий равен ровно "зп".
const isSalaryComment = (s) => String(s || '').toLowerCase().trim().split(/\s+/).includes('зп');

async function iikoAuth(serverUrl, login, password) {
  const url = `${serverUrl.replace(/\/$/, '')}/resto/api/auth?login=${encodeURIComponent(login)}&pass=${sha1Hex(password)}`;
  const resp = await fetch(url);
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Ошибка авторизации на сервере iiko (${resp.status}): ${text.slice(0, 300)}`);
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
        groupByRowFields: ['DateTime.Typed', 'Comment'],
        groupByColFields: [],
        aggregateFields: ['Sum.Incoming'],
        filters: {
          'DateTime.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true },
          'TransactionType': { filterType: 'IncludeValues', values: ['PAYOUT'] }
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
    const expenses = rows
      .map((r) => ({
        date: (r['DateTime.Typed'] || '').slice(0, 10),
        comment: String(r['Comment'] || '').replace(/\s+/g, ' ').trim().toLowerCase() || 'без комментария',
        amount: Math.round((Number(r['Sum.Incoming']) || 0) * 100) / 100
      }))
      .filter((e) => e.amount > 0 && e.date && e.comment !== 'дб' && !isSalaryComment(e.comment) && e.comment !== 'бк' && e.comment !== 'ошибка' && !e.comment.startsWith('закрытие кассовой смены')) // "дб" — не расход, "зп"-выплаты (в т.ч. с именем сотрудника) — уже учтены в ФОТ отдельно, "бк" — перенос остатка между сменами, "закрытие кассовой смены" — системная запись
      .sort((a, b) => a.date.localeCompare(b.date));

    res.status(200).json({ from, to, expenses });
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Не удалось подключиться к серверу iiko.' });
  } finally {
    if (token) await iikoLogout(serverUrl, token);
  }
}
