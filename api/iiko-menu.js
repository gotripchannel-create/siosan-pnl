// Vercel Serverless Function: /api/iiko-menu
// Читает текущее меню из iikoServer (категории, блюда, цены). ТОЛЬКО ЧТЕНИЕ —
// это первый шаг перед добавлением редактирования: сначала нужно увидеть реальную
// структуру меню на конкретном сервере (номенклатура iiko довольно сложная: группы,
// категории, товары, модификаторы, размеры, ценовые категории), прежде чем писать
// код, который будет туда что-то менять. Изменение живого меню, по которому прямо
// сейчас пробивают чеки, — гораздо более рискованная операция, чем просто чтение
// отчётов, поэтому CRUD добавляется отдельным шагом после того, как увидим ответ.

export const config = { runtime: 'nodejs' };
export const maxDuration = 60; // список меню может быть большим — стандартных 10 сек может не хватить

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

  let token = null;
  try {
    token = await iikoAuth(serverUrl, login, password);

    // Пробуем классический эндпоинт /resto/api/products (XML) — он проще и легче,
    // чем /resto/api/v2/entities/products/list, который у вас на сервере обрывался
    // ещё до истечения тайм-аута (значит дело не в нашем лимите времени, а в самом
    // сервере/прокси iiko на этом конкретном пути).
    const productsResp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/products?key=${encodeURIComponent(token)}&includeDeleted=false`, {
      headers: { 'Accept': 'application/xml, text/xml, */*' }
    });
    const productsText = await productsResp.text();

    if (!productsResp.ok) {
      res.status(502).json({
        error: `Сервер iiko ответил ошибкой на запрос меню (${productsResp.status}).`,
        raw: productsText.slice(0, 3000)
      });
      return;
    }

    const totalCount = (productsText.match(/<productDto>/g) || []).length || null;

    res.status(200).json({
      connected: true,
      format: 'xml',
      totalCount,
      totalLength: productsText.length,
      preview: productsText.slice(0, 8000),
      note: 'Это XML-ответ (первые 8000 символов). Пришлите этот текст — по нему настроим редактирование меню.'
    });
  } catch (err) {
    const msg = err?.message || '';
    if (/terminated|aborted|timeout/i.test(msg)) {
      res.status(502).json({ error: 'Соединение оборвалось (не наш тайм-аут — это либо сам сервер iiko, либо прокси/защита перед ним обрывает запрос на этом пути). Нужно уточнить у поддержки iiko, есть ли ограничения на объём ответа для API-пользователей.' });
    } else {
      res.status(502).json({ error: msg || 'Не удалось подключиться к серверу iiko.' });
    }
  } finally {
    if (token) await iikoLogout(serverUrl, token);
  }
}
