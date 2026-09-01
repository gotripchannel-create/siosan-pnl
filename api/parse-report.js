// Vercel Serverless Function: /api/parse-report
// Принимает текст (может быть одно сообщение ИЛИ целиком скопированный кусок чата за
// несколько дней вперемешку с обычной перепиской), просит Claude извлечь СПИСОК
// структурированных дневных отчётов, игнорируя всё, что отчётом не является.
// Формат каждого отчёта в массиве — тот же, что у старого регексового parseVkReport
// (src/vk-report-parser.js), чтобы фронтенду не нужно было меняться.

export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

const MODEL = 'claude-haiku-4-5-20251001'; // быстрый и дешёвый, достаточно для извлечения полей из текста
const MODEL_VISION = 'claude-sonnet-4-6'; // для фото Z-отчётов — нужнее точность распознавания мелкого текста на чеке, чем скорость

// Базовый словарь терминов, собранный из реальных отчётов сотрудников СиоСан.
// Настройки могут добавить свои термины поверх этого (settings.reportGlossary),
// они склеиваются вместе и уходят в системный промпт.
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
    date: {
      type: ['string', 'null'],
      description: 'Дата этого отчёта в формате YYYY-MM-DD. Бери из явной даты внутри текста отчёта, если она есть. Если внутри текста даты нет — используй дату из ближайшего заголовка-разделителя дня выше по тексту (например «26 августа», «вчера»). Если определить невозможно — null.'
    },
    revenue: {
      type: 'object',
      description: 'Выручка по каналам. Ключ — ТОЧНО id канала из списка revenueChannels (не название!). Значение — сумма числом.',
      additionalProperties: { type: 'number' }
    },
    courier: {
      type: 'object',
      properties: {
        pay: { type: ['number', 'null'] },
        km: { type: ['number', 'null'] },
        deliveries: { type: ['number', 'null'] }
      }
    },
    promo: {
      type: 'object',
      properties: { pay: { type: ['number', 'null'] } }
    },
    kitchenExpenses: {
      type: 'array',
      items: {
        type: 'object',
        properties: { category: { type: 'string' }, amount: { type: 'number' } },
        required: ['category', 'amount']
      }
    },
    otherExpenses: {
      type: 'array',
      items: {
        type: 'object',
        properties: { category: { type: 'string' }, amount: { type: 'number' } },
        required: ['category', 'amount']
      }
    },
    advances: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          amount: { type: 'number' },
          employeeId: { type: ['string', 'null'] }
        },
        required: ['name', 'amount']
      }
    },
    roster: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, employeeId: { type: ['string', 'null'] } },
        required: ['name']
      }
    },
    totalHint: { type: ['number', 'null'] },
    registerCheck: {
      type: ['number', 'null'],
      description: 'Сумма «ДБ» / «Касса фактически» — сколько физически денег оказалось в кассе на конец смены. Это сверочное поле, НЕ выручка и НЕ расход, не входит ни в revenue, ни в otherExpenses.'
    },
    unmatchedLines: { type: 'array', items: { type: 'string' } }
  },
  required: ['date', 'revenue', 'courier', 'promo', 'kitchenExpenses', 'otherExpenses', 'advances', 'roster', 'totalHint', 'registerCheck', 'unmatchedLines']
};

const TOOL_SCHEMA = {
  name: 'submit_parsed_reports',
  description: 'Отправить список распознанных дневных отчётов.',
  input_schema: {
    type: 'object',
    properties: {
      reports: {
        type: 'array',
        description: 'Один элемент на каждый распознанный дневной отчёт. Если в тексте один отчёт — массив из одного элемента. Если отчётов не найдено вообще — пустой массив.',
        items: REPORT_ITEM_SCHEMA
      }
    },
    required: ['reports']
  }
};

