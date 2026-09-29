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

function decodeXml(value = '') {
  return String(value)
    .replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

function tagValue(xml, names) {
  for (const name of names) {
    const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return decodeXml(match[1].replace(/<[^>]+>/g, ' '));
  }
  return '';
}

function nestedId(xml, tag) {
  const outer = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return outer ? tagValue(outer[1], ['id', 'guid', 'uuid']) : '';
}

function parseRollsFromProductsXml(xml) {
  const blocks = [...xml.matchAll(/<(productDto|productGroupDto)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)]
    .map(([, tag, body]) => ({ tag, body }));
  const entries = blocks.map(({ tag, body }) => {
    const id = tagValue(body, ['id', 'guid', 'uuid']);
    const name = tagValue(body, ['name', 'productName', 'title']);
    const type = tagValue(body, ['type', 'productType', 'entityType']).toLowerCase();
    const parentId = tagValue(body, ['parentGroupId', 'parentId', 'parentCategoryId'])
      || nestedId(body, 'parentGroup') || nestedId(body, 'parent');
    const parentName = tagValue(body, ['parentGroupName', 'parentName', 'parentCategoryName']);
    const composition = tagValue(body, ['composition', 'ingredients', 'description', 'productDescription', 'descriptionForGuests']);
    const isGroup = tag === 'productGroupDto' || /group|category/.test(type);
    return { id, name, type, parentId, parentName, composition, isGroup };
  }).filter(item => item.id && item.name);

  const groups = new Map(entries.filter(item => item.isGroup).map(item => [item.id, item]));
  const lineage = (item) => {
    const names = item.parentName ? [item.parentName] : [];
    let parent = groups.get(item.parentId);
    const seen = new Set();
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      names.unshift(parent.name);
      parent = groups.get(parent.parentId);
    }
    return names.filter(Boolean);
  };

  const rolls = entries.filter(item => {
    if (item.isGroup || /modifier|size/.test(item.type)) return false;
    const categoryPath = lineage(item).join(' / ');
    return /ролл/i.test(categoryPath) || /ролл/i.test(item.name);
  }).map(item => {
    const categoryParts = lineage(item);
    const rollCategory = [...categoryParts].reverse().find(name => /ролл/i.test(name)) || categoryParts.at(-1) || 'Роллы';
    return {
      category: rollCategory,
      name: item.name,
      composition: item.composition || 'Состав не указан в номенклатуре iiko'
    };
  }).sort((a, b) => a.category.localeCompare(b.category, 'ru') || a.name.localeCompare(b.name, 'ru'));

  return { parsedCount: entries.length, rolls };
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
  try { await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/logout?key=${encodeURIComponent(token)}`); } catch (_) { /* некритично: сессия сама истечёт по таймауту на сервере iiko */ }
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
    const parsed = parseRollsFromProductsXml(productsText);

    res.status(200).json({
      connected: true,
      format: 'xml',
      totalCount,
      totalLength: productsText.length,
      parsedCount: parsed.parsedCount,
      rolls: parsed.rolls,
      note: 'Найденные роллы взяты из категорий и номенклатуры iiko. Состав берётся из поля описания/состава, если оно заполнено в iiko.'
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
