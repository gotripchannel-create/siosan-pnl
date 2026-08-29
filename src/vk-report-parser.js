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

// Строки-разделители ДНЕЙ В ЭКСПОРТЕ ЧАТА ("21 марта", "вчера", "сегодня") — то есть
// настоящие заголовки календарных дней, которые ВК показывает между сообщениями разных дней.
// Числовая дата вида "26.08.26" сюда намеренно НЕ включена: это самостоятельная дата,
// которую автор указал ВНУТРИ своего отчёта (в начале или в конце — не важно), а не
// разделитель между разными сообщениями. Если считать её разделителем, отчёт, где дата
// стоит подписью в конце, будет резаться неправильно — реальные данные уедут под старую
// дату, а верная дата достанется пустому хвосту. Числовые даты по-прежнему подхватываются
// внутри parseVkReport() построчно, откуда бы они ни стояли.
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
    registerCheck: null, // "ДБ" / «Касса фактически» — сверка кассы, отдельно от выручки и расходов
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
  const netmonetChannel = findChannel([/нет\s*монет/i]);

  let inAdvances = false;
  let inPurchases = false;
  let inOther = false;

  for (const line of lines) {
    const lower = line.toLowerCase();

    const dm = line.match(dateLineRe);
    if (dm) {
      if (!result.date) {
        let [, dd, mm, yy] = dm;
        yy = yy ? (yy.length === 2 ? '20' + yy : yy) : String(localYear);
        result.date = `${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
      }
      continue;
    }

    if (/^(?:авансы?|авансы сотрудников?)\s*:?(?:\s*)$/i.test(line)) { inAdvances = true; inPurchases = inOther = false; continue; }
    if (/^(?:покупки|закупки|закупка)\s*:?(?:\s*)$/i.test(line)) { inPurchases = true; inAdvances = inOther = false; continue; }
    if (/^(?:другие|прочие)\s+расходы\s*:?(?:\s*)$/i.test(line)) { inOther = true; inAdvances = inPurchases = false; continue; }

    const nm = line.match(amountRe);
    const amount = nm ? normalizeNumber(nm[1]) : null;

    // Касса фактически / ДБ — сверочное поле, НЕ выручка и НЕ расход. Показываем отдельно,
    // не смешиваем ни с расходами (испортит суммы), ни с «не распознано» (это не ошибка).
    if (/^дб(?:\s|$)|касса\s*факт/i.test(lower)) {
      if (amount != null) result.registerCheck = amount;
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
    if (/нет\s*монет/i.test(lower)) {
      if (netmonetChannel) result.revenue[netmonetChannel.id] = amount; else result.unmatchedLines.push(line);
      inAdvances = inPurchases = inOther = false; continue;
    }
    const matchedChannelEarly = revenueChannels.find(c => lower.includes(String(c.name || '').toLowerCase()));
    if (matchedChannelEarly) {
      result.revenue[matchedChannelEarly.id] = amount;
      inAdvances = inPurchases = inOther = false; continue;
    }
    if (/достав/i.test(lower)) { result.courier.deliveries = amount; inAdvances = inPurchases = inOther = false; continue; }
    if (/(?:^|\s)км(?:\s|$)|км$/i.test(lower) || /километр/i.test(lower)) { result.courier.km = amount; inAdvances = inPurchases = inOther = false; continue; }
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
      // Строка формально внутри секции «Авансы:», но имя не похоже ни на одного сотрудника —
      // считаем, что секция авансов закончилась, и разбираем строку дальше как обычно
      // (расход, покупка и т.п.), а не молча пишем её в авансы «на всякий случай».
      inAdvances = false;
    }

    if (amount == null) {
      const honorificRe = /^(?:тёт[яь]|теть|дяд[яь])\.?$/i;
      const tokens = line.split(/\s+/)
        .map(t => t.replace(/^[.,;:!?]+|[.,;:!?]+$/g, '')) // убираем знаки препинания по краям слова
        .filter(Boolean) // убираем то, что стало пустым (например, одиночная запятая)
        .filter(t => !honorificRe.test(t));
      const matchCount = tokens.filter(t => empByFirstName.has(t.toLowerCase())).length;
      // Строку считаем списком «кто работал», если хотя бы половина слов — известные имена
      // сотрудников (не требуем 100% совпадения: прозвища вроде «тёть Оля» не должны ломать
      // распознавание всей строки — непонятые слова просто покажутся как «не найден»).
      const roster = tokens.length > 0 && tokens.length <= 10 && matchCount >= Math.max(1, Math.ceil(tokens.length / 2));
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

// Разбивает большой кусок текста (например, целиком скопированный чат за несколько дней,
// или несколько отдельных сообщений, вставленных вместе через пустую строку) на отдельные
// отчёты. Разделителем блока считается либо строка-маркер дня ("26 августа", "вчера"),
// либо ПУСТАЯ СТРОКА — но только если то, что уже накоплено ДО неё, само по себе уже
// похоже на завершённый отчёт (есть выручка/итого). Так несколько сообщений, вставленных
// одно за другим с пустой строкой между ними (частый случай при копировании из ВК), не
// слипаются в один отчёт, даже если у второго и последующих дата указана текстом в конце,
// а не отдельным маркером-заголовком в начале.
export function parseVkReportMulti(text, ctx = {}) {
  const rawText = String(text || '').trim();
  if (!rawText) return [];
  const lines = rawText.split(/\r?\n/);

  const blocks = [];
  let currentMarkerDate = null;
  let buffer = [];
  const bufferText = () => buffer.join('\n');

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const marker = matchDayMarker(rawLine, ctx.fallbackDate);
    if (marker) {
      if (buffer.length > 0 && looksLikeReport(bufferText())) {
        // Маркер встретился уже ПОСЛЕ того, как в буфере накопился полноценный отчёт —
        // значит это не заголовок для следующего блока, а дата-подпись в конце ЭТОГО
        // отчёта (как «27 августа» в конце сообщения). Отдаём дату этому блоку, а не
        // переносим её на следующий.
        blocks.push({ markerDate: marker, text: bufferText() });
        buffer = [];
        currentMarkerDate = null;
      } else {
        currentMarkerDate = marker;
      }
      continue;
    }
    if (!rawLine.trim() && buffer.length > 0 && looksLikeReport(bufferText())) {
      // Пустая строка после уже похожего на отчёт куска — проверяем, что идёт ДАЛЬШЕ.
      // Разбиваем только если следующая непустая строка явно начинает НОВЫЙ отчёт
      // (начинается с числа — как обычно и оформляют вставку из ВК). Если дальше идёт
      // что-то другое (например список имён без сумм) — это, скорее всего, продолжение
      // текущего отчёта (роспись «кто работал» после пустой строки), а не новый блок.
      let nextNonEmpty = null;
      for (let j = i + 1; j < lines.length; j++) { if (lines[j].trim()) { nextNonEmpty = lines[j].trim(); break; } }
      if (nextNonEmpty && (/^\d/.test(nextNonEmpty) || matchDayMarker(nextNonEmpty, ctx.fallbackDate))) {
        blocks.push({ markerDate: currentMarkerDate, text: bufferText() });
        buffer = [];
        currentMarkerDate = null;
        continue;
      }
    }
    buffer.push(rawLine);
  }

  if (buffer.length > 0) {
    if (looksLikeReport(bufferText()) || blocks.length === 0) {
      blocks.push({ markerDate: currentMarkerDate, text: bufferText() });
    } else {
      blocks[blocks.length - 1].text += '\n' + bufferText();
    }
  }

  // Один блок — доверяем parseVkReport целиком, без фильтрации (обычный случай: одно сообщение).
  const usableBlocks = blocks.length <= 1 ? blocks : blocks.filter(b => looksLikeReport(b.text));
  if (usableBlocks.length === 0) return [];

  return usableBlocks.map(b => {
    const parsed = parseVkReport(b.text, { ...ctx, fallbackDate: b.markerDate || ctx.fallbackDate });
    if (!parsed.date || parsed.date === ctx.fallbackDate) {
      if (b.markerDate) parsed.date = b.markerDate;
    }
    return parsed;
  });
}