function buildSystemPrompt({ revenueChannels, employees, expenseCategories, fallbackDate, glossary }) {
  const channelsList = revenueChannels.map(c => `- id="${c.id}" name="${c.name}"`).join('\n') || '(нет настроенных каналов)';
  const employeesList = employees.map(e => `- id="${e.id}" name="${e.name}"`).join('\n') || '(нет сотрудников)';
  const categoriesList = (expenseCategories || []).join(', ') || '(не заданы)';
  const fullGlossary = [DEFAULT_GLOSSARY, glossary].filter(Boolean).join('\n');

  return `Ты разбираешь либо (а) текст, скопированный из рабочего чата ВК кафе/службы доставки, либо (б) фото бумажного Z-отчёта (отчёт о закрытии смены) из кассы iiko.

Если это ТЕКСТ ИЗ ВК — он может быть одним чистым сообщением с отчётом за один день, ИЛИ целиком скопированным куском истории чата за несколько дней, где вперемешку идут реальные отчёты, обычная переписка, приветствия, вопросы сотрудников, имена отправителей сообщений и т.п. Твоя задача — найти ВСЕ настоящие финансовые отчёты в тексте (обычно это сообщения, где явно посчитана выручка: есть «наличные», «карта/карты» и «итого выручка» с числами) и вернуть их списком через submit_parsed_reports. Всё остальное — приветствия, вопросы не про деньги, имена отправителей сообщений, реакции — полностью игнорируй, НЕ добавляй в unmatchedLines (unmatchedLines — только для строк ВНУТРИ найденного отчёта, которые ты не смог классифицировать).

Если это ФОТО Z-ОТЧЁТА — на чеке обычно есть разделы «Продажи» (выручка по способам оплаты — Банковские карты, Наличные и т.п.), «Списания» (удаления блюд), и «Внесения и изъятия» / «Движение наличных средств», где перечислены отдельные операции «Внесение наличных» или «Оплата услуг» с коротким комментарием (например «закуп», «зп», «курьер», «калик», «дб»). Твоя задача — извлечь выручку по способам оплаты (в поле revenue) и КАЖДУЮ операцию изъятия/оплаты услуг превратить в отдельную строку kitchenExpenses или otherExpenses, САМОСТОЯТЕЛЬНО определив категорию по смыслу комментария и известному списку категорий ниже (например, «закуп» обычно значит закупка продуктов → kitchenExpenses; «курьер» → скорее всего otherExpenses с категорией, похожей на оплату курьера, или заполни courier.pay, если это явно оплата курьеру; комментарий «дб» — это перенос/начальный остаток кассы, НЕ расход, полностью игнорируй такие строки, не добавляй их никуда). Если комментарий совсем не по этому объясняет что расход — используй ближайшую подходящую категорию из списка ниже, а если категория совсем непонятна — категория «Прочее» и обязательно кратко поясни в unmatchedLines, что это была за строка на чеке и почему не удалось точно определить категорию.

Сегодняшняя дата (если нигде нет явной даты): ${fallbackDate}

Каналы выручки (используй ТОЛЬКО эти id в поле revenue):
${channelsList}

Сотрудники (сопоставляй имена из текста с этим списком по имени; если сомневаешься — employeeId null):
${employeesList}

Известные категории прочих расходов (не обязательно, но если подходит — используй): ${categoriesList}

Словарь терминов и правил, специфичных для этого бизнеса:
${fullGlossary}

Общие правила:
1. Если встречается сокращение или термин, значение которого не очевидно из контекста и не описано в словаре выше — НЕ угадывай. Помести его в unmatchedLines этого отчёта с кратким пояснением почему не распознано.
2. totalHint заполняй, только если в тексте явно есть строка-итог по выручке. Не вычисляй его сам.
3. Все суммы — положительные числа, разделитель дробной части точка.
4. Вызови submit_parsed_reports ровно один раз со всеми найденными отчётами.`;
}

