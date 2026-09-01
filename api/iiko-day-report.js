// Vercel Serverless Function: /api/iiko-day-report
// Полный отчёт по одному дню — как будто закрываете смену вручную: выручка по способам
// оплаты, скидки, удаления, топ проданных блюд, внесения/изъятия. Собирает несколько
// уже проверенных запросов (OLAP по продажам + кассовые смены) в один ответ на конкретную
// дату. Read-only, ничего не применяется в P&L.

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

async function olapQuery(serverUrl, token, body) {
  const resp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  if (!resp.ok) {
    const err = new Error(`OLAP-запрос вернул ошибку (${resp.status})`);
    err.raw = json || text;
    throw err;
  }
  return json?.data || [];
}

// Запрос данных за день — напрямую по "OpenDate.Typed", доверяем тому, как iiko сам
// относит заказ к дню (так же, как в кассовых сменах). Раньше здесь была реклассификация
// по полю "OpenTime" — убрана, так как разбивала смены, закрывающиеся после полуночи,
// по календарному времени вместо реальной границы смены/бизнес-дня.
async function queryDay(serverUrl, token, date, groupByRowFields, aggregateFields, extraFilters = {}) {
  const dateFilter = { filterType: 'DateRange', periodType: 'CUSTOM', from: date, to: date, includeLow: true, includeHigh: true };
  return olapQuery(serverUrl, token, {
    reportType: 'SALES', buildSummary: false,
    groupByRowFields: [...new Set(['OpenDate.Typed', ...groupByRowFields])],
    groupByColFields: [],
    aggregateFields,
    filters: { ...extraFilters, 'OpenDate.Typed': dateFilter }
  });
}

// Настоящий признак технической/фантомной смены — ПОЛНОЕ отсутствие любой финансовой
// активности (открыли и тут же закрыли без единой операции). Проверку по длительности
// намеренно не делаем: короткая смена — не то же самое, что пустая. Например, смену
// открывают специально на 1-2 минуты, чтобы пробить один чек (например, выручку
// точки без своей кассы) и сразу закрыть — такая смена короткая, но в ней реальные
// деньги, и её нельзя терять.
const isPhantomShift = (s) => {
  return !(Number(s.payIn) || Number(s.payOut) || Number(s.salesCash) || Number(s.salesCard) || Number(s.sessionStartCash));
};

