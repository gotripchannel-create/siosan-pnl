// Vercel Serverless Function: /api/vk-callback
// Callback API ВКонтакте (Callback API сообщества). VK сам присылает сюда каждое новое
// сообщение в сообщество — мы прогоняем текст через тот же ИИ-парсер, что используется
// при ручной вставке (см. api/parse-report.js), и сохраняем результат как черновик в
// vk_report_drafts (status: 'pending'), откуда его уже видно на странице «Входящие
// отчёты» для проверки и подтверждения человеком — сам он ничего не публикует напрямую.
//
// Настройка на стороне ВКонтакте (Сообщество → Управление → Работа с API → Callback API):
// 1. Server URL: https://<ваш-домен>/api/vk-callback
// 2. Строка подтверждения — то, что VK покажет в этом поле, нужно положить в переменную
//    окружения VK_CONFIRMATION_CODE на Vercel (просто скопировать значение как есть).
// 3. Секретный ключ — придумайте случайную строку в самом VK и продублируйте её в
//    переменную окружения VK_CALLBACK_SECRET на Vercel.
// 4. Типы событий — включить «Входящее сообщение» (message_new).
// Также нужен VK_COMMUNITY_TOKEN — ключ доступа сообщества с правом "Сообщения"
// (Управление → Работа с API → Ключи доступа → Создать ключ → отметить "Сообщения").

export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

const RESTAURANT_ID = 'siosan';
const MODEL = 'claude-haiku-4-5-20251001';

// Тот же фиксированный список, что в ручном интерфейсе и в /api/parse-report — не
// даём модели придумывать свои формулировки категории закупок кухни.
const KITCHEN_CATEGORIES = ['Продукты', 'Напитки', 'Хозтовары кухни', 'Ремонт оборудования', 'Прочее'];
function normalizeKitchenCategory(raw) {
  const trimmed = String(raw || '').trim();
  const exact = KITCHEN_CATEGORIES.find((c) => c.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;
  const s = trimmed.toLowerCase();
  if (/продукт|закуп|еда|ингредиент|сырь|мясо|овощ|рыба|молоч|бакале|фрукт/.test(s)) return 'Продукты';
  if (/напит|вода|сок\b|пиво|вино|кола|лимонад|чай|кофе/.test(s)) return 'Напитки';
  if (/ремонт|поломк|запчаст|мастер/.test(s)) return 'Ремонт оборудования';
  if (/хозтовар|бытов|уборк|моющ|перчатк|пакет|стакан|салфет|канцеляр|расходник/.test(s)) return 'Хозтовары кухни';
  return 'Прочее';
}

const DEFAULT_GLOSSARY = `- «ДБ» или «Касса фактически» — сумма, которая физически оказалась в кассе на конец смены (сверка кассы). Это НЕ выручка и НЕ расход — клади её в отдельное поле registerCheck, никогда не добавляй в revenue/otherExpenses и не пиши в unmatchedLines (это не ошибка распознавания, а обычное сверочное поле).
- «Итого выручка» / «выручка итого» — явно указанная итоговая сумма выручки за день, идёт в totalHint.
- Число может стоять до или после названия поля («22352,2 Наличные» и «Наличные 22352,2» — одно и то же).
- Строки вида «11доставок» (без пробела) — то же самое, что «11 доставок».
- «Курьер ЗП» / «зп курьер» / «Курьер» с числом рядом — оплата курьеру за смену (courier.pay).
- «км» рядом с числом (например «75км», «36 км») — пробег курьера (courier.km).
- Расходы на закупку продуктов/товаров для кухни могут идти отдельными строками без общего заголовка «Покупки» — например «Магнит 535» (магазин), «Шариковые ручки 62», «Скрепки для степлера 140». Это относится к kitchenExpenses или otherExpenses в зависимости от того, похоже ли это на продукты/сырьё (kitchenExpenses) или на хозтовары/канцелярию/непродуктовое (otherExpenses).
- В конце отчёта иногда встречается список имён без сумм (например «Вика Леша Рома теть Оля») — это roster (кто работал в смену), не advances.`;

const REPORT_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    date: { type: ['string', 'null'], description: 'Дата этого отчёта в формате YYYY-MM-DD.' },
    revenue: { type: 'object', additionalProperties: { type: 'number' } },
    courier: { type: 'object', properties: { pay: { type: ['number', 'null'] }, km: { type: ['number', 'null'] }, deliveries: { type: ['number', 'null'] } } },
    promo: { type: 'object', properties: { pay: { type: ['number', 'null'] } } },
    kitchenExpenses: { type: 'array', items: { type: 'object', properties: { category: { type: 'string' }, amount: { type: 'number' } }, required: ['category', 'amount'] } },
    otherExpenses: { type: 'array', items: { type: 'object', properties: { category: { type: 'string' }, amount: { type: 'number' } }, required: ['category', 'amount'] } },
    advances: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, amount: { type: 'number' }, employeeId: { type: ['string', 'null'] } }, required: ['name', 'amount'] } },
    roster: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, employeeId: { type: ['string', 'null'] } }, required: ['name'] } },
    totalHint: { type: ['number', 'null'] },
    registerCheck: { type: ['number', 'null'] },
    unmatchedLines: { type: 'array', items: { type: 'string' } }
  },
  required: ['date', 'revenue', 'courier', 'promo', 'kitchenExpenses', 'otherExpenses', 'advances', 'roster', 'totalHint', 'registerCheck', 'unmatchedLines']
};

