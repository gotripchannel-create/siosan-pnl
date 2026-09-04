// Vercel Serverless Function: /api/iiko-dashboard
// Отдельный источник данных для дашборда iiko. НЕ пересекается с ручным вводом P&L —
// это read-only витрина «что реально происходит по кассе», без применения куда-либо.
// Забирает OLAP-отчёт по продажам за диапазон дат, группирует по дню и по способу оплаты.

export const config = { runtime: 'nodejs' };

import { createHash } from 'crypto';

function sha1Hex(str) {
  return createHash('sha1').update(str, 'utf8').digest('hex');
}

// Комментарий "зп" может быть с именем сотрудника ("зп курьер", "зп орхан",
// "рома зп") — считаем зарплатной выплатой, если "зп" встречается отдельным словом
// в любом месте комментария, а не только когда комментарий равен ровно "зп".
const isSalaryComment = (s) => String(s || '').toLowerCase().trim().split(/\s+/).includes('зп');

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

// Второй филиал СиоСан без своей кассы: его дневную выручку пробивают через кассу
// основного заведения отдельной позицией меню. Отделяем её от реальных продаж первого
// заведения, иначе она искажает тренд/средний чек/итоги этой конкретной точки.
// Признак именно второго филиала — сумма от 5000 ₽: под тем же названием иногда
// пробивают и обычные разовые позиции первого заведения, которых нет в меню, но
// суммы там всегда меньше.
const SECOND_BRANCH_DISH_NAME = 'Блюдо от Шефа';
const SECOND_BRANCH_MIN_AMOUNT = 5000;

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

  const { from, to } = req.body || {};
  if (!from || !to) { res.status(400).json({ error: 'Не указан диапазон дат.' }); return; }

  let token = null;
  try {
    token = await iikoAuth(serverUrl, login, password);

    const olapResp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportType: 'SALES',
        buildSummary: false,
        groupByRowFields: ['OpenDate.Typed', 'PayTypes', 'OrderNum'],
        groupByColFields: [],
        aggregateFields: ['DishDiscountSumInt', 'DishSumInt', 'DishAmountInt'],
        filters: {
          'OpenDate.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true }
        }
      })
    });

    const olapText = await olapResp.text();
    let olapJson = null;
    try { olapJson = JSON.parse(olapText); } catch (_) {}

    if (!olapResp.ok) {
      res.status(502).json({ error: `Сервер iiko ответил ошибкой (${olapResp.status}).`, raw: olapJson || olapText });
      return;
    }

    const rows = olapJson?.data || [];
    const byDay = new Map(); // date -> { total, byPayType: {}, orderKeys: Set }
    const totalsByPayType = {};
    const allOrderKeys = new Set(); // "date::orderNum" — считаем УНИКАЛЬНЫЕ заказы, а не сумму количества блюд
    let grandTotal = 0;
    let grandTotalBeforeDiscount = 0;

    for (const row of rows) {
      const date = row['OpenDate.Typed']; // доверяем дате из iiko напрямую — так же, как в кассовых сменах
      const payType = row['PayTypes'] || 'Не указано';
      const amount = Number(row['DishDiscountSumInt']) || 0;
      const amountBeforeDiscount = Number(row['DishSumInt']) || amount;
      const orderNum = row['OrderNum'] ?? null;
      if (/без оплаты/i.test(payType)) continue; // не считаем неоплаченные/открытые заказы выручкой

      if (!byDay.has(date)) byDay.set(date, { date, total: 0, discount: 0, byPayType: {}, orderKeys: new Set() });
      const dayEntry = byDay.get(date);
      dayEntry.total += amount;
      dayEntry.discount += Math.max(0, amountBeforeDiscount - amount);
      dayEntry.byPayType[payType] = (dayEntry.byPayType[payType] || 0) + amount;
      if (orderNum != null) { const key = `${date}::${orderNum}`; dayEntry.orderKeys.add(key); allOrderKeys.add(key); }

      totalsByPayType[payType] = (totalsByPayType[payType] || 0) + amount;
      grandTotal += amount;
      grandTotalBeforeDiscount += amountBeforeDiscount;
    }

    const days = Array.from(byDay.values())
      .map(d => ({ date: d.date, total: d.total, discount: d.discount, byPayType: d.byPayType, checks: d.orderKeys.size }))
      .sort((a, b) => a.date.localeCompare(b.date));
    let totalChecks = allOrderKeys.size; // уникальные заказы за весь период — не сумма количества блюд

    // Отдельный запрос по позиции "Блюдо от Шефа" — это не блюдо, а способ провести
    // выручку второго филиала через эту кассу. Группируем ПО КАЖДОМУ ЗАКАЗУ (OrderNum),
    // а не только по дню: если в тот же день был ещё и обычный мелкий разовый заказ
    // первого заведения под тем же названием, при группировке только по дню он бы
    // сложился с суммой филиала 2 и завысил её. Порог 5000₽ — на каждый заказ отдельно.
    // Дата берётся напрямую из OpenDate.Typed — так же, как в остальном дашборде.
    let secondBranchTotal = 0;
    let secondBranchChecks = 0;
    let secondBranchByDay = {};
    let secondBranchError = null;
    try {
      const sbResp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType: 'SALES', buildSummary: false,
          groupByRowFields: ['OpenDate.Typed', 'DishName', 'OrderNum', 'PayTypes'], groupByColFields: [],
          aggregateFields: ['DishDiscountSumInt', 'DishAmountInt'],
          filters: {
            'OpenDate.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true },
            'DishName': { filterType: 'IncludeValues', values: [SECOND_BRANCH_DISH_NAME] }
          }
        })
      });
      const sbText = await sbResp.text();
      const sbJson = JSON.parse(sbText);
      if (sbResp.ok) {
        for (const r of (sbJson?.data || [])) {
          const amt = Number(r['DishDiscountSumInt']) || 0;
          if (amt < SECOND_BRANCH_MIN_AMOUNT) continue; // маленький заказ под этим названием — обычный заказ первого заведения, не филиал 2
          const iikoDate = r['OpenDate.Typed'];
          const payType = r['PayTypes'] || 'Не указано';

          secondBranchTotal += amt;
          secondBranchChecks += 1; // одна строка = один заказ (сгруппировано по OrderNum), не сумма количества блюд
          secondBranchByDay[iikoDate] = (secondBranchByDay[iikoDate] || 0) + amt;
          // Вычитаем из общей выручки И из конкретного способа оплаты того дня,
          // под которым эта сумма реально лежит в основном запросе.
          const dayEntry = days.find(d => d.date === iikoDate);
          if (dayEntry) {
            dayEntry.total = Math.round(Math.max(0, dayEntry.total - amt) * 100) / 100;
            if (dayEntry.byPayType[payType] != null) {
              dayEntry.byPayType[payType] = Math.round(Math.max(0, dayEntry.byPayType[payType] - amt) * 100) / 100;
            }
          }
          if (totalsByPayType[payType] != null) {
            totalsByPayType[payType] = Math.round(Math.max(0, totalsByPayType[payType] - amt) * 100) / 100;
          }
        }
        grandTotal = Math.max(0, grandTotal - secondBranchTotal);
        totalChecks = Math.max(0, totalChecks - secondBranchChecks);
      } else {
        secondBranchError = `Запрос по второму филиалу вернул ошибку (${sbResp.status}).`;
      }
    } catch (e) {
      secondBranchError = 'Не удалось получить данные по второму филиалу: ' + (e?.message || 'неизвестная ошибка');
    }

    // Отдельный запрос по удалённым блюдам (та же схема отчёта, документированный фильтр
    // DeletedWithWriteoff). Если он не сработает — не роняем весь дашборд, просто не покажем блок удалений.
    let deletions = null;
    let deletionsError = null;
    try {
      const delResp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType: 'SALES',
          buildSummary: false,
          groupByRowFields: ['OpenDate.Typed'],
          groupByColFields: [],
          aggregateFields: ['DishSumInt', 'DishAmountInt'],
          filters: {
            'OpenDate.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true },
            'DeletedWithWriteoff': { filterType: 'IncludeValues', values: ['DELETED_WITH_WRITEOFF', 'DELETED_WITHOUT_WRITEOFF'] }
          }
        })
      });
      const delText = await delResp.text();
      const delJson = JSON.parse(delText);
      if (delResp.ok) {
        const delRows = delJson?.data || [];
        deletions = {
          total: Math.round(delRows.reduce((s, r) => s + (Number(r['DishSumInt']) || 0), 0) * 100) / 100,
          count: delRows.reduce((s, r) => s + (Number(r['DishAmountInt']) || 0), 0),
          byDay: delRows.map(r => ({ date: r['OpenDate.Typed'], amount: Number(r['DishSumInt']) || 0, count: Number(r['DishAmountInt']) || 0 }))
        };
      } else {
        deletionsError = `Отчёт по удалениям вернул ошибку (${delResp.status}).`;
      }
    } catch (e) {
      deletionsError = 'Не удалось получить отчёт по удалениям: ' + (e?.message || 'неизвестная ошибка');
    }

    // Топ блюд за весь месяц (не только за один день, как в дневном отчёте) — нужно,
    // например, для AI-помощника, чтобы отвечать на вопросы вроде «сколько выручки с
    // бургеров». Исключаем «Блюдо от Шефа» (это выручка второго филиала, не блюдо) и
    // строки без оплаты.
    let topDishesMonth = [];
    let topDishesError = null;
    try {
      const dishResp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType: 'SALES',
          buildSummary: false,
          groupByRowFields: ['DishName', 'PayTypes'],
          groupByColFields: [],
          aggregateFields: ['DishDiscountSumInt', 'DishAmountInt'],
          filters: {
            'OpenDate.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true }
          }
        })
      });
      const dishText = await dishResp.text();
      const dishJson = JSON.parse(dishText);
      if (dishResp.ok) {
        const byDish = new Map();
        for (const r of (dishJson?.data || [])) {
          const name = r['DishName'];
          const payType = r['PayTypes'] || 'Не указано';
          if (!name || name === SECOND_BRANCH_DISH_NAME || /без оплаты/i.test(payType)) continue;
          const sum = Number(r['DishDiscountSumInt']) || 0;
          const qty = Number(r['DishAmountInt']) || 0;
          const cur = byDish.get(name) || { name, sum: 0, qty: 0 };
          cur.sum += sum; cur.qty += qty;
          byDish.set(name, cur);
        }
        topDishesMonth = [...byDish.values()]
          .map((d) => ({ name: d.name, sum: Math.round(d.sum * 100) / 100, qty: Math.round(d.qty * 100) / 100 }))
          .sort((a, b) => b.sum - a.sum);
      } else {
        topDishesError = `Отчёт по блюдам вернул ошибку (${dishResp.status}).`;
      }
    } catch (e) {
      topDishesError = 'Не удалось получить отчёт по блюдам: ' + (e?.message || 'неизвестная ошибка');
    }

    // Внесения по заказу — из отчёта ПО ПРОВОДКАМ (TRANSACTIONS), не из сводки по
    // кассовым сменам: сводка суммирует ВСЕ внесения без разбора, включая перенос
    // остатка в кассу (комментарий «дб») и выплату зарплаты («зп») наличными через
    // кассу. В проводках у каждой операции внесения есть свой комментарий — считаем
    // выручкой всё, кроме известных не-выручечных типов «дб» и «зп».
    let cashPayIncome = 0;
    const cashPayIncomeByDay = {};
    let cashPayIncomeError = null;
    try {
      const txResp = await fetch(`${serverUrl.replace(/\/$/, '')}/resto/api/v2/reports/olap?key=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType: 'TRANSACTIONS',
          buildSummary: false,
          groupByRowFields: ['DateTime.Typed', 'Comment'],
          groupByColFields: [],
          aggregateFields: ['Sum.Incoming'],
          filters: {
            'DateTime.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true },
            'TransactionType': { filterType: 'IncludeValues', values: ['PAYIN'] }
          }
        })
      });
      const txText = await txResp.text();
      let txJson = null;
      try { txJson = JSON.parse(txText); } catch (_) {}
      if (txResp.ok) {
        for (const r of (txJson?.data || [])) {
          const comment = String(r['Comment'] || '').trim().toLowerCase();
          if (comment === 'дб' || isSalaryComment(comment) || comment === 'бк' || comment === 'ошибка' || comment.startsWith('закрытие кассовой смены')) continue; // не выручка: начальный остаток кассы / зарплата / перенос остатка между сменами / системная запись закрытия смены / отмеченная кассиром ошибка
          const amt = Number(r['Sum.Incoming']) || 0;
          const d = (r['DateTime.Typed'] || '').slice(0, 10);
          cashPayIncome += amt;
          cashPayIncomeByDay[d] = (cashPayIncomeByDay[d] || 0) + amt;
        }
      } else {
        cashPayIncomeError = `Отчёт по проводкам вернул ошибку (${txResp.status}).`;
      }
    } catch (e) {
      cashPayIncomeError = 'Не удалось получить внесения по заказу: ' + (e?.message || 'неизвестная ошибка');
    }
    grandTotal += cashPayIncome;
    for (const day of days) {
      if (cashPayIncomeByDay[day.date]) {
        day.total = Math.round((day.total + cashPayIncomeByDay[day.date]) * 100) / 100;
        day.cashPayIncome = Math.round(cashPayIncomeByDay[day.date] * 100) / 100;
        // Важно: добавляем и в byPayType (под тем же ключом, что и на верхнем уровне
        // totalsByPayType, ниже), иначе day.total и сумма day.byPayType расходятся —
        // а именно byPayType используют клиенты для синхронизации выручки по каналам.
        day.byPayType = { ...day.byPayType, 'Внесение по заказу': Math.round(((day.byPayType?.['Внесение по заказу'] || 0) + cashPayIncomeByDay[day.date]) * 100) / 100 };
      }
    }
    totalsByPayType['Внесение по заказу'] = Math.round((cashPayIncome) * 100) / 100;

    res.status(200).json({
      from, to,
      days,
      totalsByPayType,
      grandTotal: Math.round(grandTotal * 100) / 100,
      cashPayIncome: Math.round(cashPayIncome * 100) / 100,
      cashPayIncomeError,
      totalDiscount: Math.round(Math.max(0, grandTotalBeforeDiscount - grandTotal) * 100) / 100,
      totalChecks,
      avgCheck: totalChecks ? Math.round((grandTotal / totalChecks) * 100) / 100 : 0,
      deletions,
      deletionsError,
      secondBranch: secondBranchTotal > 0 ? {
        total: Math.round(secondBranchTotal * 100) / 100,
        checks: secondBranchChecks,
        avgCheck: secondBranchChecks ? Math.round((secondBranchTotal / secondBranchChecks) * 100) / 100 : 0,
        days: Object.entries(secondBranchByDay).map(([date, total]) => ({ date, total: Math.round(total * 100) / 100 })).sort((a, b) => a.date.localeCompare(b.date))
      } : null,
      secondBranchError,
      topDishesMonth,
      topDishesError
    });
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Не удалось подключиться к серверу iiko.' });
  } finally {
    if (token) await iikoLogout(serverUrl, token);
  }
}
