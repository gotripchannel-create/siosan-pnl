// vk-report-parser.js
// Разбор отчётов, которые сотрудник копирует из VK.

function normalizeNumber(value) {
  if (value === null || value === undefined) return null;

  let s = String(value)
    .replace(/\u00A0/g, ' ')
    .replace(/\s/g, '')
    .replace(/[₽рруб.]+$/i, '')
    .replace(',', '.');

  // Если случайно попали лишние символы
  s = s.replace(/[^\d.-]/g, '');

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeDate(text, fallbackDate) {
  const value = String(text || '').toLowerCase();

  // 26.08.2026 / 26/08/2026
  let m = value.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b/);

  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;

    return `${year}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
  }

  // 26.08
  m = value.match(/\b(\d{1,2})[./](\d{1,2})\b/);

  if (m) {
    const year = fallbackDate
      ? Number(String(fallbackDate).slice(0, 4))
      : new Date().getFullYear();

    return `${year}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
  }

  // Вчера
  if (value.includes('вчера')) {
    const d = new Date(`${fallbackDate}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  return fallbackDate || null;
}

function findEmployee(name, employees) {
  const clean = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[.:,]/g, '');

  if (!clean) return null;

  // Сначала точное совпадение полного имени
  const exact = employees.find(
    (e) => String(e.name || '').trim().toLowerCase() === clean
  );

  if (exact) return exact;

  // Потом первое слово — имя
  const first = clean.split(/\s+/)[0];

  const matches = employees.filter((e) => {
    const employeeFirst = String(e.name || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)[0];

    return employeeFirst === first;
  });

  return matches.length === 1 ? matches[0] : null;
}

export function parseVkReport(text, ctx = {}) {
  const {
    revenueChannels = [],
    employees = [],
    fallbackDate = null,
  } = ctx;

  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const result = {
    date: normalizeDate(text, fallbackDate),

    revenue: {},

    totalHint: null,

    purchases: [],

    otherExpenses: [],

    courier: {
      pay: null,
      km: null,
      deliveries: null,
    },

    promo: {
      pay: null,
    },

    advances: [],

    rosterMatches: [],

    unmatchedLines: [],
  };

  let advancesMode = false;

  for (const line of lines) {
    const lower = line.toLowerCase();

    // --------------------------------------------------
    // ДАТА
    // --------------------------------------------------

    if (
      /^отч[её]т/.test(lower) ||
      /^дата/.test(lower) ||
      /^за\s+\d{1,2}[./]\d{1,2}/.test(lower)
    ) {
      const parsedDate = normalizeDate(line, fallbackDate);
      if (parsedDate) result.date = parsedDate;
    }

    // --------------------------------------------------
    // БЛОК АВАНСОВ
    // --------------------------------------------------

    if (/^аванс(ы)?\s*:?\s*$/i.test(line)) {
      advancesMode = true;
      continue;
    }

    // Если начинается новый раздел — выходим из блока авансов
    if (
      /^(выручка|покупки|расходы|другие расходы|прочие расходы|курьер|доставки|промо|итого)/i.test(
        lower
      )
    ) {
      advancesMode = false;
    }

    // --------------------------------------------------
    // АВАНС
    // --------------------------------------------------

    if (advancesMode) {
      const m = line.match(/^(.+?)\s*[:\-]?\s*(\d[\d\s.,]*)\s*(?:₽|руб|р)?$/i);

      if (m) {
        const name = m[1].trim();
        const amount = normalizeNumber(m[2]);

        if (amount !== null) {
          const employee = findEmployee(name, employees);

          result.advances.push({
            name,
            amount,
            employeeId: employee?.id || null,
            matchedName: employee?.name || null,
            include: !!employee,
          });

          continue;
        }
      }
    }

    // --------------------------------------------------
    // ЧИСЛО
    // --------------------------------------------------

    const numberMatch = line.match(/-?\d[\d\s]*(?:[.,]\d+)?/);

    const amount = numberMatch
      ? normalizeNumber(numberMatch[0])
      : null;

    // --------------------------------------------------
    // ИТОГО ВЫРУЧКА
    // --------------------------------------------------

    if (
      /итого.*выруч|выруч.*итого|общая.*выруч/i.test(lower)
    ) {
      if (amount !== null) {
        result.totalHint = amount;
      }

      continue;
    }

    // --------------------------------------------------
    // НАЛИЧНЫЕ
    // --------------------------------------------------

    if (
      /налич|нал\b|наличка/.test(lower) &&
      !/аванс/.test(lower)
    ) {
      const channel = revenueChannels.find((c) =>
        /налич/i.test(String(c.name || ''))
      );

      if (channel && amount !== null) {
        result.revenue[channel.id] = amount;
        continue;
      }
    }

    // --------------------------------------------------
    // КАРТА
    // --------------------------------------------------

    if (
      /карт|карта|карты|безнал/.test(lower) &&
      !/аванс/.test(lower)
    ) {
      const channel = revenueChannels.find((c) =>
        /карт/i.test(String(c.name || ''))
      );

      if (channel && amount !== null) {
        result.revenue[channel.id] = amount;
        continue;
      }
    }

    // --------------------------------------------------
    // ЯНДЕКС ЕДА
    // --------------------------------------------------

    if (/яндекс/.test(lower) && amount !== null) {
      const channel = revenueChannels.find((c) =>
        /яндекс/i.test(String(c.name || ''))
      );

      if (channel) {
        result.revenue[channel.id] = amount;
        continue;
      }
    }

    // --------------------------------------------------
    // НЕТМОНЕТ
    // --------------------------------------------------

    if (/нет\s*монет|нетмонет/.test(lower) && amount !== null) {
      const channel = revenueChannels.find((c) =>
        /нет\s*монет|нетмонет/i.test(String(c.name || ''))
      );

      if (channel) {
        result.revenue[channel.id] = amount;
        continue;
      }
    }

    // --------------------------------------------------
    // ЛЮБОЙ ДРУГОЙ КАНАЛ ВЫРУЧКИ
    // --------------------------------------------------

    const revenueChannel = revenueChannels.find((channel) => {
      const channelName = String(channel.name || '')
        .toLowerCase()
        .trim();

      return channelName && lower.includes(channelName);
    });

    if (
      revenueChannel &&
      amount !== null &&
      /выруч|оплат|оборот/.test(lower)
    ) {
      result.revenue[revenueChannel.id] = amount;
      continue;
    }

    // --------------------------------------------------
    // КУРЬЕР
    // --------------------------------------------------

    if (/достав/.test(lower) && amount !== null) {
      result.courier.deliveries = amount;
      continue;
    }

    if (
      /\bкм\b/.test(lower) &&
      amount !== null
    ) {
      result.courier.km = amount;
      continue;
    }

    if (
      /курьер/.test(lower) &&
      amount !== null
    ) {
      result.courier.pay = amount;
      continue;
    }

    // --------------------------------------------------
    // ПРОМО
    // --------------------------------------------------

    if (/промо/.test(lower) && amount !== null) {
      result.promo.pay = amount;
      continue;
    }

    // --------------------------------------------------
    // ПОКУПКИ
    // --------------------------------------------------

    if (
      /покупк|закупк/.test(lower) &&
      amount !== null
    ) {
      const category = line
        .replace(numberMatch?.[0] || '', '')
        .replace(/покупки|покупка|закупки|закупка/gi, '')
        .replace(/[:\-]/g, '')
        .trim();

      result.purchases.push({
        category: category || 'Покупки',
        amount,
        include: true,
      });

      continue;
    }

    // --------------------------------------------------
    // ДРУГИЕ РАСХОДЫ
    // --------------------------------------------------

    if (
      /другие расходы|прочие расходы|расход\b|расходы\b/.test(lower) &&
      amount !== null
    ) {
      const category = line
        .replace(numberMatch?.[0] || '', '')
        .replace(/другие расходы|прочие расходы|расходы|расход/gi, '')
        .replace(/[:\-]/g, '')
        .trim();

      result.otherExpenses.push({
        category: category || 'Прочее',
        amount,
        include: true,
      });

      continue;
    }

    // --------------------------------------------------
    // НЕРАСПОЗНАННАЯ СТРОКА
    // --------------------------------------------------

    if (
      !/^(отч[её]т|дата|авансы|выручка|покупки|закупки|расходы|курьер|промо)/i.test(
        lower
      )
    ) {
      // Не считать просто текст ошибкой.
      // Но сохраняем его, чтобы пользователь мог увидеть.
      if (amount !== null) {
        result.unmatchedLines.push(line);
      }
    }
  }

  // --------------------------------------------------
  // РОСПИСЬ / КТО РАБОТАЛ
  // --------------------------------------------------

  result.rosterMatches = [];

  for (const employee of employees) {
    const firstName = String(employee.name || '')
      .trim()
      .split(/\s+/)[0]
      .toLowerCase();

    if (
      firstName &&
      lines.some((line) => {
        const l = line.toLowerCase().trim();

        return (
          l === firstName ||
          l === `${firstName}.` ||
          l.startsWith(`${firstName} `)
        );
      })
    ) {
      result.rosterMatches.push({
        raw: employee.name,
        employeeId: employee.id,
        matchedName: employee.name,
        include: true,
      });
    }
  }

  return result;
}