const TOOL_SCHEMA = {
  name: 'submit_parsed_reports',
  description: 'Отправить список распознанных дневных отчётов.',
  input_schema: { type: 'object', properties: { reports: { type: 'array', items: REPORT_ITEM_SCHEMA } }, required: ['reports'] }
};

function buildSystemPrompt({ revenueChannels, employees, expenseCategories, fallbackDate, glossary }) {
  const channelsList = revenueChannels.map((c) => `- id="${c.id}" name="${c.name}"`).join('\n') || '(нет настроенных каналов)';
  const employeesList = employees.map((e) => `- id="${e.id}" name="${e.name}"`).join('\n') || '(нет сотрудников)';
  const categoriesList = (expenseCategories || []).join(', ') || '(не заданы)';
  const fullGlossary = [DEFAULT_GLOSSARY, glossary].filter(Boolean).join('\n');
  const kitchenCategoriesList = KITCHEN_CATEGORIES.join(', ');
  return `Ты разбираешь ОДНО сообщение из рабочего чата ВК кафе. Найди в нём финансовый отчёт (обычно есть «наличные», «карта» и «итого выручка» с числами) и верни его через submit_parsed_reports. Если это не отчёт (обычная переписка, вопрос, приветствие) — верни пустой массив reports, ничего не выдумывай.

Сегодняшняя дата (если в тексте нет явной даты): ${fallbackDate}

Каналы выручки (используй ТОЛЬКО эти id в поле revenue):
${channelsList}

Сотрудники (сопоставляй имена из текста с этим списком по имени; если сомневаешься — employeeId null):
${employeesList}

Известные категории прочих расходов: ${categoriesList}

Категории закупок для кухни/бара (поле category у kitchenExpenses) — ОБЯЗАТЕЛЬНО используй РОВНО одно из этих названий, ничего не придумывай своими словами:
${kitchenCategoriesList}

Словарь терминов и правил:
${fullGlossary}

Общие правила:
1. Неизвестные термины — в unmatchedLines с кратким пояснением, не угадывай.
2. totalHint — только если в тексте явно есть итоговая сумма выручки.
3. Все суммы — положительные числа, разделитель точка.
4. Вызови submit_parsed_reports ровно один раз.`;
}

function postprocess(raw, { revenueChannels, employees }) {
  const channelIds = new Set(revenueChannels.map((c) => c.id));
  const empById = new Map(employees.map((e) => [e.id, e]));
  const revenue = {};
  Object.entries(raw.revenue || {}).forEach(([id, val]) => { if (channelIds.has(id) && typeof val === 'number' && Number.isFinite(val)) revenue[id] = val; });
  const advances = (raw.advances || []).map((a) => { const emp = a.employeeId ? empById.get(a.employeeId) : null; return { name: a.name || '', amount: Number(a.amount) || 0, employeeId: emp ? emp.id : null, matchedName: emp ? emp.name : null }; });
  const rosterMatches = (raw.roster || []).map((r) => { const emp = r.employeeId ? empById.get(r.employeeId) : null; return { raw: r.name || '', employeeId: emp ? emp.id : null, matchedName: emp ? emp.name : null }; });
  return {
    date: raw.date || null, revenue,
    courier: { pay: raw.courier?.pay ?? null, km: raw.courier?.km ?? null, deliveries: raw.courier?.deliveries ?? null },
    promo: { pay: raw.promo?.pay ?? null },
    kitchenExpenses: (raw.kitchenExpenses || []).map((e) => ({ category: normalizeKitchenCategory(e.category), amount: Number(e.amount) || 0 })),
    otherExpenses: (raw.otherExpenses || []).map((e) => ({ category: e.category || 'Прочий расход', amount: Number(e.amount) || 0 })),
    advances, rosterMatches,
    unmatchedLines: raw.unmatchedLines || [],
    totalHint: typeof raw.totalHint === 'number' ? raw.totalHint : null,
    registerCheck: typeof raw.registerCheck === 'number' ? raw.registerCheck : null
  };
}

