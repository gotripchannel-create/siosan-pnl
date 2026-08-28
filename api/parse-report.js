
// Vercel Serverless Function: /api/parse-report
// Принимает текст отчёта из ВК + справочники (каналы выручки, сотрудники),
// просит Claude извлечь структурированные данные и возвращает объект
// в ТОМ ЖЕ формате, что и старый регексовый parseVkReport (src/vk-report-parser.js),
// чтобы фронтенду не пришлось меняться.

export const config = { runtime: 'nodejs' };

const MODEL = 'claude-haiku-4-5-20251001'; // быстрый и дешёвый, достаточно для извлечения полей

const TOOL_SCHEMA = {
  name: 'submit_parsed_report',
  description: 'Отправить структурированные данные, извлечённые из отчёта.',
  input_schema: {
    type: 'object',
    properties: {
      date: {
        type: ['string', 'null'],
        description: 'Дата отчёта в формате YYYY-MM-DD. Если год не указан — используй текущий. Если дату определить нельзя — null.'
      },
      revenue: {
        type: 'object',
        description: 'Выручка по каналам. Ключ — ТОЧНО id канала из списка revenueChannels (не название!). Значение — сумма числом. Добавляй только те каналы, которые явно есть в тексте.',
        additionalProperties: { type: 'number' }
      },
      courier: {
        type: 'object',
        description: 'Данные по курьеру за смену',
        properties: {
          pay: { type: ['number', 'null'], description: 'Сколько заплатили курьеру за смену' },
          km: { type: ['number', 'null'], description: 'Пробег курьера в км' },
          deliveries: { type: ['number', 'null'], description: 'Количество доставок' }
        }
      },
      promo: {
        type: 'object',
        properties: { pay: { type: ['number', 'null'], description: 'Оплата промоутеру, если есть' } }
      },
      kitchenExpenses: {
        type: 'array',
        description: 'Расходы на закупки/продукты для кухни',
        items: {
          type: 'object',
          properties: { category: { type: 'string' }, amount: { type: 'number' } },
          required: ['category', 'amount']
        }
      },
      otherExpenses: {
        type: 'array',
        description: 'Прочие расходы, не относящиеся к закупкам кухни (хозтовары, ремонт и т.п.)',
        items: {
          type: 'object',
          properties: { category: { type: 'string' }, amount: { type: 'number' } },
          required: ['category', 'amount']
        }
      },
      advances: {
        type: 'array',
        description: 'Авансы, выданные сотрудникам',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Имя сотрудника как написано в тексте' },
            amount: { type: 'number' },
            employeeId: { type: ['string', 'null'], description: 'id из списка employees, если удалось сопоставить имя, иначе null' }
          },
          required: ['name', 'amount']
        }
      },
      roster: {
        type: 'array',
        description: 'Список сотрудников, которые работали в эту смену (без сумм — просто имена/список смены)',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            employeeId: { type: ['string', 'null'] }
          },
          required: ['name']
        }
      },
      totalHint: {
        type: ['number', 'null'],
        description: 'Итоговая сумма выручки, ЯВНО указанная в тексте (например «итого выручка», «выручка итого», «итого»). Если явно не указана — null.'
      },
      unmatchedLines: {
        type: 'array',
        description: 'Строки или значения, которые ты не смог уверенно классифицировать, а также справочные/информационные поля, которые не относятся к выручке или расходам (например поле сверки кассы). Указывай как есть, при необходимости с кратким пояснением в скобках.',
        items: { type: 'string' }
      }
    },
    required: ['date', 'revenue', 'courier', 'promo', 'kitchenExpenses', 'otherExpenses', 'advances', 'roster', 'totalHint', 'unmatchedLines']
  }
};

