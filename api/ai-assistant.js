// Vercel Serverless Function: /api/ai-assistant
// Чат с данными и автосводки на базе Claude (Anthropic API). Принимает уже посчитанные
// цифры с фронтенда (P&L, закупки) — сам к базе/iiko не обращается, только рассуждает
// над тем, что ему передали. Поэтому ответы настолько точны, насколько точен presetContext.

export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

const SYSTEM_PROMPT = `Ты — аналитик-помощник управляющего рестораном СИОСАН (Новошахтинск). Тебе передают уже посчитанные цифры (P&L, закупки, выручка) в формате JSON — отвечай ТОЛЬКО на их основе, ничего не выдумывай и не досчитывай то, чего нет в данных. Если данных не хватает для ответа — прямо скажи об этом, не гадай.

Важно про источники данных: в контексте есть поле "выручкаИзKассыIiko_ЭТОРЕАЛЬНАЯВЫРУЧКА" — это настоящая выручка ресторана из кассы iiko, именно её нужно использовать, когда спрашивают про выручку. Отдельно есть поля с суффиксом "ПоРучномуУчёту" (прибыль, маржа, фудкост) — они посчитаны на основе выручки, введённой вручную в другом разделе приложения, который часто пустой или не заполняется вовремя. Если ручная выручка сильно расходится с реальной из iiko (например, в разы меньше) — явно предупреди об этом при ответе про прибыль/маржу/фудкост, а не подавай их как надёжные цифры.

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
        messages
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      res.status(502).json({ error: data?.error?.message || `Anthropic API вернул ошибку (${resp.status}).` });
      return;
    }
    const answer = (data.content || []).map((c) => c.text || '').join('\n').trim();
    res.status(200).json({ answer });
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Не удалось связаться с Anthropic API.' });
  }
}
