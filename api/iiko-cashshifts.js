// Vercel Serverless Function: /api/iiko-cashshifts
// Внесения/изъятия из кассы за диапазон дат. Отдельная область данных от OLAP-отчёта
// по продажам — берётся из /resto/api/v2/cashshifts/list. Как и весь дашборд iiko,
// это read-only витрина: ничего не применяется в P&L автоматически.
// Примечание: отдельного поля «инкассация» в структуре iiko нет — она входит в payOut
// (изъятия) как один из видов изъятия, отдельно не выделяется на уровне API.

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

    const url = `${serverUrl.replace(/\/$/, '')}/resto/api/v2/cashshifts/list?openDateFrom=${from}&openDateTo=${to}&status=ANY&key=${encodeURIComponent(token)}`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const text = await resp.text();
    let shifts = null;
    try { shifts = JSON.parse(text); } catch (_) {}

    if (!resp.ok) {
      res.status(502).json({ error: `Сервер iiko ответил ошибкой (${resp.status}).`, raw: text.slice(0, 2000) });
      return;
    }

    const list = Array.isArray(shifts) ? shifts : [];

    // Отсеиваем «фантомные» смены — техническое открытие и мгновенное закрытие без
    // реальной работы (перезапуск кассы, сбой и т.п.). Признаки: либо вообще нет
    // никакой финансовой активности (все суммы нулевые), либо смена закрылась
    // практически сразу после открытия (меньше 2 минут) — за это время реальная
    // смена отработать не могла.
    const isPhantomShift = (s) => {
      const noActivity = !(Number(s.payIn) || Number(s.payOut) || Number(s.salesCash) || Number(s.salesCard) || Number(s.sessionStartCash));
      let tooShort = false;
      if (s.openDate && s.closeDate) {
        const durationMs = new Date(s.closeDate) - new Date(s.openDate);
        tooShort = durationMs >= 0 && durationMs < 2 * 60 * 1000;
      }
      return noActivity || tooShort;
    };

    const realShifts = list.filter(s => !isPhantomShift(s));
    const skippedCount = list.length - realShifts.length;

    let totalPayIn = 0, totalPayOut = 0, totalStartCash = 0;

    const items = realShifts.map(s => {
      totalPayIn += Number(s.payIn) || 0;
      totalPayOut += Number(s.payOut) || 0;
      totalStartCash += Number(s.sessionStartCash) || 0;
      return {
        date: (s.openDate || '').slice(0, 10),
        sessionNumber: s.sessionNumber,
        openDate: s.openDate,
        closeDate: s.closeDate,
        status: s.sessionStatus,
        sessionStartCash: Number(s.sessionStartCash) || 0,
        payIn: Number(s.payIn) || 0,
        payOut: Number(s.payOut) || 0,
        salesCash: Number(s.salesCash) || 0,
        salesCard: Number(s.salesCard) || 0,
        cashRemain: s.cashRemain != null ? Number(s.cashRemain) : null,
        cashDiff: s.cashDiff != null ? Number(s.cashDiff) : null
      };
    }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    res.status(200).json({
      from, to,
      shifts: items,
      totalPayIn: Math.round(totalPayIn * 100) / 100,
      totalPayOut: Math.round(totalPayOut * 100) / 100,
      totalStartCash: Math.round(totalStartCash * 100) / 100,
      skippedPhantomShifts: skippedCount,
      note: 'Отдельного поля «инкассация» в API нет — она входит в изъятия (payOut) как один из видов изъятия.'
    });
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Не удалось подключиться к серверу iiko.' });
  } finally {
    if (token) await iikoLogout(serverUrl, token);
  }
}