function buildSystemPrompt({ revenueChannels, employees, expenseCategories, fallbackDate, glossary }) {
  const channelsList = revenueChannels.map(c => `- id="${c.id}" name="${c.name}"`).join('\n') || '(нет настроенных каналов)';
  const employeesList = employees.map(e => `- id="${e.id}" name="${e.name}"`).join('\n') || '(нет сотрудников)';
  const categoriesList = (expenseCategories || []).join(', ') || '(не заданы)';

  return `Ты разбираешь ежедневный отчёт кафе/службы доставки, присланный сотрудником в чат ВК. Текст может быть в свободной форме, с любым порядком строк, числом до или после названия, сокращениями и опечатками.

Сегодняшняя дата (если год/дата в отчёте не указаны): ${fallbackDate}

Каналы выручки (используй ТОЛЬКО эти id в поле revenue):
${channelsList}

Сотрудники (сопоставляй имена из текста с этим списком по имени; если сомневаешься — оставляй employeeId null):
${employeesList}

Известные категории прочих расходов (не обязательно, но если подходит — используй): ${categoriesList}

${glossary ? `Словарь терминов, специфичных для этого бизнеса:\n${glossary}\n` : ''}
Важные правила:
1. Число может стоять до или после названия поля («22352,2 Наличные» и «Наличные 22352,2» — одно и то же).
2. Если встречается сокращение или термин, значение которого не очевидно из контекста и не описано в словаре выше — НЕ угадывай и не добавляй его в выручку/расходы. Помести его в unmatchedLines с кратким пояснением почему не распознано.
3. totalHint заполняй, только если в тексте явно есть строка-итог по выручке (слова «итого», «итого выручка», «выручка итого» и т.п.). Не вычисляй его сам.
4. Строки, которые являются справочными/сверочными (например ожидаемая сумма в кассе), а не фактической выручкой или расходом — не добавляй в revenue/otherExpenses, помести в unmatchedLines с пояснением.
5. Если в тексте есть список имён без сумм (кто работал в смену) — это roster, а не advances.
6. Все суммы — положительные числа, без пробелов и валютных символов, разделитель дробной части точка.
7. Вызови submit_parsed_report ровно один раз с итоговым результатом.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY не настроен на сервере. Добавьте переменную окружения в настройках проекта Vercel.' });
    return;
  }

  try {
    const {
      text,
      revenueChannels = [],
      employees = [],
      expenseCategories = [],
      fallbackDate = null,
      glossary = ''
    } = req.body || {};

    if (!text || !String(text).trim()) {
      res.status(400).json({ error: 'Пустой текст отчёта.' });
      return;
    }

    const today = fallbackDate || new Date().toISOString().slice(0, 10);
    const systemPrompt = buildSystemPrompt({ revenueChannels, employees, expenseCategories, fallbackDate: today, glossary });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: String(text) }],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: 'tool', name: 'submit_parsed_report' }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: `Ошибка Claude API (${response.status}): ${errText.slice(0, 500)}` });
      return;
    }

    const data = await response.json();
    const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'submit_parsed_report');
    if (!toolUse) {
      res.status(502).json({ error: 'Модель не вернула структурированный результат. Попробуйте ещё раз.' });
      return;
    }

    const raw = toolUse.input || {};

    // --- Постобработка: приводим к формату, который ожидает фронтенд ---

    const channelIds = new Set(revenueChannels.map(c => c.id));
    const revenue = {};
    Object.entries(raw.revenue || {}).forEach(([id, val]) => {
      if (channelIds.has(id) && typeof val === 'number' && Number.isFinite(val)) revenue[id] = val;
    });

    const empById = new Map(employees.map(e => [e.id, e]));

    const advances = (raw.advances || []).map(a => {
      const emp = a.employeeId ? empById.get(a.employeeId) : null;
      return {
        name: a.name || '',
        amount: Number(a.amount) || 0,
        employeeId: emp ? emp.id : null,
        matchedName: emp ? emp.name : null
      };
    });

    const rosterMatches = (raw.roster || []).map(r => {
      const emp = r.employeeId ? empById.get(r.employeeId) : null;
      return {
        raw: r.name || '',
        employeeId: emp ? emp.id : null,
        matchedName: emp ? emp.name : null
      };
    });

    const result = {
      date: raw.date || null,
      revenue,
      courier: {
        pay: raw.courier?.pay ?? null,
        km: raw.courier?.km ?? null,
        deliveries: raw.courier?.deliveries ?? null
      },
      promo: { pay: raw.promo?.pay ?? null },
      kitchenExpenses: (raw.kitchenExpenses || []).map(e => ({ category: e.category || 'Покупки', amount: Number(e.amount) || 0 })),
      otherExpenses: (raw.otherExpenses || []).map(e => ({ category: e.category || 'Прочий расход', amount: Number(e.amount) || 0 })),
      advances,
      rosterMatches,
      unmatchedLines: raw.unmatchedLines || [],
      totalHint: typeof raw.totalHint === 'number' ? raw.totalHint : null
    };

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Внутренняя ошибка сервера' });
  }
}
