export function normalizeNumber(str) {
  const cleaned = String(str).replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

const amountRe = /(\d[\d\s]*(?:[.,]\d+)?)/;
const MONTHS = ['январ','феврал','март','апрел','ма[йя]','июн','июл','август','сентябр','октябр','ноябр','декабр'];
const MONTH_INDEX = { 'январ':1,'феврал':2,'март':3,'апрел':4,'ма':5,'июн':6,'июл':7,'август':8,'сентябр':9,'октябр':10,'ноябр':11,'декабр':12 };
const monthNameRe = new RegExp(`^(\\d{1,2})\\s+(${MONTHS.join('|')})[а-я]*\\s*$`, 'i');
const dateLineRe = /^(?:отч[её]т\s*)?(?:за\s*)?(\d{1,2})[.\/]\s*(\d{1,2})(?:[.\/]\s*(\d{2,4}))?\.?\s*$/i;

// Строки-разделители дней в экспорте чата ВК ("21 марта", "вчера", "26.08.26" отдельной строкой).
function matchDayMarker(line, fallbackDate) {
  const trimmed = line.trim();
  const now = fallbackDate ? new Date(fallbackDate + 'T00:00:00') : new Date();

  const mn = trimmed.match(monthNameRe);
  if (mn) {
    const day = Number(mn[1]);
    const monKey = Object.keys(MONTH_INDEX).find(k => mn[2].toLowerCase().startsWith(k));
    const month = monKey ? MONTH_INDEX[monKey] : null;
    if (month) return `${now.getFullYear()}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  const dm = trimmed.match(dateLineRe);
  if (dm) {
    let [, dd, mm, yy] = dm;
    yy = yy ? (yy.length === 2 ? '20' + yy : yy) : String(now.getFullYear());
    return `${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  }
  if (/^вчера$/i.test(trimmed)) { const d = new Date(now); d.setDate(d.getDate() - 1); return d.toISOString().slice(0,10); }
  if (/^позавчера$/i.test(trimmed)) { const d = new Date(now); d.setDate(d.getDate() - 2); return d.toISOString().slice(0,10); }
  if (/^сегодня$/i.test(trimmed)) { return now.toISOString().slice(0,10); }
  return null;
}

// Похоже ли, что этот кусок текста — реальный финансовый отчёт, а не переписка/приветствие.
function looksLikeReport(text) {
  const lower = text.toLowerCase();
  const hasTotal = /итог.*выруч|выруч.*итог/.test(lower);
  const hasTwoRevenueWords = (lower.match(/налич|карт|выруч/g) || []).length >= 2;
  return hasTotal || hasTwoRevenueWords;
}

export function parseVkReport(text, ctx = {}) {
  const {
    revenueChannels = [], employees = [], fallbackDate = null,
    expenseCeiling = 50000, expenseCategories = []
  } = ctx;

  const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const result = {
    date: null,
    revenue: {},
    courier: { pay: null, km: null, deliveries: null },
    promo: { pay: null },
    kitchenExpenses: [],
    otherExpenses: [],
    advances: [],
    rosterNames: [],
    rosterMatches: [],
    unmatchedLines: [],
    totalHint: null,
  };

  const now = new Date();
  const localYear = now.getFullYear();
  const empByFirstName = new Map();
  employees.forEach(e => {
    const first = String(e.name || '').trim().split(/\s+/)[0].toLowerCase();
    if (first) empByFirstName.set(first, e);
  });

  const findChannel = (patterns) => revenueChannels.find(c => patterns.some(p => p.test(String(c.name || ''))));
  const cashChannel = findChannel([/налич/i]);
  const cardChannel = findChannel([/карт/i, /безнал/i]);

  let inAdvances = false;
  let inPurchases = false;
  let inOther = false;

  for (const line of lines) {
    const lower = line.toLowerCase();

    const dm = line.match(dateLineRe);
    if (dm) {
      let [, dd, mm, yy] = dm;
      yy = yy ? (yy.length === 2 ? '20' + yy : yy) : String(localYear);
      result.date = `${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
      continue;
    }

    if (/^(?:авансы?|авансы сотрудников?)\s*:?(?:\s*)$/i.test(line)) { inAdvances = true; inPurchases = inOther = false; continue; }
    if (/^(?:покупки|закупки|закупка)\s*:?(?:\s*)$/i.test(line)) { inPurchases = true; inAdvances = inOther = false; continue; }
    if (/^(?:другие|прочие)\s+расходы\s*:?(?:\s*)$/i.test(line)) { inOther = true; inAdvances = inPurchases = false; continue; }

    const nm = line.match(amountRe);
    const amount = nm ? normalizeNumber(nm[1]) : null;

    // Касса фактически / ДБ — сверочное поле, НЕ выручка и НЕ расход. Не даём ему попасть
    // ни в itemized expenses (перебивает суммы), ни в roster — просто фиксируем как есть.
    if (/^дб\b|касса\s*факт/i.test(lower)) {
      result.unmatchedLines.push(`${line} (касса фактически — сверка, не применяется автоматически)`);
      inAdvances = inPurchases = inOther = false;
      continue;
    }

    if (/итог.*выруч|выруч.*итог/i.test(lower)) {
      if (amount != null) result.totalHint = amount;
      continue;
    }

    // Конкретные поля имеют приоритет НАД «мы всё ещё внутри секции авансов/покупок» —
    // иначе одна открытая секция «Авансы:» проглатывает все последующие строки с числами
    // (доставки, км, зарплату курьера) до конца сообщения.
    if (/налич/i.test(lower)) {
      if (cashChannel) result.revenue[cashChannel.id] = amount; else result.unmatchedLines.push(line);
      inAdvances = inPurchases = inOther = false; continue;
    }
    if (/карт/i.test(lower) || /безнал/i.test(lower)) {
      if (cardChannel) result.revenue[cardChannel.id] = amount; else result.unmatchedLines.push(line);
      inAdvances = inPurchases = inOther = false; continue;
    }
    const matchedChannelEarly = revenueChannels.find(c => lower.includes(String(c.name || '').toLowerCase()));
    if (matchedChannelEarly) {
      result.revenue[matchedChannelEarly.id] = amount;
      inAdvances = inPurchases = inOther = false; continue;
    }
    if (/достав/i.test(lower)) { result.courier.deliveries = amount; inAdvances = inPurchases = inOther = false; continue; }
    if (/(?:^|\s)км\b|км$/i.test(lower) || /километр/i.test(lower)) { result.courier.km = amount; inAdvances = inPurchases = inOther = false; continue; }
    if (/курьер/i.test(lower)) { result.courier.pay = amount; inAdvances = inPurchases = inOther = false; continue; }
    if (/промо/i.test(lower)) { result.promo.pay = amount; inAdvances = inPurchases = inOther = false; continue; }

    if (inAdvances && amount != null) {
      const name = line.replace(nm[0], '').replace(/[\-:]+/g, ' ').trim();
      const first = name.split(/\s+/)[0]?.toLowerCase().replace(/\.$/, '');
      if (first && empByFirstName.has(first)) {
        const emp = empByFirstName.get(first);
        result.advances.push({ name, amount, employeeId: emp.id, matchedName: emp.name });
        continue;
      }
      result.advances.push({ name, amount, employeeId: null, matchedName: null });
      continue;
    }

    if (amount == null) {
      const tokens = line.split(/\s+/).filter(Boolean);
      const roster = tokens.length > 0 && tokens.length <= 8 && tokens.every(t => empByFirstName.has(t.toLowerCase().replace(/[.,]$/,'')));
      if (roster) result.rosterNames.push(...tokens);
      else result.unmatchedLines.push(line);
      continue;
    }

    const category = line.replace(nm[0], '').replace(/^[\s:–—-]+|[\s:–—-]+$/g, '').trim();
    const isPurchase = inPurchases || /покупк|закупк/i.test(lower);
    const isOtherExpense = inOther || /друг(?:ие|ого)?\s+расход|проч(?:ие|ее)\s+расход/i.test(lower);
    if (isPurchase) {
      result.kitchenExpenses.push({ category: category || 'Покупки', amount });
      inPurchases = false;
      continue;
    }
    if (isOtherExpense || (category && (amount <= expenseCeiling || expenseCategories.some(c => lower.includes(String(c).toLowerCase()))))) {
      result.otherExpenses.push({ category: category || 'Прочий расход', amount });
      inOther = false;
      continue;
    }

    result.unmatchedLines.push(line);
    inAdvances = inPurchases = inOther = false;
  }

  if (!result.date) result.date = fallbackDate;
  result.rosterMatches = result.rosterNames.map(n => {
    const m = empByFirstName.get(n.toLowerCase().replace(/[.,]$/,''));
    return { raw: n, employeeId: m ? m.id : null, matchedName: m ? m.name : null };
  });
  return result;
}

// Разбивает большой кусок текста (например, целиком скопированный чат за несколько дней)
// на отдельные отчёты. Ищет строки-маркеры дня ("26 августа", "вчера", "26.08.26") и куски,
// которые похожи на реальный отчёт (упоминают выручку/итого), остальное отбрасывает как шум переписки.
export function parseVkReportMulti(text, ctx = {}) {
  const lines = String(text || '').split(/\r?\n/);
  const blocks = [];
  let currentMarkerDate = null;
  let buffer = [];

  const flush = () => {
    const chunk = buffer.join('\n').trim();
    buffer = [];
    if (chunk && looksLikeReport(chunk)) blocks.push({ markerDate: currentMarkerDate, text: chunk });
  };

  for (const rawLine of lines) {
    const marker = matchDayMarker(rawLine, ctx.fallbackDate);
    if (marker) {
      flush();
      currentMarkerDate = marker;
      continue;
    }
    buffer.push(rawLine);
  }
  flush();

  // Если маркеров дней не было вообще и весь текст — один отчёт (обычный случай: вставили одно сообщение).
  if (blocks.length === 0) {
    const whole = String(text || '').trim();
    if (!whole) return [];
    return [parseVkReport(whole, ctx)];
  }

  return blocks.map(b => {
    const parsed = parseVkReport(b.text, { ...ctx, fallbackDate: b.markerDate || ctx.fallbackDate });
    if (!parsed.date || parsed.date === ctx.fallbackDate) {
      if (b.markerDate) parsed.date = b.markerDate;
    }
    return parsed;
  });
}
