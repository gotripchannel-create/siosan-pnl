// ============================================================================
// VK report message parser — best-effort, rule-based. Never treated as ground
// truth: every field it produces is meant to be reviewed by a human before it
// is written into real P&L data (see "Входящие отчёты" screen).
// ============================================================================

function normalizeNumber(str) {
  const cleaned = String(str).replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

const KNOWN_KEYWORD_RE = /достав|(^|\s)км\b|км$|курьер|промо|итог.*выруч|выруч.*нал|нал.*выруч|выруч.*карт|карт.*выруч/i;

function parseVkReport(text, ctx = {}) {
  const { revenueChannels = [], employees = [], fallbackDate = null, expenseCeiling = 5000, expenseCategories = [] } = ctx;
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);

  const result = {
    date: null,
    revenue: {},
    courier: { pay: null, km: null, deliveries: null },
    promo: { pay: null },
    otherExpenses: [],
    advances: [],
    rosterNames: [],
    rosterMatches: [],
    unmatchedLines: [],
    totalHint: null,
  };

  const numRe = /(\d[\d\s]*[.,]?\d*)/;
  const dateRe = /^(\d{2})[.\/](\d{2})[.\/](\d{2,4})$/;
  const empByFirstName = new Map();
  employees.forEach((e) => empByFirstName.set(e.name.trim().split(/\s+/)[0].toLowerCase(), e));

  let inAdvancesBlock = false;

  for (const line of lines) {
    const lower = line.toLowerCase();

    const dm = line.match(dateRe);
    if (dm) {
      let [, dd, mm, yy] = dm;
      if (yy.length === 2) yy = '20' + yy;
      result.date = `${yy}-${mm}-${dd}`;
      continue;
    }

    if (/^авансы\s*:?$/i.test(line)) { inAdvancesBlock = true; continue; }

    const numMatch = line.match(numRe);
    const amount = numMatch ? normalizeNumber(numMatch[1]) : null;

    if (inAdvancesBlock && amount !== null && !KNOWN_KEYWORD_RE.test(lower)) {
      const name = line.replace(numMatch[0], '').trim();
      const looksLikeAName = name && /^[А-ЯЁа-яё]+\.?$/.test(name);
      if (looksLikeAName) { result.advances.push({ name, amount }); continue; }
    }
    inAdvancesBlock = false;

    if (amount === null) {
      const tokens = line.split(/\s+/).filter(Boolean);
      const nameLikeCount = tokens.filter((t) => empByFirstName.has(t.toLowerCase().replace(/\.$/, ''))
        || /^[А-ЯЁа-яё]+\.?$/.test(t)).length;
      const looksLikeNames = tokens.length >= 1 && nameLikeCount === tokens.length && tokens.length <= 8;
      if (looksLikeNames) result.rosterNames.push(...tokens);
      else result.unmatchedLines.push(line);
      continue;
    }

    if (/итог.*выруч/i.test(lower)) { result.totalHint = amount; continue; }

    if (/выруч.*нал|нал.*выруч/i.test(lower)) {
      const ch = revenueChannels.find((c) => /налич/i.test(c.name));
      if (ch) result.revenue[ch.id] = amount; else result.unmatchedLines.push(line);
      continue;
    }
    if (/выруч.*карт|карт.*выруч/i.test(lower)) {
      const ch = revenueChannels.find((c) => /карт/i.test(c.name));
      if (ch) result.revenue[ch.id] = amount; else result.unmatchedLines.push(line);
      continue;
    }
    const matchedChannel = revenueChannels.find((c) => lower.includes(c.name.toLowerCase()));
    if (matchedChannel) { result.revenue[matchedChannel.id] = amount; continue; }

    if (/достав/i.test(lower)) { result.courier.deliveries = amount; continue; }
    if (/(^|\s)км\b/i.test(lower) || /км$/i.test(line)) { result.courier.km = amount; continue; }
    if (/курьер/i.test(lower)) { result.courier.pay = amount; continue; }
    if (/промо/i.test(lower)) { result.promo.pay = amount; continue; }

    const category = line.replace(numMatch[0], '').trim();
    const looksLikeExpense = category && (amount <= expenseCeiling || expenseCategories.some((c) => lower.includes(c.toLowerCase())));
    if (looksLikeExpense) result.otherExpenses.push({ category, amount });
    else result.unmatchedLines.push(line);
  }

  if (!result.date) result.date = fallbackDate;

  result.advances = result.advances.map((a) => {
    const m = empByFirstName.get(a.name.trim().toLowerCase());
    return { ...a, employeeId: m ? m.id : null, matchedName: m ? m.name : null };
  });
  result.rosterMatches = result.rosterNames.map((n) => {
    const m = empByFirstName.get(n.toLowerCase().replace(/\.$/, ''));
    return { raw: n, employeeId: m ? m.id : null, matchedName: m ? m.name : null };
  });

  return result;
}

module.exports = { parseVkReport, normalizeNumber };