// Второй филиал СиоСан не имеет своей онлайн-кассы. Его дневную выручку пробивают
// через кассу основного заведения отдельной позицией — так она отражается в общей
// бухгалтерии/налоговой, но её нужно отделять от реальных продаж первого заведения,
// иначе она искажает средний чек, топ блюд и метрики конкретно этой точки.
// ВАЖНО: под тем же названием иногда пробивают и обычные разовые позиции первого
// заведения, которых нет в меню (тогда сумма небольшая). Признак именно второго
// филиала — сумма от 5000 ₽ и выше, меньше касса там не бывает по словам владельца.
const SECOND_BRANCH_DISH_NAME = 'Блюдо от Шефа';
const SECOND_BRANCH_MIN_AMOUNT = 5000;
const isSecondBranchDishName = (name) => String(name || '').trim().toLowerCase() === SECOND_BRANCH_DISH_NAME.toLowerCase();

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

  const { date } = req.body || {};
  if (!date) { res.status(400).json({ error: 'Не указана дата.' }); return; }

  const dateFilter = { filterType: 'DateRange', periodType: 'CUSTOM', from: date, to: date, includeLow: true, includeHigh: true };

  let token = null;
  const result = { date, revenue: null, discount: null, deletions: null, topDishes: null, cashShifts: null, errors: {} };

  try {
    token = await iikoAuth(serverUrl, login, password);

    // 1. Выручка по способам оплаты (+ сумма до скидки, для расчёта скидки)
    try {
      const rows = await queryDay(serverUrl, token, date, ['PayTypes'], ['DishDiscountSumInt', 'DishSumInt']);
      const byPayType = {};
      let total = 0, totalBeforeDiscount = 0;
      for (const r of rows) {
        const pt = r['PayTypes'] || 'Не указано';
        const amt = Number(r['DishDiscountSumInt']) || 0;
        if (/без оплаты/i.test(pt)) continue;
        byPayType[pt] = (byPayType[pt] || 0) + amt;
        total += amt;
        totalBeforeDiscount += Number(r['DishSumInt']) || amt;
      }
      result.revenue = { byPayType, total: Math.round(total * 100) / 100 };
      result.discount = { total: Math.round(Math.max(0, totalBeforeDiscount - total) * 100) / 100 };
    } catch (e) { result.errors.revenue = e.message; if (e.raw) result.errors.revenueRaw = e.raw; }

    // 2. Топ проданных блюд — "Блюдо от Шефа" сюда никогда не попадает, это не блюдо,
    // а способ пробить нестандартную сумму (либо разовый заказ первого заведения,
    // либо выручка второго филиала — см. отдельный запрос ниже).
    try {
      const rows = await queryDay(serverUrl, token, date, ['DishName'], ['DishAmountInt', 'DishDiscountSumInt']);
      result.topDishes = rows
        .filter(r => !isSecondBranchDishName(r['DishName']))
        .map(r => ({ name: r['DishName'] || 'Без названия', qty: Number(r['DishAmountInt']) || 0, amount: Number(r['DishDiscountSumInt']) || 0 }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 20);
    } catch (e) { result.errors.topDishes = e.message; }

    // 2c. Детализация по чекам — тот же запрос, но группируем ПО КАЖДОМУ ЗАКАЗУ, а не
    // по названию блюда, чтобы показать состав и сумму каждого отдельного чека, а не
    // только агрегированный топ блюд. "Блюдо от Шефа" сюда не включаем — это выручка
    // второго филиала, а не позиция чека этого заведения (см. блок 2b).
    try {
      const rows = await queryDay(serverUrl, token, date, ['OrderNum', 'DishName', 'OpenTime', 'PayTypes'], ['DishAmountInt', 'DishDiscountSumInt']);
      const byOrder = new Map();
      for (const r of rows) {
        if (isSecondBranchDishName(r['DishName'])) continue;
        const orderNum = r['OrderNum'] ?? '—';
        if (!byOrder.has(orderNum)) {
          byOrder.set(orderNum, { orderNum, time: (r['OpenTime'] || '').slice(11, 16) || null, payType: r['PayTypes'] || 'Не указано', total: 0, items: [] });
        }
        const order = byOrder.get(orderNum);
        const amount = Number(r['DishDiscountSumInt']) || 0;
        const qty = Number(r['DishAmountInt']) || 0;
        order.total += amount;
        order.items.push({ name: r['DishName'] || 'Без названия', qty, amount });
      }
      result.checks = Array.from(byOrder.values())
        .map(o => ({ ...o, total: Math.round(o.total * 100) / 100 }))
        .filter(o => o.total > 0)
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      // Настоящее число чеков — количество уникальных заказов, а не сумма количества
      // блюд (DishAmountInt раньше ошибочно использовался как "чеков", хотя это
      // количество проданных порций еды — обычно в разы больше, чем заказов).
      if (result.revenue) result.revenue.checks = result.checks.length;
    } catch (e) { result.errors.checks = e.message; }

    // 2b. Отдельно — сумма второго филиала. Группируем ПО КАЖДОМУ ЗАКАЗУ (OrderNum),
    // а не по всему дню сразу: если в один день с суммой филиала 2 был ещё и обычный
    // мелкий разовый заказ первого заведения под тем же названием «Блюдо от Шефа»,
    // при группировке только по дню они бы сложились в одну сумму и завысили итог.
    // Порог 5000₽ применяем к КАЖДОМУ заказу отдельно, а не к сумме за день.
    // Дата берётся напрямую из OpenDate.Typed — так же, как в кассовых сменах.
    try {
      const rows = await olapQuery(serverUrl, token, {
        reportType: 'SALES', buildSummary: false,
        groupByRowFields: ['DishName', 'OrderNum', 'OpenDate.Typed', 'PayTypes'], groupByColFields: [],
        aggregateFields: ['DishAmountInt', 'DishDiscountSumInt'],
        filters: {
          'OpenDate.Typed': dateFilter,
          'DishName': { filterType: 'IncludeValues', values: [SECOND_BRANCH_DISH_NAME] }
        }
      });

      const allOrders = rows.map(r => ({
        orderNum: r['OrderNum'] ?? null,
        iikoDate: r['OpenDate.Typed'] ?? null,
        payType: r['PayTypes'] || 'Не указано',
        amount: Number(r['DishDiscountSumInt']) || 0,
        qty: Number(r['DishAmountInt']) || 0
      }));

      const branchOrders = allOrders.filter(r => r.amount >= SECOND_BRANCH_MIN_AMOUNT);
      const secondBranchTotal = branchOrders.reduce((s, r) => s + r.amount, 0);
      const secondBranchCount = branchOrders.length; // количество заказов, а не сумма количества блюд

      result.secondBranchRawOrders = allOrders.map(r => ({ ...r, countedAsBranch: r.amount >= SECOND_BRANCH_MIN_AMOUNT }));
      if (secondBranchTotal > 0) {
        result.secondBranch = { total: Math.round(secondBranchTotal * 100) / 100, count: secondBranchCount, orders: branchOrders.length };
        if (result.revenue) {
          result.revenue.totalWithSecondBranch = result.revenue.total;
          // Вычитаем сумму филиала 2 из ТОГО способа оплаты, которым её реально
          // пробили (а не только из общего итога) — так «По способам оплаты» тоже
          // отражает только это заведение, без смешивания с филиалом 2.
          branchOrders.forEach(o => {
            if (result.revenue.byPayType[o.payType] != null) {
              result.revenue.byPayType[o.payType] = Math.round(Math.max(0, result.revenue.byPayType[o.payType] - o.amount) * 100) / 100;
            }
          });
          result.revenue.total = Math.round(Math.max(0, result.revenue.total - secondBranchTotal) * 100) / 100;
        }
      }
    } catch (e) { result.errors.secondBranch = e.message; }

    // 3. Удаления
    try {
      const rows = await queryDay(serverUrl, token, date, ['DishName'], ['DishSumInt', 'DishAmountInt'], {
        'DeletedWithWriteoff': { filterType: 'IncludeValues', values: ['DELETED_WITH_WRITEOFF', 'DELETED_WITHOUT_WRITEOFF'] }
      });
      result.deletions = {
        total: Math.round(rows.reduce((s, r) => s + (Number(r['DishSumInt']) || 0), 0) * 100) / 100,
        count: rows.reduce((s, r) => s + (Number(r['DishAmountInt']) || 0), 0),
        items: rows.map(r => ({ name: r['DishName'] || 'Без названия', qty: Number(r['DishAmountInt']) || 0, amount: Number(r['DishSumInt']) || 0 })).sort((a,b) => b.amount - a.amount)
      };
    } catch (e) { result.errors.deletions = e.message; }

    // 4. Кассовая смена(ы) за этот день
    try {
      const resp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/cashshifts/list?openDateFrom=${date}&openDateTo=${date}&status=ANY&key=${encodeURIComponent(token)}`, {
        headers: { 'Accept': 'application/json' }
      });
      const text = await resp.text();
      const shifts = JSON.parse(text);
      const real = (Array.isArray(shifts) ? shifts : []).filter(s => !isPhantomShift(s));
      result.cashShifts = real.map(s => ({
        sessionNumber: s.sessionNumber,
        openDate: s.openDate, closeDate: s.closeDate, status: s.sessionStatus,
        sessionStartCash: Number(s.sessionStartCash) || 0,
        payIn: Number(s.payIn) || 0, payOut: Number(s.payOut) || 0,
        payIncome: Number(s.payIncome) || 0,
        salesCash: Number(s.salesCash) || 0, salesCard: Number(s.salesCard) || 0,
        cashRemain: s.cashRemain != null ? Number(s.cashRemain) : null,
        cashDiff: s.cashDiff != null ? Number(s.cashDiff) : null
      }));

      // Внесения по заказу (payIncome) — ВРЕМЕННО не прибавляются автоматически к
      // выручке дня. У каждой операции внесения в iikoWeb есть комментарий («заказ»,
      // «АБ» — начальный остаток, «ошибка» и т.п.), и учитывать нужно только
      // «заказ» — а сводка по смене суммирует все внесения без разбора. Показываем
      // сумму для проверки, не добавляем, пока не подтверждена точная структура.
    } catch (e) { result.errors.cashShifts = e.message; }

    // 5. Внесения по заказу — из отчёта по проводкам. Считаем выручкой всё, кроме
    // известных не-выручечных типов: «дб» (начальный остаток кассы) и «зп» (выплата
    // зарплаты наличными через кассу). Сводка по смене выше суммирует все внесения
    // без разбора по комментарию, поэтому не годится для точного расчёта выручки.
    try {
      const txResp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType: 'TRANSACTIONS', buildSummary: false,
          groupByRowFields: ['Comment'], groupByColFields: [],
          aggregateFields: ['Sum.Incoming'],
          filters: {
            'DateTime.Typed': dateFilter,
            'TransactionType': { filterType: 'IncludeValues', values: ['PAYIN'] }
          }
        })
      });
      const txText = await txResp.text();
      const txJson = JSON.parse(txText);
      if (txResp.ok) {
        const payIncome = (txJson?.data || [])
          .filter(r => { const c = String(r['Comment'] || '').trim().toLowerCase(); return c !== 'дб' && c !== 'зп'; })
          .reduce((s, r) => s + (Number(r['Sum.Incoming']) || 0), 0);
        if (payIncome > 0 && result.revenue) {
          result.revenue.payIncomeAdded = Math.round(payIncome * 100) / 100;
          result.revenue.total = Math.round((result.revenue.total + payIncome) * 100) / 100;
          // Важно: добавляем и в byPayType, иначе total и сумма byPayType расходятся —
          // именно byPayType используют клиенты (например, автозагрузка дня на
          // Дашборде) для синхронизации выручки по каналам.
          result.revenue.byPayType = { ...result.revenue.byPayType, 'Внесение по заказу': Math.round(((result.revenue.byPayType?.['Внесение по заказу'] || 0) + payIncome) * 100) / 100 };
        }
      } else {
        result.errors.payIncome = `Отчёт по проводкам вернул ошибку (${txResp.status}).`;
      }
    } catch (e) { result.errors.payIncome = e.message; }

    res.status(200).json(result);
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Не удалось подключиться к серверу iiko.' });
  } finally {
    if (token) await iikoLogout(serverUrl, token);
  }
}
