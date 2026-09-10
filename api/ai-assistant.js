// Vercel Serverless Function: /api/ai-assistant
// Чат с данными и автосводки на базе Claude (Anthropic API). Принимает уже посчитанные
// цифры с фронтенда (P&L, закупки) — сам к базе/iiko не обращается, только рассуждает
// над тем, что ему передали. Поэтому ответы настолько точны, насколько точен presetContext.

export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

// Инструменты (function calling) — позволяют ассистенту не только ОТВЕЧАТЬ на
// вопросы по цифрам, но и ПРЕДЛАГАТЬ конкретные изменения данных (смены, премии/
// штрафы/авансы). Сервер НИЧЕГО не применяет сам — только возвращает предложенное
// действие клиенту; применяет его сам браузер пользователя ПОСЛЕ явного
// подтверждения (см. AiChatWidget), и только к уже загруженным в его сессии данным.
// Так исключается риск, что ассистент незаметно для пользователя изменит что-то
// в базе без спроса.
const TOOLS = [
  {
    name: 'set_shift',
    description: 'Поставить, изменить или убрать смену (количество часов) сотруднику на конкретную дату. Чтобы УБРАТЬ смену — передай hours: 0.',
    input_schema: {
      type: 'object',
      properties: {
        employee_name: { type: 'string', description: 'Имя сотрудника точно как в справочнике (список сотрудников передан в контексте)' },
        date: { type: 'string', description: 'Дата в формате YYYY-MM-DD' },
        hours: { type: 'number', description: 'Часы смены. 0 — убрать смену в этот день' }
      },
      required: ['employee_name', 'date', 'hours']
    }
  },
  {
    name: 'add_adjustment',
    description: 'Добавить премию, штраф или аванс конкретному сотруднику на конкретную дату.',
    input_schema: {
      type: 'object',
      properties: {
        employee_name: { type: 'string', description: 'Имя сотрудника точно как в справочнике' },
        type: { type: 'string', enum: ['bonus', 'penalty', 'advance'], description: 'bonus — премия, penalty — штраф, advance — аванс' },
        amount: { type: 'number', description: 'Сумма в рублях, всегда положительная' },
        date: { type: 'string', description: 'Дата в формате YYYY-MM-DD' },
        comment: { type: 'string', description: 'Короткий комментарий, за что (необязательно)' }
      },
      required: ['employee_name', 'type', 'amount', 'date']
    }
  }
];

const SYSTEM_PROMPT = `Ты — аналитик-помощник управляющего рестораном СИОСАН (Новошахтинск). Тебе передают уже посчитанные цифры (P&L, закупки, выручка) в формате JSON — отвечай ТОЛЬКО на их основе, ничего не выдумывай и не досчитывай то, чего нет в данных. Если данных не хватает для ответа — прямо скажи об этом, не гадай.

Важно про источники данных: в контексте есть поле "выручкаИзKассыIiko_ЭТОРЕАЛЬНАЯВЫРУЧКА" — это настоящая выручка ресторана из кассы iiko, именно её нужно использовать, когда спрашивают про выручку. Внутри него есть "выручкаПоБлюдамЭтотМесяц" — выручка по КАЖДОМУ БЛЮДУ отдельно (не по категориям). Если спрашивают про категорию («сколько с бургеров», «сколько на суши») — сам найди и просуммируй все блюда, чьё название относится к этой категории (например, все блюда со словом «бургер» в названии), и явно перечисли, какие блюда ты сложил. Отдельно есть поля с суффиксом "ПоРучномуУчёту" (прибыль, маржа, фудкост) — они посчитаны на основе выручки, введённой вручную в другом разделе приложения, который часто пустой или не заполняется вовремя. Если ручная выручка сильно расходится с реальной из iiko (например, в разы меньше) — явно предупреди об этом при ответе про прибыль/маржу/фудкост, а не подавай их как надёжные цифры.

У тебя есть инструменты (set_shift, add_adjustment) для ИЗМЕНЕНИЯ данных — используй их, когда пользователь просит что-то ДОБАВИТЬ/УБРАТЬ/ИЗМЕНИТЬ (например «добавь смену Гоше на завтра, 13 часов», «убери смену у Ромы 5 сентября», «оштрафуй Орхана на 500 за завтра», «дай Леше аванс 2000 сегодня»), а не просто спрашивает цифры. Список сотрудников с их id передан в контексте (поле "сотрудники") — сопоставляй имя из запроса пользователя с этим списком (используй employee_name ТОЧНО как в справочнике, регистр и написание важны). Если имя неоднозначно (несколько похожих сотрудников) или дата не указана и не понятна из контекста — сначала уточни вопросом, не вызывай инструмент наугад. "Сегодня"/"завтра"/"вчера" переводи в дату YYYY-MM-DD, ориентируясь на поле "сегодня" в контексте. Одним ответом можно вызвать несколько инструментов, если пользователь просит несколько действий сразу. Действие ещё НЕ применяется, когда ты вызываешь инструмент — пользователь увидит карточку подтверждения и должен будет её нажать, поэтому можешь сразу вызывать инструмент, не спрашивая "подтвердите?" текстом (подтверждение через отдельный UI, ты не должен его дублировать словами).

Пиши по-русски, коротко и по делу, как для занятого человека: без вступлений вроде "Отлично, давайте посмотрим", сразу к сути. Числа — с пробелами между разрядами и знаком ₽/%. Не используй markdown-заголовки, максимум — списки и жирный текст там, где это правда помогает считать глазами.`;

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'AI-помощник не настроен: добавьте ANTHROPIC_API_KEY в Environment Variables на Vercel (console.anthropic.com → API Keys).' });
    return;
  }

  const { mode, question, context, history } = req.body || {};
  if (!context) { res.status(400).json({ error: 'Не переданы данные для анализа.' }); return; }

  let userContent;
  if (mode === 'summary') {
    userContent = `Вот данные за месяц в JSON:\n${JSON.stringify(context)}\n\nНапиши короткую (4-6 предложений) управленческую сводку: что изменилось по сравнению с прошлым месяцем, на что стоит обратить внимание в первую очередь. Не пересказывай все цифры подряд — выбери самое важное.`;
  } else {
    userContent = `Данные для анализа в JSON:\n${JSON.stringify(context)}\n\nВопрос: ${question}`;
  }

  const messages = [
    ...(Array.isArray(history) ? history.slice(-10) : []),
    { role: 'user', content: userContent }
  ];

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      res.status(502).json({ error: data?.error?.message || `Anthropic API вернул ошибку (${resp.status}).` });
      return;
    }
    const content = data.content || [];
    const answer = content.filter((c) => c.type === 'text').map((c) => c.text || '').join('\n').trim();
    // Действия, которые ассистент хочет предложить пользователю — сервер их НЕ
    // выполняет, только передаёт клиенту как предложение для подтверждения.
    const actions = content
      .filter((c) => c.type === 'tool_use')
      .map((c) => ({ id: c.id, name: c.name, input: c.input }));
    res.status(200).json({ answer, actions });
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Не удалось связаться с Anthropic API.' });
  }
}