async function callClaude(apiKey, systemPrompt, { text, image }) {
  const content = [];
  if (image?.data && image?.mediaType) {
    content.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } });
    content.push({ type: 'text', text: 'Вот фото Z-отчёта. Извлеки данные согласно инструкции.' });
  } else {
    content.push({ type: 'text', text: String(text) });
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: image ? MODEL_VISION : MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: 'tool', name: 'submit_parsed_reports' }
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Claude API ${response.status}: ${errText.slice(0, 500)}`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

function postprocess(raw, { revenueChannels, employees }) {
  const channelIds = new Set(revenueChannels.map(c => c.id));
  const empById = new Map(employees.map(e => [e.id, e]));

  const revenue = {};
  Object.entries(raw.revenue || {}).forEach(([id, val]) => {
    if (channelIds.has(id) && typeof val === 'number' && Number.isFinite(val)) revenue[id] = val;
  });

  const advances = (raw.advances || []).map(a => {
    const emp = a.employeeId ? empById.get(a.employeeId) : null;
    return { name: a.name || '', amount: Number(a.amount) || 0, employeeId: emp ? emp.id : null, matchedName: emp ? emp.name : null };
  });

  const rosterMatches = (raw.roster || []).map(r => {
    const emp = r.employeeId ? empById.get(r.employeeId) : null;
    return { raw: r.name || '', employeeId: emp ? emp.id : null, matchedName: emp ? emp.name : null };
  });

  return {
    date: raw.date || null,
    revenue,
    courier: { pay: raw.courier?.pay ?? null, km: raw.courier?.km ?? null, deliveries: raw.courier?.deliveries ?? null },
    promo: { pay: raw.promo?.pay ?? null },
    kitchenExpenses: (raw.kitchenExpenses || []).map(e => ({ category: e.category || 'Покупки', amount: Number(e.amount) || 0 })),
    otherExpenses: (raw.otherExpenses || []).map(e => ({ category: e.category || 'Прочий расход', amount: Number(e.amount) || 0 })),
    advances,
    rosterMatches,
    unmatchedLines: raw.unmatchedLines || [],
    totalHint: typeof raw.totalHint === 'number' ? raw.totalHint : null,
    registerCheck: typeof raw.registerCheck === 'number' ? raw.registerCheck : null
  };
}

// Не блокирующий лог для отладки — пишем сырой вход/выход в Supabase от имени
// авторизованного пользователя. Если таблицы нет или запись не удалась — просто молчим,
// это вспомогательная функция, а не критичный путь.
async function logAttempt({ supabaseUrl, token, anonKey, payload }) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/ai_parse_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
  } catch (_) { /* best-effort, никогда не роняем основной запрос из-за лога */ }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // Внутренний вызов от фонового задания (cron-sync-invoices) — у него нет
  // пользовательской сессии, вместо неё сверяем уже настроенный секрет cron-задания.
  const internalSecret = req.headers['x-internal-secret'];
  const isInternalCall = !!process.env.CRON_SECRET && internalSecret === process.env.CRON_SECRET;

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'Supabase не настроен на сервере.' });
    return;
  }
  if (!token && !isInternalCall) {
    res.status(401).json({ error: 'Требуется авторизация.' });
    return;
  }
  if (!isInternalCall) {
    try {
      const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey }
      });
      if (!userResp.ok) {
        res.status(401).json({ error: 'Сессия недействительна. Войдите заново.' });
        return;
      }
    } catch (e) {
      res.status(401).json({ error: 'Не удалось проверить авторизацию.' });
      return;
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY не настроен на сервере. Добавьте переменную окружения в настройках проекта Vercel.' });
    return;
  }

  const {
    text,
    image, // { data: base64, mediaType: 'image/jpeg' }
    revenueChannels = [],
    employees = [],
    expenseCategories = [],
    fallbackDate = null,
    glossary = ''
  } = req.body || {};

  const hasText = text && String(text).trim();
  const hasImage = image?.data && image?.mediaType;

  if (!hasText && !hasImage) {
    res.status(400).json({ error: 'Пустой текст отчёта или фото.' });
    return;
  }
  if (hasText && String(text).length > 20000) {
    res.status(400).json({ error: 'Текст слишком длинный (максимум 20000 символов). Разбейте на несколько вставок.' });
    return;
  }
  if (hasImage && image.data.length > 8_000_000) { // ~6MB исходного файла в base64
    res.status(400).json({ error: 'Фото слишком большое (максимум ~6 МБ). Сожмите или сфотографируйте по частям.' });
    return;
  }

  const today = fallbackDate || new Date().toISOString().slice(0, 10);
  const systemPrompt = buildSystemPrompt({ revenueChannels, employees, expenseCategories, fallbackDate: today, glossary });

  try {
    const data = await callClaude(apiKey, systemPrompt, { text, image: hasImage ? image : null });
    const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'submit_parsed_reports');
    if (!toolUse) {
      res.status(502).json({ error: 'Модель не вернула структурированный результат. Попробуйте ещё раз.' });
      return;
    }
    const reports = (toolUse.input?.reports || []).map(r => postprocess(r, { revenueChannels, employees }));

    logAttempt({
      supabaseUrl, token, anonKey: supabaseAnonKey,
      payload: { input_text: hasImage ? '[фото Z-отчёта]' : String(text).slice(0, 8000), ai_output: reports, used_fallback: false, error: null }
    });

    res.status(200).json({ reports });
  } catch (err) {
    logAttempt({
      supabaseUrl, token, anonKey: supabaseAnonKey,
      payload: { input_text: hasImage ? '[фото Z-отчёта]' : String(text).slice(0, 8000), ai_output: null, used_fallback: false, error: String(err?.message || err).slice(0, 1000) }
    });
    res.status(502).json({ error: err?.message || 'Внутренняя ошибка сервера' });
  }
}
