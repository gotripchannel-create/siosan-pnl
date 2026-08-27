export function normalizeNumber(str) {
  const cleaned = String(str).replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

const amountRe = /(\d[\d\s]*(?:[.,]\d+)?)/;

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
  const dateRe = /(?:^|\s)(\d{1,2})[.\/]\s*(\d{1,2})(?:[.\/]\s*(\d{2,4}))?(?:\s|$)/;
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

    const dm = line.match(dateRe);
    if (dm) {
      let [, dd, mm, yy] = dm;
      yy = yy ? (yy.length === 2 ? '20' + yy : yy) : String(localYear);
      result.date = `${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
      if (/^\s*(?:отч[её]т\s*)?(?:за\s*)?\d{1,2}[.\/]\s*\d{1,2}(?:[.\/]\s*\d{2,4})?\s*$/i.test(line)) continue;
    }

    if (/^(?:авансы?|авансы сотрудников?)\s*:?(?:\s*)$/i.test(line)) { inAdvances = true; inPurchases = inOther = false; continue; }
    if (/^(?:покупки|закупки|закупка)\s*:?(?:\s*)$/i.test(line)) { inPurchases = true; inAdvances = inOther = false; continue; }
    if (/^(?:другие|прочие)\s+расходы\s*:?(?:\s*)$/i.test(line)) { inOther = true; inAdvances = inPurchases = false; continue; }

    const nm = line.match(amountRe);
    const amount = nm ? normalizeNumber(nm[1]) : null;

    if (/итог.*выруч|выруч.*итог/i.test(lower)) {
      if (amount != null) result.totalHint = amount;
      continue;
    }

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

    // Explicit revenue fields first.
    if (/выруч.*нал|нал.*выруч|^нал(?:ичные|ичка)?\b/i.test(lower)) {
      if (cashChannel) result.revenue[cashChannel.id] = amount; else result.unmatchedLines.push(line);
      inAdvances = inPurchases = inOther = false; continue;
    }
    if (/выруч.*карт|карт.*выруч|^карт(?:а|ы)?\b|^безнал/i.test(lower)) {
      if (cardChannel) result.revenue[cardChannel.id] = amount; else result.unmatchedLines.push(line);
      inAdvances = inPurchases = inOther = false; continue;
    }
    const matchedChannel = revenueChannels.find(c => lower.includes(String(c.name || '').toLowerCase()));
    if (matchedChannel && /выруч|оплата|карта|налич|яндекс|нетмонет|еда/i.test(lower)) {
      result.revenue[matchedChannel.id] = amount;
      inAdvances = inPurchases = inOther = false; continue;
    }

    if (/достав/i.test(lower)) { result.courier.deliveries = amount; inAdvances = inPurchases = inOther = false; continue; }
    if (/(?:^|\s)км\b|км$/i.test(lower) || /километр/i.test(lower)) { result.courier.km = amount; inAdvances = inPurchases = inOther = false; continue; }
    if (/курьер/i.test(lower)) { result.courier.pay = amount; inAdvances = inPurchases = inOther = false; continue; }
    if (/промо/i.test(lower)) { result.promo.pay = amount; inAdvances = inPurchases = inOther = false; continue; }

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
