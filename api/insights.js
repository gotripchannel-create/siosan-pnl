// Vercel Serverless Function: /api/insights
// Принимает уже посчитанные агрегированные цифры P&L (текущий месяц, прошлый месяц,
// разбивка по дням и категориям расходов) и просит Claude найти реально значимые
// отклонения/тренды и коротко описать их по-русски. НИКАКИХ сырых персональных данных
// не передаётся — только цифры и названия категорий/каналов.

export const config = { runtime: 'nodejs' };

const MODEL = 'claude-sonnet-5'; // запускается редко (по кнопке), важнее качество сопоставления цифр, чем цена

const TOOL_SCHEMA = {
  name: 'submit_insights',
  description: 'Отправить список найденных наблюдений по P&L.',
  input_schema: {
    type: 'object',
    properties: {
      insights: {
        type: 'array',
        description: 'От 2 до 6 самых значимых наблюдений. Если реальных отклонений нет — верни пустой массив, не выдумывай.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Короткий заголовок в 3-7 слов' },
            detail: { type: 'string', description: '1-2 предложения с конкретными цифрами, объясняющими наблюдение' },
            severity: { type: 'string', enum: ['warning', 'info', 'positive'], description: 'warning — требует внимания (рост расходов, падение маржи); positive — хорошая динамика; info — нейтральный факт' }
          },
          required: ['title', 'detail', 'severity']
        }
      }
    },
    required: ['insights']
  }
};

const SYSTEM_PROMPT = `Ты аналитик, который раз в неделю смотрит на управленческий P&L небольшого кафе/службы доставки и должен написать короткую сводку для владельца.

Тебе присылают ТОЛЬКО агрегированные цифры (без персональных данных): показатели текущего месяца, показатели предыдущего месяца для сравнения, разбивку по дням, разбивку расходов по категориям.

Правила:
1. Ищи РЕАЛЬНО значимые отклонения — рост/падение больше ~10-15%, необычные выбросы в конкретные дни, изменение структуры расходов относительно выручки (не абсолютных чисел, а именно относительно выручки — если выручка выросла на 20% и закупки тоже на 20%, это НЕ аномалия). Не пиши очевидные вещи вроде «выручка в выходные выше» без цифр, подтверждающих что это неожиданно.
2. Если данных мало (меньше 5 дней с данными в текущем месяце) — можешь честно написать одно наблюдение о том, что рано делать выводы, и больше ничего не выдумывать.
3. Каждое наблюдение должно содержать конкретные цифры или проценты — не общие фразы.
4. Пиши по-русски, по-деловому, без канцелярита и воды. Заголовок — короткая суть, detail — цифры и объяснение.
5. Если ничего примечательного нет — верни пустой массив insights. Пустой список — нормальный и полезный результат, не придумывай наблюдения ради количества.
6. Максимум 6 наблюдений, выбирай самые важные.
7. Вызови submit_insights ровно один раз.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'Supabase не настроен на сервере.' });
    return;
  }
  if (!token) {
    res.status(401).json({ error: 'Требуется авторизация.' });
    return;
  }
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY не настроен на сервере.' });
    return;
  }

  const { current, previous, dailySeries, otherExpenseCategories, kitchenCategories, month } = req.body || {};
  if (!current) {
    res.status(400).json({ error: 'Нет данных P&L для анализа.' });
    return;
  }

  const payload = {
    месяц: month,
    текущий_месяц: current,
    предыдущий_месяц: previous || null,
    по_дням: dailySeries || [],
    категории_прочих_расходов: otherExpenseCategories || [],
    категории_закупок: kitchenCategories || []
  };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: 'tool', name: 'submit_insights' }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: `Ошибка Claude API (${response.status}): ${errText.slice(0, 500)}` });
      return;
    }

    const data = await response.json();
    const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'submit_insights');
    if (!toolUse) {
      res.status(502).json({ error: 'Модель не вернула структурированный результат.' });
      return;
    }

    res.status(200).json({ insights: toolUse.input?.insights || [], generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Внутренняя ошибка сервера' });
  }
}
