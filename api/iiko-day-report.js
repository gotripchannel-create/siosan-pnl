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
      const rows = await olapQuery(serverUrl, token, {
        reportType: 'SALES', buildSummary: false,
        groupByRowFields: ['PayTypes'], groupByColFields: [],
        aggregateFields: ['DishDiscountSumInt', 'DishSumInt', 'DishAmountInt'],
        filters: { 'OpenDate.Typed': dateFilter }
      });
      const byPayType = {};
      let total = 0, totalBeforeDiscount = 0, checks = 0;
      for (const r of rows) {
        const pt = r['PayTypes'] || 'Не указано';
        const amt = Number(r['DishDiscountSumInt']) || 0;
        if (/без оплаты/i.test(pt)) continue;
        byPayType[pt] = (byPayType[pt] || 0) + amt;
        total += amt;
        totalBeforeDiscount += Number(r['DishSumInt']) || amt;
        checks += Number(r['DishAmountInt']) || 0;
      }
      result.revenue = { byPayType, total: Math.round(total * 100) / 100, checks };
      result.discount = { total: Math.round(Math.max(0, totalBeforeDiscount - total) * 100) / 100 };
    } catch (e) { result.errors.revenue = e.message; if (e.raw) result.errors.revenueRaw = e.raw; }

    // 2. Топ проданных блюд — "Блюдо от Шефа" сюда никогда не попадает, это не блюдо,
    // а способ пробить нестандартную сумму (либо разовый заказ первого заведения,
    // либо выручка второго филиала — см. отдельный запрос ниже).
    try {
      const rows = await olapQuery(serverUrl, token, {
        reportType: 'SALES', buildSummary: false,
        groupByRowFields: ['DishName'], groupByColFields: [],
        aggregateFields: ['DishAmountInt', 'DishDiscountSumInt'],
        filters: { 'OpenDate.Typed': dateFilter }
      });
      result.topDishes = rows
        .filter(r => !isSecondBranchDishName(r['DishName']))
        .map(r => ({ name: r['DishName'] || 'Без названия', qty: Number(r['DishAmountInt']) || 0, amount: Number(r['DishDiscountSumInt']) || 0 }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 20);
    } catch (e) { result.errors.topDishes = e.message; }

    // 2b. Отдельно — сумма второго филиала. Группируем ПО КАЖДОМУ ЗАКАЗУ (OrderNum),
    // а не по всему дню сразу: если в один день с суммой филиала 2 был ещё и обычный
    // мелкий разовый заказ первого заведения под тем же названием «Блюдо от Шефа»,
    // при группировке только по дню они бы сложились в одну сумму и завысили итог.
    // Порог 5000₽ применяем к КАЖДОМУ заказу отдельно, а не к сумме за день.
    try {
      const rows = await olapQuery(serverUrl, token, {
        reportType: 'SALES', buildSummary: false,
        groupByRowFields: ['DishName', 'OrderNum', 'OpenDate.Typed', 'OpenTime'], groupByColFields: [],
        aggregateFields: ['DishAmountInt', 'DishDiscountSumInt'],
        filters: {
          'OpenDate.Typed': dateFilter,
          'DishName': { filterType: 'IncludeValues', values: [SECOND_BRANCH_DISH_NAME] }
        }
      });
      const branchOrders = rows.filter(r => (Number(r['DishDiscountSumInt']) || 0) >= SECOND_BRANCH_MIN_AMOUNT);
      const secondBranchTotal = branchOrders.reduce((s, r) => s + (Number(r['DishDiscountSumInt']) || 0), 0);
      const secondBranchCount = branchOrders.reduce((s, r) => s + (Number(r['DishAmountInt']) || 0), 0);
      // Сырая разбивка по каждому заказу под названием "Блюдо от Шефа" за этот день —
      // для диагностики, если итоговая сумма выглядит неправильной. Показываем ВСЕ
      // заказы под этим названием, не только те, что прошли порог, чтобы было видно,
      // что именно отфильтровалось, а что нет.
      result.secondBranchRawOrders = rows.map(r => ({ orderNum: r['OrderNum'] ?? null, date: r['OpenDate.Typed'] ?? null, time: r['OpenTime'] ?? null, amount: Number(r['DishDiscountSumInt']) || 0, qty: Number(r['DishAmountInt']) || 0, countedAsBranch: (Number(r['DishDiscountSumInt']) || 0) >= SECOND_BRANCH_MIN_AMOUNT }));
      if (secondBranchTotal > 0) {
        result.secondBranch = { total: Math.round(secondBranchTotal * 100) / 100, count: secondBranchCount, orders: branchOrders.length };
        if (result.revenue) {
          result.revenue.totalWithSecondBranch = result.revenue.total;
          result.revenue.total = Math.round(Math.max(0, result.revenue.total - secondBranchTotal) * 100) / 100;
        }
      }
    } catch (e) { result.errors.secondBranch = e.message; }

    // 2c. Диагностика перехода через полночь: смотрим "Блюдо от Шефа" за СЛЕДУЮЩИЙ
    // календарный день тоже. Если вторую смену закрывают после 23:00, заказ может
    // попасть в iiko уже под следующей датой, хотя по смыслу это выручка текущего дня.
    try {
      const nextDateObj = new Date(date + 'T00:00:00');
      nextDateObj.setDate(nextDateObj.getDate() + 1);
      const nextDate = nextDateObj.toISOString().slice(0, 10);
      const nextDateFilter = { filterType: 'DateRange', periodType: 'CUSTOM', from: nextDate, to: nextDate, includeLow: true, includeHigh: true };
      const rows = await olapQuery(serverUrl, token, {
        reportType: 'SALES', buildSummary: false,
        groupByRowFields: ['DishName', 'OrderNum', 'OpenDate.Typed', 'OpenTime'], groupByColFields: [],
        aggregateFields: ['DishAmountInt', 'DishDiscountSumInt'],
        filters: {
          'OpenDate.Typed': nextDateFilter,
          'DishName': { filterType: 'IncludeValues', values: [SECOND_BRANCH_DISH_NAME] }
        }
      });
      result.secondBranchNextDayOrders = { date: nextDate, orders: rows.map(r => ({ orderNum: r['OrderNum'] ?? null, date: r['OpenDate.Typed'] ?? null, time: r['OpenTime'] ?? null, amount: Number(r['DishDiscountSumInt']) || 0, qty: Number(r['DishAmountInt']) || 0 })) };
    } catch (e) { result.errors.secondBranchNextDay = e.message; }

    // 3. Удаления
    try {
      const rows = await olapQuery(serverUrl, token, {
        reportType: 'SALES', buildSummary: false,
        groupByRowFields: ['DishName'], groupByColFields: [],
        aggregateFields: ['DishSumInt', 'DishAmountInt'],
        filters: {
          'OpenDate.Typed': dateFilter,
          'DeletedWithWriteoff': { filterType: 'IncludeValues', values: ['DELETED_WITH_WRITEOFF', 'DELETED_WITHOUT_WRITEOFF'] }
        }
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
        salesCash: Number(s.salesCash) || 0, salesCard: Number(s.salesCard) || 0,
        cashRemain: s.cashRemain != null ? Number(s.cashRemain) : null,
        cashDiff: s.cashDiff != null ? Number(s.cashDiff) : null
      }));
    } catch (e) { result.errors.cashShifts = e.message; }

    res.status(200).json(result);
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Не удалось подключиться к серверу iiko.' });
  } finally {
    if (token) await iikoLogout(serverUrl, token);
  }
}