async function callClaude(apiKey, systemPrompt, text) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: systemPrompt, messages: [{ role: 'user', content: String(text) }], tools: [TOOL_SCHEMA], tool_choice: { type: 'tool', name: 'submit_parsed_reports' } })
  });
  if (!resp.ok) throw new Error(`Claude API ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
  return resp.json();
}

async function getSenderName(userId, communityToken) {
  if (!userId || userId < 0) return null; // отрицательный id = сообщение от имени сообщества, не человек
  try {
    const resp = await fetch(`https://api.vk.com/method/users.get?user_ids=${userId}&access_token=${communityToken}&v=5.199`);
    const json = await resp.json();
    const u = json?.response?.[0];
    return u ? `${u.first_name} ${u.last_name}`.trim() : null;
  } catch (_) { return null; }
}

export default async function handler(req, res) {
  const body = req.body || {};

  // 1. Подтверждение сервера — VK один раз запрашивает это при настройке Callback API.
  if (body.type === 'confirmation') {
    res.status(200).send(process.env.VK_CONFIRMATION_CODE || '');
    return;
  }

  // 2. Проверка секретного ключа — защита от чужих запросов на этот адрес.
  const expectedSecret = process.env.VK_CALLBACK_SECRET;
  if (expectedSecret && body.secret !== expectedSecret) {
    res.status(200).send('ok'); // отвечаем "ok", чтобы VK не долбил повторными попытками, но ничего не делаем
    return;
  }

  // VK ждёт "ok" быстро — на любое другое/неизвестное событие сразу подтверждаем.
  if (body.type !== 'message_new') {
    res.status(200).send('ok');
    return;
  }

  // Отвечаем VK сразу, а обработку делаем ниже — но т.к. serverless-функция может
  // прерваться сразу после ответа, обработку выполняем СИНХРОННО перед ответом.
  // Claude Haiku обычно укладывается в 1-3 секунды, VK терпит такую задержку.
  try {
    const message = body.object?.message;
    if (!message?.text?.trim()) { res.status(200).send('ok'); return; }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const communityToken = process.env.VK_COMMUNITY_TOKEN;
    if (!supabaseUrl || !serviceRoleKey || !apiKey) { res.status(200).send('ok'); return; } // не настроено — молча выходим, чтобы VK не ретраил бесконечно

    // Идемпотентность: если это сообщение уже обработано (VK иногда шлёт повторно),
    // не создаём дубль черновика.
    const dedupeResp = await fetch(`${supabaseUrl}/rest/v1/vk_report_drafts?restaurant_id=eq.${RESTAURANT_ID}&vk_message_id=eq.${message.id}&select=id`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
    });
    const dedupeRows = await dedupeResp.json().catch(() => []);
    if (Array.isArray(dedupeRows) && dedupeRows.length > 0) { res.status(200).send('ok'); return; }

    // Настройки (каналы выручки, сотрудники, категории, словарь) — из общих данных
    // приложения, читаем напрямую из Supabase через service-role ключ.
    const dataResp = await fetch(`${supabaseUrl}/rest/v1/restaurant_data?restaurant_id=eq.${RESTAURANT_ID}&select=data`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
    });
    const dataRows = await dataResp.json().catch(() => []);
    const appData = dataRows?.[0]?.data || {};
    const settings = appData.settings || {};
    const employees = appData.employees || [];

    const fallbackDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const systemPrompt = buildSystemPrompt({
      revenueChannels: settings.revenueChannels || [], employees,
      expenseCategories: settings.expenseCategories || [], fallbackDate,
      glossary: settings.reportGlossary || ''
    });

    const claudeData = await callClaude(apiKey, systemPrompt, message.text);
    const toolUse = (claudeData.content || []).find((b) => b.type === 'tool_use' && b.name === 'submit_parsed_reports');
    const reports = (toolUse?.input?.reports || []).map((r) => postprocess(r, { revenueChannels: settings.revenueChannels || [], employees }));

    if (reports.length > 0) {
      const senderName = await getSenderName(message.from_id, communityToken);
      const rows = reports.map((parsed) => ({
        restaurant_id: RESTAURANT_ID,
        sender_name: senderName || 'ВК (сообщество)',
        message_date: parsed.date || fallbackDate,
        vk_message_id: message.id,
        parsed,
        status: 'pending'
      }));
      await fetch(`${supabaseUrl}/rest/v1/vk_report_drafts`, {
        method: 'POST',
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(rows)
      });
    }

    res.status(200).send('ok');
  } catch (err) {
    // Всегда отвечаем "ok", даже при внутренней ошибке — иначе VK будет бесконечно
    // повторять доставку одного и того же сообщения. Ошибку просто теряем (можно
    // при желании логировать в отдельную таблицу по аналогии с ai_parse_logs).
    res.status(200).send('ok');
  }
}
