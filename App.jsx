import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts';
import * as XLSX from 'xlsx';
import {
  LayoutDashboard, CalendarDays, Users, Wallet, Truck, FileBarChart2,
  Settings as SettingsIcon, ChevronLeft, ChevronRight, Plus, Trash2, X,
  Download, Lock, Unlock, Search, AlertTriangle, TrendingUp, TrendingDown,
  Copy as CopyIcon, Check, Minus, Printer, ChevronDown, ChevronUp, Info,
  UserPlus, Truck as TruckIcon, Megaphone, ClipboardList, Banknote,
  History, ArrowLeftRight, UploadCloud, DatabaseBackup, Menu, RotateCcw
} from 'lucide-react';

/* ============================== CONSTANTS ============================== */

const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_RU_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const WEEKDAYS_RU = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

const COLORS = {
  bg: '#F4F3EF',
  panel: '#FFFFFF',
  ink: '#1C2321',
  inkSoft: '#5B645F',
  line: '#E4E1D8',
  accent: '#1F6F54',      // deep pine green - revenue / positive
  accent2: '#B5652A',     // burnt clay - warning / expense highlight
  accent3: '#8A6BAE',     // muted plum - secondary
  danger: '#B33F3F',
  warn: '#C9832E',
  chartPalette: ['#1F6F54','#B5652A','#8A6BAE','#3A6EA5','#C9832E','#5B645F','#B33F3F','#4C8577'],
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const fmt0 = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));
const fmtRub = (n) => `${fmt0(n)} ₽`;
const fmtPct = (n) => `${(n || 0).toFixed(1)}%`;
const pad2 = (n) => String(n).padStart(2, '0');
const daysInMonth = (y, mIdx) => new Date(y, mIdx + 1, 0).getDate();
const dateStr = (y, mIdx, d) => `${y}-${pad2(mIdx + 1)}-${pad2(d)}`;
const monthKeyOf = (y, mIdx) => `${y}-${pad2(mIdx + 1)}`;
const dayOfMonthFromDateStr = (ds) => parseInt(ds.split('-')[2], 10);
const todayObj = () => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }; };

function defaultSettings() {
  return {
    standardShiftHours: 13,
    courierFuelRatePerKm: 7,
    anomalyThresholdPct: 60,
    acquiringPercent: 2,
    acquiringChannels: ['card', 'yandex'],
    revenueChannels: [
      { id: 'yandex', name: 'Яндекс Еда' },
      { id: 'netmonet', name: 'НетМонет' },
      { id: 'card', name: 'Карта' },
      { id: 'cash', name: 'Наличные' },
    ],
    expenseCategories: [
      'Связь', 'Канцелярия', 'Хозтовары', 'Ремонт', 'Реклама', 'Посуда',
      'Упаковка', 'Лампочки', 'Печать', 'Avito', 'Расходники', 'Прочее',
    ],
    fixedExpenses: [
      { id: uid(), name: 'Аренда', amount: 84000, group: 'fixed', paymentMethod: 'cashless', recurring: true },
      { id: uid(), name: 'Коммунальные платежи', amount: 60000, group: 'fixed', paymentMethod: 'cashless', recurring: true },
      { id: uid(), name: 'Кофе-машина', amount: 12000, group: 'fixed', paymentMethod: 'cashless', recurring: true },
      { id: uid(), name: 'iiko', amount: 8750, group: 'fixed', paymentMethod: 'cashless', recurring: true },
      { id: uid(), name: 'Охрана', amount: 2000, group: 'fixed', paymentMethod: 'cashless', recurring: true },
      { id: uid(), name: 'Флагман / лицевой счёт', amount: 6000, group: 'fixed', paymentMethod: 'cashless', recurring: true },
      { id: uid(), name: 'Налоги (организации)', amount: 20000, group: 'fixed', paymentMethod: 'cashless', recurring: true },
      { id: uid(), name: 'Подоходный налог (НДФЛ)', amount: 60000, group: 'fot_tax', paymentMethod: 'cashless', recurring: true },
    ],
  };
}

// Seeded demo data derived from the uploaded reference workbook (real staff names & rates)
// so the app is immediately explorable. All numeric daily entries below are illustrative.
function seedEmployees() {
  const mk = (name, position, payType, rate) => ({
    id: uid(), name, position, payType, rate, status: 'active',
    standardShift: null, startDate: '', endDate: '', comment: '',
  });
  return [
    mk('Алёна', 'Официант', 'shift', 2000),
    mk('Софа', 'Официант', 'shift', 2000),
    mk('Ника', 'Официант', 'shift', 1500),
    mk('Даяна', 'Хостес', 'hour', 150),
    mk('Света', 'Бармен', 'shift', 3000),
    mk('Саша', 'Управляющий', 'oklad', 90000),
    mk('Леня', 'Повар', 'shift', 3000),
    mk('Наталья', 'Повар', 'shift', 1750),
    mk('Ольга', 'Официант', 'shift', 1500),
    mk('Аня', 'Официант', 'shift', 1500),
    mk('Катя', 'Официант', 'shift', 1350),
    mk('Игорь', 'Повар', 'shift', 3000),
    mk('Люба', 'Официант', 'shift', 3000),
    mk('Слава', 'Директор', 'oklad', 100000),
    mk('Ирина', 'Бухгалтер', 'oklad', 35000),
  ];
}

function seedSuppliers() {
  return ['Амай', 'Мясноф', 'Продмаркет', 'Интегритта', 'Юск', 'Айпиджи', 'Грасс', 'Пиво', 'Напитки', 'Мясо ВДТ', 'Овощи', 'Амида', 'Каймакова']
    .map((name) => ({ id: uid(), name, archived: false }));
}

function emptyDay() {
  return {
    closed: false,
    revenue: {},
    kitchenExpenses: [],
    otherExpenses: [],
    courier: { deliveries: 0, pay: 0, km: 0, comment: '' },
    promo: { pay: 0, comment: '' },
  };
}

function emptyMonth(settings, prevMonth) {
  const src = (prevMonth && prevMonth.monthExpenses && prevMonth.monthExpenses.length)
    ? prevMonth.monthExpenses
    : settings.fixedExpenses.filter((f) => f.recurring);
  return {
    closed: false,
    days: {},
    shifts: {},
    adjustments: [],
    supplierOrders: [],
    supplierPayments: [],
    monthExpenses: src.map((f) => ({ id: uid(), sourceId: f.sourceId || f.id, name: f.name, amount: f.amount, group: f.group, paymentMethod: f.paymentMethod })),
  };
}

/* ============================== CALC ENGINE ============================== */

function getDay(month, ds) {
  return (month && month.days && month.days[ds]) || emptyDay();
}

function dayRevenueTotal(day, channels) {
  return channels.reduce((s, c) => s + (Number(day.revenue?.[c.id]) || 0), 0);
}

function monthRevenueByChannel(month, y, mIdx, channels) {
  const nd = daysInMonth(y, mIdx);
  const res = {}; channels.forEach((c) => (res[c.id] = 0));
  for (let d = 1; d <= nd; d++) {
    const day = getDay(month, dateStr(y, mIdx, d));
    channels.forEach((c) => { res[c.id] += Number(day.revenue?.[c.id]) || 0; });
  }
  return res;
}

function monthKitchenExpenseTotal(month, y, mIdx) {
  const nd = daysInMonth(y, mIdx); let total = 0; const items = [];
  for (let d = 1; d <= nd; d++) {
    const ds = dateStr(y, mIdx, d);
    const day = getDay(month, ds);
    (day.kitchenExpenses || []).forEach((e) => { total += Number(e.amount) || 0; items.push({ ...e, date: ds }); });
  }
  return { total, items };
}

function monthOtherExpenseTotal(month, y, mIdx) {
  const nd = daysInMonth(y, mIdx); let total = 0; const items = [];
  for (let d = 1; d <= nd; d++) {
    const ds = dateStr(y, mIdx, d);
    const day = getDay(month, ds);
    (day.otherExpenses || []).forEach((e) => { total += Number(e.amount) || 0; items.push({ ...e, date: ds }); });
  }
  return { total, items };
}

function monthCourierStats(month, y, mIdx, fuelRate) {
  const nd = daysInMonth(y, mIdx); let pay = 0, deliveries = 0, km = 0; const items = [];
  for (let d = 1; d <= nd; d++) {
    const ds = dateStr(y, mIdx, d);
    const day = getDay(month, ds);
    const c = day.courier || {};
    const dayPay = Number(c.pay) || 0;
    const dayKm = Number(c.km) || 0;
    const dayFuel = dayKm * fuelRate;
    pay += dayPay;
    km += dayKm;
    deliveries += Number(c.deliveries) || 0;
    if (dayPay || dayKm || c.deliveries) items.push({ date: ds, deliveries: c.deliveries || 0, pay: dayPay, km: dayKm, fuel: dayFuel, comment: c.comment || '' });
  }
  const fuelTotal = km * fuelRate;
  return { pay, km, fuelTotal, total: pay + fuelTotal, deliveries, items, avgPerDelivery: deliveries ? (pay + fuelTotal) / deliveries : 0 };
}

function monthPromoTotal(month, y, mIdx) {
  const nd = daysInMonth(y, mIdx); let total = 0; const items = [];
  for (let d = 1; d <= nd; d++) {
    const ds = dateStr(y, mIdx, d);
    const day = getDay(month, ds);
    if (day.promo?.pay) { total += Number(day.promo.pay) || 0; items.push({ date: ds, ...day.promo }); }
  }
  return { total, items };
}

function employeeHoursForHalf(month, empId, half) {
  const shifts = month.shifts?.[empId] || {};
  let hours = 0; const items = [];
  Object.entries(shifts).forEach(([ds, h]) => {
    const d = dayOfMonthFromDateStr(ds);
    const inHalf = half === 1 ? d <= 15 : d > 15;
    if (inHalf && Number(h) > 0) { hours += Number(h); items.push({ date: ds, hours: Number(h) }); }
  });
  return { hours, items };
}

function employeeAdjustments(month, empId) {
  return (month.adjustments || []).filter((a) => a.employeeId === empId);
}

function computeEmployeePay(emp, month, settings) {
  const standardShift = emp.standardShift || settings.standardShiftHours;
  const h1 = employeeHoursForHalf(month, emp.id, 1);
  const h2 = employeeHoursForHalf(month, emp.id, 2);
  const adj = employeeAdjustments(month, emp.id);
  const sumType = (half, types) => adj.filter((a) => a.half === half && types.includes(a.type)).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const bonus1 = sumType(1, ['bonus', 'motivation', 'manual']);
  const bonus2 = sumType(2, ['bonus', 'motivation', 'manual']);
  const deduct1 = sumType(1, ['penalty']);
  const deduct2 = sumType(2, ['penalty']);
  const advance1 = sumType(1, ['advance']);
  const advance2 = sumType(2, ['advance']);

  let base1 = 0, base2 = 0;
  if (emp.payType === 'shift') { base1 = emp.rate * (h1.hours / standardShift); base2 = emp.rate * (h2.hours / standardShift); }
  else if (emp.payType === 'hour') { base1 = emp.rate * h1.hours; base2 = emp.rate * h2.hours; }
  else if (emp.payType === 'oklad') { base1 = emp.rate / 2; base2 = emp.rate / 2; }

  const accrued1 = base1 + bonus1, accrued2 = base2 + bonus2;
  const payout1 = accrued1 - deduct1 - advance1, payout2 = accrued2 - deduct2 - advance2;
  const shiftsCount = emp.payType === 'shift' ? Math.round(((h1.hours + h2.hours) / standardShift) * 10) / 10 : null;

  return {
    empId: emp.id, name: emp.name, position: emp.position, payType: emp.payType, rate: emp.rate,
    standardShift, h1: h1.hours, h2: h2.hours, hours: h1.hours + h2.hours, shiftsCount,
    base1, base2, base: base1 + base2,
    bonus: bonus1 + bonus2, deduct: deduct1 + deduct2, advance: advance1 + advance2,
    accrued: accrued1 + accrued2, payout: payout1 + payout2,
    h1items: h1.items, h2items: h2.items, adjustments: adj,
  };
}

function isEmployeeActiveInMonth(emp, y, mIdx) {
  const monthStart = new Date(y, mIdx, 1), monthEnd = new Date(y, mIdx, daysInMonth(y, mIdx));
  const start = emp.startDate ? new Date(emp.startDate) : null;
  const end = emp.endDate ? new Date(emp.endDate) : null;
  if (start && start > monthEnd) return false;
  if (end && end < monthStart) return false;
  return true;
}

function monthPayroll(employees, month, settings, y, mIdx) {
  const active = employees.filter((e) => isEmployeeActiveInMonth(e, y, mIdx));
  const rows = active.map((e) => computeEmployeePay(e, month, settings)).filter((r) => r.hours > 0 || r.payType === 'oklad' || r.accrued !== 0 || r.advance !== 0 || r.deduct !== 0);
  const totalFot = rows.reduce((s, r) => s + r.accrued, 0);
  return { rows, totalFot };
}

// suppliers: aggregate orders/payments across ALL months up to (and including) target, chronologically
function allMonthKeysUpTo(monthsObj, y, mIdx) {
  const target = monthKeyOf(y, mIdx);
  return Object.keys(monthsObj).filter((k) => k <= target).sort();
}

function supplierLedger(monthsObj, suppliers, y, mIdx) {
  const keys = allMonthKeysUpTo(monthsObj, y, mIdx);
  const bySupplier = {};
  suppliers.forEach((s) => { bySupplier[s.id] = { supplier: s, ordered: 0, paid: 0, orders: [], payments: [] }; });
  keys.forEach((k) => {
    const m = monthsObj[k];
    (m.supplierOrders || []).forEach((o) => {
      if (!bySupplier[o.supplierId]) return;
      bySupplier[o.supplierId].ordered += Number(o.amount) || 0;
      bySupplier[o.supplierId].orders.push({ ...o, monthKey: k });
    });
    (m.supplierPayments || []).forEach((p) => {
      if (!bySupplier[p.supplierId]) return;
      bySupplier[p.supplierId].paid += Number(p.amount) || 0;
      bySupplier[p.supplierId].payments.push({ ...p, monthKey: k });
    });
  });
  return bySupplier;
}

function monthSupplierPaymentsTotal(month, suppliers) {
  const items = (month.supplierPayments || []).map((p) => ({ ...p, supplierName: suppliers.find((s) => s.id === p.supplierId)?.name || '—' }));
  return { total: items.reduce((s, p) => s + (Number(p.amount) || 0), 0), items };
}
function monthSupplierOrdersTotal(month, suppliers) {
  const items = (month.supplierOrders || []).map((p) => ({ ...p, supplierName: suppliers.find((s) => s.id === p.supplierId)?.name || '—' }));
  return { total: items.reduce((s, p) => s + (Number(p.amount) || 0), 0), items };
}

function computeAcquiring(month, settings, y, mIdx) {
  const byChannel = monthRevenueByChannel(month, y, mIdx, settings.revenueChannels);
  const base = settings.acquiringChannels.reduce((s, cid) => s + (byChannel[cid] || 0), 0);
  return { amount: base * (settings.acquiringPercent / 100), base, byChannel };
}

// Compares today's value against the average of the last 7 days that have data
// (looking back across month boundaries), and flags a deviation past threshold.
function computeAnomaly(monthsObj, selectedDate, valueGetter, { minPoints = 3, thresholdPct = 60 } = {}) {
  const priors = [];
  const d0 = new Date(selectedDate);
  for (let i = 1; i <= 7; i++) {
    const d = new Date(d0); d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const mk = ds.slice(0, 7);
    const m = monthsObj[mk];
    if (!m) continue;
    const v = valueGetter(getDay(m, ds));
    if (v > 0) priors.push(v);
  }
  if (priors.length < minPoints) return null;
  const avg = priors.reduce((a, b) => a + b, 0) / priors.length;
  if (avg === 0) return null;
  const mk0 = selectedDate.slice(0, 7);
  const currentMonth = monthsObj[mk0];
  const current = currentMonth ? valueGetter(getDay(currentMonth, selectedDate)) : 0;
  const diffPct = (Math.abs(current - avg) / avg) * 100;
  if (current > 0 && diffPct >= thresholdPct) return { avg, current, diffPct, direction: current > avg ? 'up' : 'down' };
  return null;
}

function swapRevert(r) {
  if (!r) return undefined;
  if ('oldValue' in r) return { ...r, oldValue: r.newValue, newValue: r.oldValue };
  if ('oldItem' in r) return { ...r, oldItem: r.newItem, newItem: r.oldItem };
  return undefined;
}

// Applies the stored "revert" payload of a history entry back onto app state,
// and logs a new (itself revertible) entry so undo/redo both work.
function applyRevertEntry(entry, { setMonths, setSuppliers, logAudit }) {
  const r = entry.revert;
  if (!r) return;
  switch (r.kind) {
    case 'revenueField':
      setMonths((prev) => {
        const m = prev[r.monthKey]; if (!m) return prev;
        const day = { ...getDay(m, r.date) };
        day.revenue = { ...day.revenue, [r.channelId]: r.oldValue };
        return { ...prev, [r.monthKey]: { ...m, days: { ...m.days, [r.date]: day } } };
      });
      break;
    case 'courierField':
      setMonths((prev) => {
        const m = prev[r.monthKey]; if (!m) return prev;
        const day = { ...getDay(m, r.date) };
        day.courier = { ...day.courier, [r.field]: r.oldValue };
        return { ...prev, [r.monthKey]: { ...m, days: { ...m.days, [r.date]: day } } };
      });
      break;
    case 'promoField':
      setMonths((prev) => {
        const m = prev[r.monthKey]; if (!m) return prev;
        const day = { ...getDay(m, r.date) };
        day.promo = { ...day.promo, pay: r.oldValue };
        return { ...prev, [r.monthKey]: { ...m, days: { ...m.days, [r.date]: day } } };
      });
      break;
    case 'expenseItem':
      setMonths((prev) => {
        const m = prev[r.monthKey]; if (!m) return prev;
        const day = { ...getDay(m, r.date) };
        day[r.listKey] = (day[r.listKey] || []).map((x) => (x.id === r.itemId ? r.oldItem : x));
        return { ...prev, [r.monthKey]: { ...m, days: { ...m.days, [r.date]: day } } };
      });
      break;
    case 'adjustmentItem':
      setMonths((prev) => {
        const m = prev[r.monthKey]; if (!m) return prev;
        return { ...prev, [r.monthKey]: { ...m, adjustments: (m.adjustments || []).map((a) => (a.id === r.adjustmentId ? r.oldItem : a)) } };
      });
      break;
    case 'supplierName':
      setSuppliers((prev) => prev.map((s) => (s.id === r.supplierId ? { ...s, name: r.oldValue } : s)));
      break;
    default:
      return;
  }
  logAudit({ what: `Восстановлено: ${entry.what}`, date: entry.date, from: entry.to, to: entry.from, category: entry.category, revert: swapRevert(r) });
}

function computePnL(data, y, mIdx) {
  const { settings, employees, suppliers, months } = data;
  const key = monthKeyOf(y, mIdx);
  const month = months[key] || emptyMonth(settings, null);
  const nd = daysInMonth(y, mIdx);

  const revByChannel = monthRevenueByChannel(month, y, mIdx, settings.revenueChannels);
  const revenue = Object.values(revByChannel).reduce((s, v) => s + v, 0);

  const kitchen = monthKitchenExpenseTotal(month, y, mIdx);
  const otherVar = monthOtherExpenseTotal(month, y, mIdx);
  const courier = monthCourierStats(month, y, mIdx, settings.courierFuelRatePerKm || 7);
  const promo = monthPromoTotal(month, y, mIdx);
  const supplierPay = monthSupplierPaymentsTotal(month, suppliers);
  const supplierOrd = monthSupplierOrdersTotal(month, suppliers);
  const acquiring = computeAcquiring(month, settings, y, mIdx);
  const payroll = monthPayroll(employees, month, settings, y, mIdx);

  const fixedItems = (month.monthExpenses || []).filter((f) => f.group === 'fixed');
  const fotTaxItems = (month.monthExpenses || []).filter((f) => f.group === 'fot_tax');
  const otherFixed = (month.monthExpenses || []).filter((f) => !['fixed', 'fot_tax'].includes(f.group));

  const fixedTotal = fixedItems.reduce((s, f) => s + (Number(f.amount) || 0), 0) + otherFixed.reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const fotTaxTotal = fotTaxItems.reduce((s, f) => s + (Number(f.amount) || 0), 0);

  // courier.total = ставка (pay) + бензин (km * тариф). Included exactly once in expenses below.
  const variableTotal = kitchen.total + supplierPay.total + courier.total + acquiring.amount + otherVar.total;
  const fotTotal = payroll.totalFot + courier.pay + promo.total + fotTaxTotal;
  const totalExpenses = kitchen.total + supplierPay.total + acquiring.amount + otherVar.total
    + payroll.totalFot + courier.total + promo.total + fotTaxTotal + fixedTotal;

  const profit = revenue - totalExpenses;
  const margin = revenue ? (profit / revenue) * 100 : 0;

  return {
    y, mIdx, key, nd, month,
    revenue, revByChannel,
    kitchen, otherVar, courier, promo, supplierPay, supplierOrd, acquiring, payroll,
    fixedItems, fotTaxItems, otherFixed, fixedTotal, fotTaxTotal,
    variableTotal, fotTotal, totalExpenses, profit, margin,
    foodCostPct: revenue ? ((kitchen.total + supplierPay.total) / revenue) * 100 : 0,
    laborCostPct: revenue ? (fotTotal / revenue) * 100 : 0,
    primeCostPct: revenue ? (((kitchen.total + supplierPay.total) + fotTotal) / revenue) * 100 : 0,
    opexPct: revenue ? (totalExpenses / revenue) * 100 : 0,
    netProfitPct: margin,
    avgDailyRevenue: revenue / nd,
    cashShare: revenue ? ((revByChannel.cash || 0) / revenue) * 100 : 0,
    cardShare: revenue ? ((revByChannel.card || 0) / revenue) * 100 : 0,
    aggregatorShare: revenue ? (((revByChannel.yandex || 0) + (revByChannel.netmonet || 0)) / revenue) * 100 : 0,
  };
}

/* ============================== SMALL UI PRIMITIVES ============================== */

function Card({ children, className = '', style = {} }) {
  return <div className={`rp-card ${className}`} style={style}>{children}</div>;
}

function Stat({ label, value, sub, delta, deltaGood = true, accent, onClick }) {
  return (
    <div className={`rp-stat ${onClick ? 'rp-clickable' : ''}`} onClick={onClick}>
      <div className="rp-stat-label">{label}</div>
      <div className="rp-stat-value" style={accent ? { color: accent } : {}}>{value}</div>
      {(sub || delta !== undefined) && (
        <div className="rp-stat-sub">
          {sub && <span>{sub}</span>}
          {delta !== undefined && (
            <span className={`rp-delta ${delta >= 0 === deltaGood ? 'rp-delta-good' : 'rp-delta-bad'}`}>
              {delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {fmtPct(Math.abs(delta))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="rp-modal-backdrop" onClick={onClose}>
      <div className={`rp-modal ${wide ? 'rp-modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="rp-modal-head">
          <h3>{title}</h3>
          <button className="rp-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="rp-modal-body">{children}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, message, onConfirm, onCancel, danger }) {
  return (
    <div className="rp-modal-backdrop" onClick={onCancel}>
      <div className="rp-modal" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="rp-modal-head"><h3>{title}</h3><button className="rp-icon-btn" onClick={onCancel}><X size={18} /></button></div>
        <div className="rp-modal-body">
          <p style={{ fontSize: 13, color: COLORS.inkSoft, marginTop: 0 }}>{message}</p>
          <div className="rp-modal-actions" style={{ gap: 8 }}>
            <button className="rp-btn rp-btn-ghost" onClick={onCancel}>Отмена</button>
            <button className="rp-btn" style={danger ? { background: COLORS.danger } : {}} onClick={onConfirm}>Подтвердить</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="rp-field"><span>{label}</span>{children}</label>;
}

function EmptyState({ icon, title, sub }) {
  return (
    <div className="rp-empty">
      {icon}
      <div className="rp-empty-title">{title}</div>
      {sub && <div className="rp-empty-sub">{sub}</div>}
    </div>
  );
}

/* ============================== APP SHELL ============================== */

const NAV = [
  { id: 'dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { id: 'day', label: 'День', icon: CalendarDays },
  { id: 'employees', label: 'Сотрудники', icon: Users },
  { id: 'payroll', label: 'Зарплата', icon: Wallet },
  { id: 'suppliers', label: 'Поставщики', icon: Truck },
  { id: 'pnl', label: 'P&L', icon: FileBarChart2 },
  { id: 'compare', label: 'Сравнение', icon: ArrowLeftRight },
  { id: 'history', label: 'История', icon: History },
  { id: 'settings', label: 'Настройки', icon: SettingsIcon },
];

export default function App() {
  const t = todayObj();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState('dashboard');
  const [year, setYear] = useState(t.y);
  const [monthIdx, setMonthIdx] = useState(t.m);
  const [selectedDate, setSelectedDate] = useState(dateStr(t.y, t.m, Math.min(t.d, daysInMonth(t.y, t.m))));

  const [settings, setSettings] = useState(defaultSettings());
  const [employees, setEmployees] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [months, setMonths] = useState({});
  const [auditLog, setAuditLog] = useState([]);

  const saveTimer = useRef(null);

  // ---- load ----
  useEffect(() => {
    (async () => {
      try {
        const raw = window.localStorage.getItem('restaurant-pnl-data');
        if (raw) {
          const parsed = JSON.parse(raw);
          setSettings(parsed.settings || defaultSettings());
          setEmployees(parsed.employees || seedEmployees());
          setSuppliers(parsed.suppliers || seedSuppliers());
          setMonths(parsed.months || {});
          setAuditLog(parsed.auditLog || []);
        } else {
          const emps = seedEmployees();
          const sups = seedSuppliers();
          setEmployees(emps);
          setSuppliers(sups);
        }
      } catch (e) {
        setEmployees(seedEmployees());
        setSuppliers(seedSuppliers());
      }
      setLoaded(true);
    })();
  }, []);

  // ---- autosave (debounced) ----
  useEffect(() => {
    if (!loaded) return;
    setSaving(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        window.localStorage.setItem('restaurant-pnl-data', JSON.stringify({ settings, employees, suppliers, months, auditLog }));
      } catch (e) { /* ignore */ }
      setSaving(false);
    }, 700);
    return () => clearTimeout(saveTimer.current);
  }, [settings, employees, suppliers, months, auditLog, loaded]);

  const monthKey = monthKeyOf(year, monthIdx);

  const ensureMonth = useCallback((y, mIdx) => {
    const key = monthKeyOf(y, mIdx);
    setMonths((prev) => {
      if (prev[key]) return prev;
      const prevKeyDate = new Date(y, mIdx - 1, 1);
      const prevKey = monthKeyOf(prevKeyDate.getFullYear(), prevKeyDate.getMonth());
      return { ...prev, [key]: emptyMonth(settings, prev[prevKey]) };
    });
  }, [settings]);

  useEffect(() => { if (loaded) ensureMonth(year, monthIdx); }, [year, monthIdx, loaded, ensureMonth]);

  useEffect(() => {
    if (!loaded) return;
    const [yy, mm, dd] = selectedDate.split('-').map(Number);
    if (yy !== year || mm !== monthIdx + 1) {
      const nd = daysInMonth(year, monthIdx);
      setSelectedDate(dateStr(year, monthIdx, Math.min(dd || 1, nd)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, monthIdx, loaded]);

  const month = months[monthKey] || emptyMonth(settings, null);

  const updateMonth = useCallback((updater) => {
    setMonths((prev) => {
      const cur = prev[monthKey] || emptyMonth(settings, null);
      const next = updater(cur);
      return { ...prev, [monthKey]: next };
    });
  }, [monthKey, settings]);

  const logAudit = useCallback((entry) => {
    setAuditLog((prev) => [{ id: uid(), ts: new Date().toISOString(), ...entry }, ...prev].slice(0, 500));
  }, []);

  const pnl = useMemo(() => computePnL({ settings, employees, suppliers, months }, year, monthIdx), [settings, employees, suppliers, months, year, monthIdx]);

  const yearOptions = useMemo(() => {
    const base = todayObj().y;
    const set = new Set();
    for (let y2 = base - 3; y2 <= base + 3; y2++) set.add(y2);
    set.add(year);
    Object.keys(months).forEach((k) => set.add(Number(k.split('-')[0])));
    return Array.from(set).sort((a, b) => a - b);
  }, [months, year]);

  const prevMonthDate = new Date(year, monthIdx - 1, 1);
  const prevPnl = useMemo(() => computePnL({ settings, employees, suppliers, months }, prevMonthDate.getFullYear(), prevMonthDate.getMonth()), [settings, employees, suppliers, months, year, monthIdx]);

  const goMonth = (delta) => {
    const d = new Date(year, monthIdx + delta, 1);
    setYear(d.getFullYear()); setMonthIdx(d.getMonth());
    setSelectedDate(dateStr(d.getFullYear(), d.getMonth(), 1));
  };

  const applyRevert = useCallback((entry) => {
    applyRevertEntry(entry, { setMonths, setSuppliers, logAudit });
  }, [setMonths, setSuppliers, logAudit]);

  const ctx = {
    settings, setSettings, employees, setEmployees, suppliers, setSuppliers,
    months, setMonths, month, updateMonth, monthKey, year, monthIdx, setYear, setMonthIdx,
    selectedDate, setSelectedDate, pnl, prevPnl, logAudit, auditLog, setAuditLog, goMonth, applyRevert,
  };

  if (!loaded) {
    return <div style={{ padding: 40, fontFamily: 'Inter, sans-serif', color: COLORS.inkSoft }}>Загрузка…</div>;
  }

  return (
    <div className="rp-root">
      <GlobalStyle />
      <aside className="rp-sidebar">
        <div className="rp-brand">
          <div className="rp-brand-mark">С</div>
          <div>
            <div className="rp-brand-name">СИОСАН</div>
            <div className="rp-brand-sub">Управленческий P&L</div>
          </div>
        </div>
        <nav className="rp-nav">
          {NAV.map((n) => (
            <button key={n.id} className={`rp-nav-item ${page === n.id ? 'active' : ''}`} onClick={() => setPage(n.id)}>
              <n.icon size={17} /> {n.label}
            </button>
          ))}
        </nav>
        <div className="rp-sidebar-foot">
          <span className={`rp-save-dot ${saving ? 'busy' : ''}`} />
          {saving ? 'Сохранение…' : 'Сохранено'}
        </div>
      </aside>

      <div className="rp-main">
        <header className="rp-topbar">
          <div className="rp-month-switch">
            <button className="rp-icon-btn" onClick={() => goMonth(-1)}><ChevronLeft size={18} /></button>
            <select className="rp-period-select" value={monthIdx} onChange={(e) => setMonthIdx(Number(e.target.value))}>
              {MONTHS_RU.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select className="rp-period-select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((y2) => <option key={y2} value={y2}>{y2}</option>)}
            </select>
            <button className="rp-icon-btn" onClick={() => goMonth(1)}><ChevronRight size={18} /></button>
            <button className="rp-chip" onClick={() => { const t = todayObj(); setYear(t.y); setMonthIdx(t.m); setSelectedDate(dateStr(t.y, t.m, t.d)); }}>Сегодня</button>
            {month.closed
              ? <button className="rp-chip rp-chip-locked" onClick={() => { updateMonth((m) => ({ ...m, closed: false })); logAudit({ what: 'Месяц разблокирован', month: monthKey }); }}><Lock size={13} /> Закрыт · разблокировать</button>
              : <button className="rp-chip" onClick={() => { updateMonth((m) => ({ ...m, closed: true })); logAudit({ what: 'Месяц закрыт', month: monthKey }); }}><Unlock size={13} /> Закрыть месяц</button>}
          </div>
          <div className="rp-topbar-right">
            <ExportMenu ctx={ctx} />
          </div>
        </header>

        <main className="rp-content">
          {page === 'dashboard' && <Dashboard ctx={ctx} setPage={setPage} />}
          {page === 'day' && <DayEntry ctx={ctx} />}
          {page === 'employees' && <EmployeesPage ctx={ctx} />}
          {page === 'payroll' && <PayrollPage ctx={ctx} />}
          {page === 'suppliers' && <SuppliersPage ctx={ctx} />}
          {page === 'pnl' && <PnLPage ctx={ctx} />}
          {page === 'settings' && <SettingsPage ctx={ctx} />}
          {page === 'compare' && <ComparePage ctx={ctx} />}
          {page === 'history' && <HistoryPage ctx={ctx} />}
        </main>
      </div>
    </div>
  );
}

/* ============================== DASHBOARD ============================== */

function Dashboard({ ctx, setPage }) {
  const { pnl, prevPnl, month, settings, year, monthIdx, selectedDate, setSelectedDate } = ctx;
  const [drill, setDrill] = useState(null);

  const todayDay = getDay(month, selectedDate);
  const todayRevenue = dayRevenueTotal(todayDay, settings.revenueChannels);

  const dailySeries = useMemo(() => {
    const arr = [];
    for (let d = 1; d <= pnl.nd; d++) {
      const ds = dateStr(year, monthIdx, d);
      const day = getDay(month, ds);
      const rev = dayRevenueTotal(day, settings.revenueChannels);
      const exp = (day.kitchenExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0)
        + (day.otherExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0)
        + (Number(day.courier?.pay) || 0) + (Number(day.courier?.km) || 0) * (settings.courierFuelRatePerKm || 7) + (Number(day.promo?.pay) || 0);
      arr.push({ day: d, Выручка: rev, Расходы: exp, Прибыль: rev - exp });
    }
    return arr;
  }, [month, year, monthIdx, pnl.nd, settings.revenueChannels]);

  const structureData = [
    { name: 'Закупки/кухня', value: pnl.kitchen.total + pnl.supplierPay.total },
    { name: 'ФОТ', value: pnl.payroll.totalFot },
    { name: 'Курьеры (ставка+бензин)', value: pnl.courier.total },
    { name: 'Промо', value: pnl.promo.total },
    { name: 'Эквайринг', value: pnl.acquiring.amount },
    { name: 'Постоянные', value: pnl.fixedTotal },
    { name: 'Прочие пер.', value: pnl.otherVar.total },
    { name: 'Налоги ФОТ', value: pnl.fotTaxTotal },
  ].filter((d) => d.value > 0);

  const delta = (a, b) => (b ? ((a - b) / b) * 100 : 0);

  return (
    <div className="rp-page">
      <div className="rp-page-head">
        <h1>Дашборд</h1>
        <div className="rp-page-sub">{MONTHS_RU[monthIdx]} {year} · {pnl.nd} дней</div>
      </div>

      {pnl.profit < 0 && (
        <div className="rp-alert">
          <AlertTriangle size={16} /> Месяц пока убыточный: {fmtRub(pnl.profit)}. Проверьте расходы или довнесите данные за оставшиеся дни.
        </div>
      )}

      <div className="rp-grid-4">
        <Stat label="Выручка за месяц" value={fmtRub(pnl.revenue)} delta={delta(pnl.revenue, prevPnl.revenue)} onClick={() => setPage('pnl')} />
        <Stat label={`Выручка сегодня (${selectedDate.split('-').reverse().join('.')})`} value={fmtRub(todayRevenue)} onClick={() => setPage('day')} />
        <Stat label="Средняя дневная выручка" value={fmtRub(pnl.avgDailyRevenue)} />
        <Stat label="Расходы за месяц" value={fmtRub(pnl.totalExpenses)} delta={delta(pnl.totalExpenses, prevPnl.totalExpenses)} deltaGood={false} onClick={() => setDrill('expenses')} />
        <Stat label="ФОТ" value={fmtRub(pnl.payroll.totalFot)} sub={fmtPct(pnl.laborCostPct) + ' от выручки'} onClick={() => setPage('payroll')} />
        <Stat label="Закупки (Food Cost)" value={fmtRub(pnl.kitchen.total + pnl.supplierPay.total)} sub={fmtPct(pnl.foodCostPct) + ' от выручки'} />
        <Stat label="Постоянные расходы" value={fmtRub(pnl.fixedTotal)} />
        <Stat label="Переменные расходы" value={fmtRub(pnl.variableTotal)} />
        <Stat label="Прибыль" value={fmtRub(pnl.profit)} accent={pnl.profit >= 0 ? COLORS.accent : COLORS.danger} delta={delta(pnl.profit, prevPnl.profit)} onClick={() => setPage('pnl')} />
        <Stat label="Рентабельность" value={fmtPct(pnl.margin)} accent={pnl.margin >= 0 ? COLORS.accent : COLORS.danger} />
        <Stat label="Доставок за месяц" value={fmt0(pnl.courier.deliveries)} sub={`сред. ${fmtRub(pnl.courier.avgPerDelivery)} / достав.`} />
        <Stat label="Задолженность поставщикам" value={fmtRub(supplierDebtTotal(ctx))} accent={COLORS.accent2} onClick={() => setPage('suppliers')} />
      </div>

      <div className="rp-grid-2">
        <Card>
          <div className="rp-card-title">Выручка и расходы по дням</div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={dailySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => fmtRub(v)} />
              <Area type="monotone" dataKey="Выручка" stroke={COLORS.accent} fill={COLORS.accent} fillOpacity={0.15} strokeWidth={2} />
              <Area type="monotone" dataKey="Расходы" stroke={COLORS.accent2} fill={COLORS.accent2} fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <div className="rp-card-title">Динамика прибыли</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dailySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => fmtRub(v)} />
              <Bar dataKey="Прибыль" radius={[3, 3, 0, 0]}>
                {dailySeries.map((e, i) => <Cell key={i} fill={e['Прибыль'] >= 0 ? COLORS.accent : COLORS.danger} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="rp-grid-2">
        <Card>
          <div className="rp-card-title">Структура расходов</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={structureData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={55}>
                {structureData.map((e, i) => <Cell key={i} fill={COLORS.chartPalette[i % COLORS.chartPalette.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtRub(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <div className="rp-card-title">Выручка по каналам</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={settings.revenueChannels.map((c) => ({ name: c.name, value: pnl.revByChannel[c.id] || 0 }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={55}>
                {settings.revenueChannels.map((c, i) => <Cell key={i} fill={COLORS.chartPalette[i % COLORS.chartPalette.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtRub(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {drill === 'expenses' && (
        <Modal title="Детализация расходов месяца" onClose={() => setDrill(null)} wide>
          <ExpenseBreakdownTable pnl={pnl} />
        </Modal>
      )}
    </div>
  );
}

function supplierDebtTotal(ctx) {
  const ledger = supplierLedger(ctx.months, ctx.suppliers, ctx.year, ctx.monthIdx);
  return Object.values(ledger).reduce((s, v) => s + (v.ordered - v.paid), 0);
}

function ExpenseBreakdownTable({ pnl }) {
  const rows = [
    ['Закупки кухня/бар (нал)', pnl.kitchen.total],
    ['Поставщики — оплачено', pnl.supplierPay.total],
    ['Курьеры — ставка', pnl.courier.pay],
    ['Курьеры — бензин', pnl.courier.fuelTotal],
    ['Промо', pnl.promo.total],
    ['Эквайринг', pnl.acquiring.amount],
    ['Прочие переменные', pnl.otherVar.total],
    ['ФОТ (начислено)', pnl.payroll.totalFot],
    ['Налоги на сотрудников', pnl.fotTaxTotal],
    ['Постоянные расходы', pnl.fixedTotal],
  ];
  return (
    <table className="rp-table">
      <thead><tr><th>Статья</th><th>Сумма</th><th>% от расходов</th></tr></thead>
      <tbody>
        {rows.map(([name, val]) => (
          <tr key={name}><td>{name}</td><td className="rp-num">{fmtRub(val)}</td><td className="rp-num">{fmtPct(pnl.totalExpenses ? (val / pnl.totalExpenses) * 100 : 0)}</td></tr>
        ))}
        <tr className="rp-total-row"><td>Итого расходов</td><td className="rp-num">{fmtRub(pnl.totalExpenses)}</td><td /></tr>
      </tbody>
    </table>
  );
}

/* ============================== DAY ENTRY ============================== */

function DayEntry({ ctx }) {
  const { month, updateMonth, settings, year, monthIdx, selectedDate, setSelectedDate, logAudit } = ctx;
  const nd = daysInMonth(year, monthIdx);
  const day = getDay(month, selectedDate);
  const dayClosed = !!day.closed;
  const monthClosed = month.closed;
  const locked = monthClosed || dayClosed;
  const [expenseModal, setExpenseModal] = useState(null); // { kind: 'kitchen'|'other', editItem: null|item }

  const toggleDayClosed = () => {
    updateMonth((m) => {
      const d = { ...getDay(m, selectedDate) };
      d.closed = !d.closed;
      return { ...m, days: { ...m.days, [selectedDate]: d } };
    });
    logAudit({ what: dayClosed ? 'Смена разблокирована' : 'Смена закрыта', date: selectedDate });
  };

  const setRevenue = (channelId, val) => {
    updateMonth((m) => {
      const days = { ...m.days };
      const d = { ...getDay(m, selectedDate) };
      d.revenue = { ...d.revenue, [channelId]: val === '' ? '' : Number(val) };
      days[selectedDate] = d;
      return { ...m, days };
    });
  };

  const total = dayRevenueTotal(day, settings.revenueChannels);
  const kitchenTotal = (day.kitchenExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const otherTotal = (day.otherExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const [dismissed, setDismissed] = useState({});
  const anomOpts = { thresholdPct: settings.anomalyThresholdPct || 60 };
  const revenueAnomaly = useMemo(
    () => computeAnomaly(ctx.months, selectedDate, (d) => dayRevenueTotal(d, settings.revenueChannels), anomOpts),
    [ctx.months, selectedDate, settings.revenueChannels, settings.anomalyThresholdPct]
  );
  const expenseAnomaly = useMemo(
    () => computeAnomaly(ctx.months, selectedDate, (d) =>
      (d.kitchenExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0) +
      (d.otherExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0), anomOpts),
    [ctx.months, selectedDate, settings.anomalyThresholdPct]
  );
  const courierAnomaly = useMemo(
    () => computeAnomaly(ctx.months, selectedDate, (d) =>
      (Number(d.courier?.pay) || 0) + (Number(d.courier?.km) || 0) * (settings.courierFuelRatePerKm || 7), anomOpts),
    [ctx.months, selectedDate, settings.courierFuelRatePerKm, settings.anomalyThresholdPct]
  );
  const promoAnomaly = useMemo(
    () => computeAnomaly(ctx.months, selectedDate, (d) => Number(d.promo?.pay) || 0, anomOpts),
    [ctx.months, selectedDate, settings.anomalyThresholdPct]
  );
  const dismissKey = (kind) => `${selectedDate}:${kind}`;
  const dismiss = (kind) => setDismissed((p) => ({ ...p, [dismissKey(kind)]: true }));

  const [advanceModal, setAdvanceModal] = useState(null); // true (new) | advance object (edit)
  const dayAdvances = (month.adjustments || []).filter((a) => a.type === 'advance' && a.date === selectedDate);
  const dayAdvanceTotal = dayAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const saveAdvance = (employeeId, amount, comment, editId) => {
    const half = dayOfMonthFromDateStr(selectedDate) <= 15 ? 1 : 2;
    updateMonth((m) => {
      const list = m.adjustments || [];
      if (editId) {
        return { ...m, adjustments: list.map((a) => (a.id === editId ? { ...a, employeeId, amount: Number(amount), comment } : a)) };
      }
      return { ...m, adjustments: [...list, { id: uid(), employeeId, type: 'advance', half, amount: Number(amount), comment, date: selectedDate }] };
    });
    logAudit({ what: editId ? 'Аванс изменён' : 'Аванс сотруднику', date: selectedDate, amount });
    setAdvanceModal(null);
  };
  const deleteAdvance = (id) => updateMonth((m) => ({ ...m, adjustments: (m.adjustments || []).filter((a) => a.id !== id) }));

  const setCourier = (field, val) => updateMonth((m) => {
    const d = { ...getDay(m, selectedDate) };
    d.courier = { ...d.courier, [field]: val };
    return { ...m, days: { ...m.days, [selectedDate]: d } };
  });
  const setPromo = (field, val) => updateMonth((m) => {
    const d = { ...getDay(m, selectedDate) };
    d.promo = { ...d.promo, [field]: val };
    return { ...m, days: { ...m.days, [selectedDate]: d } };
  });

  return (
    <div className="rp-page">
      <div className="rp-page-head">
        <h1>День</h1>
        <div className="rp-page-sub">Быстрый ежедневный ввод выручки и расходов</div>
      </div>

      <div className="rp-day-strip">
        {Array.from({ length: nd }, (_, i) => i + 1).map((d) => {
          const ds = dateStr(year, monthIdx, d);
          const dow = new Date(year, monthIdx, d).getDay();
          const dayData = month.days?.[ds];
          const has = dayData && (dayRevenueTotal(dayData, settings.revenueChannels) > 0 || (dayData.kitchenExpenses || []).length || (dayData.otherExpenses || []).length);
          const isClosed = dayData?.closed;
          return (
            <button key={d} className={`rp-day-chip ${ds === selectedDate ? 'active' : ''} ${has ? 'has-data' : ''} ${dow === 0 || dow === 6 ? 'weekend' : ''} ${isClosed ? 'day-closed' : ''}`} onClick={() => setSelectedDate(ds)} title={isClosed ? 'Смена закрыта' : undefined}>
              {d}{isClosed && <Lock size={8} className="rp-day-chip-lock" />}
            </button>
          );
        })}
      </div>

      {monthClosed && <div className="rp-alert rp-alert-info"><Lock size={16} /> Месяц закрыт для редактирования. Разблокируйте его в шапке, чтобы вносить изменения.</div>}
      {!monthClosed && dayClosed && <div className="rp-alert rp-alert-info"><Lock size={16} /> Смена за этот день закрыта. Нажмите «Разблокировать смену», если нужно что-то исправить.</div>}

      {revenueAnomaly && !dismissed[dismissKey('revenue')] && (
        <div className="rp-alert rp-alert-warn">
          <AlertTriangle size={16} />
          <span>Выручка сегодня ({fmtRub(revenueAnomaly.current)}) отличается от среднего за последние дни ({fmtRub(revenueAnomaly.avg)}) на {revenueAnomaly.diffPct.toFixed(0)}%. Проверьте, всё ли верно.</span>
          <button className="rp-alert-dismiss" onClick={() => dismiss('revenue')}>Всё верно, скрыть</button>
        </div>
      )}
      {expenseAnomaly && !dismissed[dismissKey('expense')] && (
        <div className="rp-alert rp-alert-warn">
          <AlertTriangle size={16} />
          <span>Расходы кухни/бар за сегодня ({fmtRub(expenseAnomaly.current)}) отличаются от среднего ({fmtRub(expenseAnomaly.avg)}) на {expenseAnomaly.diffPct.toFixed(0)}%. Проверьте, всё ли верно.</span>
          <button className="rp-alert-dismiss" onClick={() => dismiss('expense')}>Всё верно, скрыть</button>
        </div>
      )}
      {courierAnomaly && !dismissed[dismissKey('courier')] && (
        <div className="rp-alert rp-alert-warn">
          <AlertTriangle size={16} />
          <span>Расходы на курьера сегодня ({fmtRub(courierAnomaly.current)}) отличаются от среднего ({fmtRub(courierAnomaly.avg)}) на {courierAnomaly.diffPct.toFixed(0)}%. Проверьте, всё ли верно.</span>
          <button className="rp-alert-dismiss" onClick={() => dismiss('courier')}>Всё верно, скрыть</button>
        </div>
      )}
      {promoAnomaly && !dismissed[dismissKey('promo')] && (
        <div className="rp-alert rp-alert-warn">
          <AlertTriangle size={16} />
          <span>Расходы на промо сегодня ({fmtRub(promoAnomaly.current)}) отличаются от среднего ({fmtRub(promoAnomaly.avg)}) на {promoAnomaly.diffPct.toFixed(0)}%. Проверьте, всё ли верно.</span>
          <button className="rp-alert-dismiss" onClick={() => dismiss('promo')}>Всё верно, скрыть</button>
        </div>
      )}

      <div className="rp-day-header">
        <div className="rp-day-title">{new Date(selectedDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })}</div>
        {!monthClosed && (
          dayClosed
            ? <button className="rp-chip rp-chip-locked" onClick={toggleDayClosed}><Lock size={13} /> Смена закрыта · разблокировать</button>
            : <button className="rp-chip" onClick={toggleDayClosed}><Unlock size={13} /> Закрыть смену</button>
        )}
      </div>

      <div className="rp-grid-2">
        <Card>
          <div className="rp-card-title">Выручка</div>
          <div className="rp-form-grid">
            {settings.revenueChannels.map((c) => (
              <Field key={c.id} label={c.name}>
                <input disabled={locked} type="number" value={day.revenue?.[c.id] ?? ''} onChange={(e) => setRevenue(c.id, e.target.value)} placeholder="0" />
              </Field>
            ))}
          </div>
          <div className="rp-day-total">Итого за день <b>{fmtRub(total)}</b></div>
        </Card>

        <Card>
          <div className="rp-card-title">Курьеры и промо</div>
          <div className="rp-form-grid">
            <Field label="Доставок за день">
              <input disabled={locked} type="number" value={day.courier?.deliveries ?? ''} onChange={(e) => setCourier('deliveries', Number(e.target.value))} placeholder="0" />
            </Field>
            <Field label="Ставка курьера за день">
              <input disabled={locked} type="number" value={day.courier?.pay ?? ''} onChange={(e) => setCourier('pay', Number(e.target.value))} placeholder="0" />
            </Field>
            <Field label="Пробег курьера, км">
              <input disabled={locked} type="number" value={day.courier?.km ?? ''} onChange={(e) => setCourier('km', Number(e.target.value))} placeholder="0" />
            </Field>
            <Field label="Зарплата промо">
              <input disabled={locked} type="number" value={day.promo?.pay ?? ''} onChange={(e) => setPromo('pay', Number(e.target.value))} placeholder="0" />
            </Field>
          </div>
          <div className="rp-day-total">
            Бензин курьера ({fmt0(day.courier?.km || 0)} км × {settings.courierFuelRatePerKm || 7} ₽/км)
            <b>{fmtRub((Number(day.courier?.km) || 0) * (settings.courierFuelRatePerKm || 7))}</b>
          </div>
        </Card>
      </div>

      <div className="rp-grid-2">
        <Card>
          <div className="rp-card-title-row">
            <div className="rp-card-title">Авансы сотрудникам <span className="rp-muted">— {fmtRub(dayAdvanceTotal)}</span></div>
            <button className="rp-btn rp-btn-sm" disabled={locked} onClick={() => setAdvanceModal(true)}><Plus size={14} /> Выдать аванс</button>
          </div>
          {dayAdvances.length === 0 ? (
            <EmptyState icon={<Banknote size={26} color={COLORS.inkSoft} />} title="Авансов сегодня не выдавали" />
          ) : (
            <div className="rp-list">
              {dayAdvances.map((a) => {
                const emp = ctx.employees.find((e) => e.id === a.employeeId);
                return (
                  <div className="rp-list-row" key={a.id}>
                    <div className="rp-list-main rp-clickable" onClick={() => !locked && setAdvanceModal(a)}>
                      <div className="rp-list-cat">{emp?.name || '—'}</div>{a.comment && <div className="rp-list-comment">{a.comment}</div>}
                    </div>
                    <div className="rp-list-amount">−{fmtRub(a.amount)}</div>
                    {!locked && <button className="rp-icon-btn" onClick={() => setAdvanceModal(a)}>✎</button>}
                    {!locked && <button className="rp-icon-btn rp-icon-btn-danger" onClick={() => deleteAdvance(a.id)}><Trash2 size={14} /></button>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card>
          <div className="rp-card-title-row">
            <div className="rp-card-title">Расходы кухня / бар <span className="rp-muted">— {fmtRub(kitchenTotal)}</span></div>
            <button className="rp-btn rp-btn-sm" disabled={locked} onClick={() => setExpenseModal({ kind: 'kitchen', editItem: null })}><Plus size={14} /> Добавить</button>
          </div>
          <ExpenseList items={day.kitchenExpenses || []} locked={locked}
            onEdit={(item) => setExpenseModal({ kind: 'kitchen', editItem: item })}
            onDelete={(id) => updateMonth((m) => {
              const d = { ...getDay(m, selectedDate) }; d.kitchenExpenses = d.kitchenExpenses.filter((x) => x.id !== id);
              return { ...m, days: { ...m.days, [selectedDate]: d } };
            })} />
        </Card>
      </div>

      <Card>
        <div className="rp-card-title-row">
          <div className="rp-card-title">Прочие расходы <span className="rp-muted">— {fmtRub(otherTotal)}</span></div>
          <button className="rp-btn rp-btn-sm" disabled={locked} onClick={() => setExpenseModal({ kind: 'other', editItem: null })}><Plus size={14} /> Добавить</button>
        </div>
        <ExpenseList items={day.otherExpenses || []} locked={locked} showMethod
          onEdit={(item) => setExpenseModal({ kind: 'other', editItem: item })}
          onDelete={(id) => updateMonth((m) => {
            const d = { ...getDay(m, selectedDate) }; d.otherExpenses = d.otherExpenses.filter((x) => x.id !== id);
            return { ...m, days: { ...m.days, [selectedDate]: d } };
          })} />
      </Card>

      {advanceModal && (
        <AdvanceModal
          employees={ctx.employees}
          initial={typeof advanceModal === 'object' ? advanceModal : null}
          onClose={() => setAdvanceModal(null)}
          onSave={(employeeId, amount, comment) => saveAdvance(employeeId, amount, comment, typeof advanceModal === 'object' ? advanceModal.id : null)}
        />
      )}

      {expenseModal && (
        <AddExpenseModal
          title={(expenseModal.editItem ? 'Изменить расход — ' : 'Новый расход — ') + (expenseModal.kind === 'kitchen' ? 'кухня / бар' : 'прочее')}
          categories={expenseModal.kind === 'kitchen' ? ['Продукты', 'Напитки', 'Хозтовары кухни', 'Ремонт оборудования', 'Прочее'] : settings.expenseCategories}
          showMethod={expenseModal.kind === 'other'}
          initial={expenseModal.editItem}
          onClose={() => setExpenseModal(null)}
          onSave={(exp) => {
            updateMonth((m) => {
              const d = { ...getDay(m, selectedDate) };
              const key = expenseModal.kind === 'kitchen' ? 'kitchenExpenses' : 'otherExpenses';
              const list = d[key] || [];
              d[key] = expenseModal.editItem
                ? list.map((x) => (x.id === expenseModal.editItem.id ? { ...x, ...exp } : x))
                : [...list, { id: uid(), ...exp }];
              return { ...m, days: { ...m.days, [selectedDate]: d } };
            });
            logAudit({ what: `${expenseModal.editItem ? 'Изменён' : 'Добавлен'} расход (${expenseModal.kind})`, date: selectedDate, amount: exp.amount, category: exp.category });
            setExpenseModal(null);
          }}
        />
      )}
    </div>
  );
}

function ExpenseList({ items, onDelete, onEdit, locked, showMethod }) {
  if (!items.length) return <EmptyState icon={<ClipboardList size={26} color={COLORS.inkSoft} />} title="Пока нет операций" sub="Нажмите «Добавить», чтобы внести расход" />;
  return (
    <div className="rp-list">
      {items.map((e) => (
        <div className="rp-list-row" key={e.id}>
          <div className={`rp-list-main ${!locked ? 'rp-clickable' : ''}`} onClick={() => !locked && onEdit && onEdit(e)}>
            <div className="rp-list-cat">{e.category}{showMethod && e.method ? ` · ${e.method === 'cash' ? 'нал' : 'безнал'}` : ''}</div>
            {e.comment && <div className="rp-list-comment">{e.comment}</div>}
          </div>
          <div className="rp-list-amount">{fmtRub(e.amount)}</div>
          {!locked && onEdit && <button className="rp-icon-btn" onClick={() => onEdit(e)}>✎</button>}
          {!locked && <button className="rp-icon-btn rp-icon-btn-danger" onClick={() => onDelete(e.id)}><Trash2 size={14} /></button>}
        </div>
      ))}
    </div>
  );
}

function AddExpenseModal({ title, categories, onClose, onSave, showMethod, initial }) {
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [category, setCategory] = useState(initial?.category || categories[0] || '');
  const [comment, setComment] = useState(initial?.comment || '');
  const [method, setMethod] = useState(initial?.method || 'cash');
  return (
    <Modal title={title} onClose={onClose}>
      <div className="rp-form-grid">
        <Field label="Сумма ₽"><input type="number" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && amount && onSave({ amount: Number(amount), category, comment, method })} /></Field>
        <Field label="Категория">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        {showMethod && (
          <Field label="Способ оплаты">
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Наличные</option>
              <option value="cashless">Безналичные</option>
            </select>
          </Field>
        )}
        <Field label="Комментарий"><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Необязательно" /></Field>
      </div>
      <div className="rp-modal-actions">
        <button className="rp-btn" disabled={!amount} onClick={() => onSave({ amount: Number(amount), category, comment, method })}>{initial ? 'Сохранить изменения' : 'Сохранить'}</button>
      </div>
    </Modal>
  );
}

function AdvanceModal({ employees, onClose, onSave, initial }) {
  const active = employees.filter((e) => e.status === 'active');
  const editedEmp = initial && employees.find((e) => e.id === initial.employeeId);
  const options = editedEmp && editedEmp.status !== 'active' ? [editedEmp, ...active] : active;
  const [employeeId, setEmployeeId] = useState(initial?.employeeId || active[0]?.id || '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [comment, setComment] = useState(initial?.comment || '');
  return (
    <Modal title={initial ? 'Изменить аванс' : 'Выдать аванс'} onClose={onClose}>
      {options.length === 0 ? (
        <EmptyState icon={<Banknote size={24} color={COLORS.inkSoft} />} title="Нет активных сотрудников" sub="Добавьте сотрудника в разделе «Сотрудники»" />
      ) : (
        <>
          <div className="rp-form-grid">
            <Field label="Сотрудник">
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                {options.map((e) => <option key={e.id} value={e.id}>{e.name}{e.status !== 'active' ? ' (уволен)' : ''}</option>)}
              </select>
            </Field>
            <Field label="Сумма ₽"><input type="number" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && amount && onSave(employeeId, amount, comment)} /></Field>
          </div>
          <Field label="Комментарий"><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Необязательно" /></Field>
          <div className="rp-modal-actions">
            <button className="rp-btn" disabled={!amount || !employeeId} onClick={() => onSave(employeeId, amount, comment)}>{initial ? 'Сохранить изменения' : 'Выдать аванс'}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ============================== EMPLOYEES ============================== */

function EmployeesPage({ ctx }) {
  const { employees, setEmployees, month, updateMonth, settings, year, monthIdx, logAudit } = ctx;
  const [editing, setEditing] = useState(null); // employee obj or 'new'
  const [shiftsFor, setShiftsFor] = useState(null); // employee id
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [search, setSearch] = useState('');
  const nd = daysInMonth(year, monthIdx);

  const visible = employees.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));

  const saveEmployee = (emp) => {
    setEmployees((prev) => {
      const exists = prev.some((p) => p.id === emp.id);
      return exists ? prev.map((p) => (p.id === emp.id ? emp : p)) : [...prev, emp];
    });
    logAudit({ what: 'Сохранён сотрудник', employee: emp.name });
    setEditing(null);
  };

  return (
    <div className="rp-page">
      <div className="rp-page-head">
        <h1>Сотрудники</h1>
        <div className="rp-page-sub">Справочник персонала, ставки и смены за {MONTHS_RU[monthIdx].toLowerCase()}</div>
      </div>

      <div className="rp-toolbar">
        <div className="rp-search"><Search size={15} /><input placeholder="Поиск сотрудника…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <button className="rp-btn" onClick={() => setEditing({ id: uid(), name: '', position: '', payType: 'shift', rate: 0, status: 'active', standardShift: null, startDate: '', endDate: '', comment: '' })}><UserPlus size={15} /> Добавить сотрудника</button>
      </div>

      <Card>
        <table className="rp-table">
          <thead><tr><th>Сотрудник</th><th>Должность</th><th>Оплата</th><th>Ставка</th><th>Статус</th><th>Смены / часы</th><th>Аванс</th><th>Начислено</th><th /></tr></thead>
          <tbody>
            {visible.map((e) => {
              const pay = computeEmployeePay(e, month, settings);
              return (
                <tr key={e.id}>
                  <td className="rp-strong">{e.name}</td>
                  <td>{e.position}</td>
                  <td>{{ shift: 'руб/смена', hour: 'руб/час', oklad: 'оклад' }[e.payType]}</td>
                  <td className="rp-num">{fmtRub(e.rate)}</td>
                  <td><span className={`rp-badge ${e.status === 'active' ? 'ok' : 'off'}`}>{e.status === 'active' ? 'активен' : 'уволен'}</span></td>
                  <td className="rp-num rp-link" onClick={() => setShiftsFor(e.id)}>{pay.shiftsCount != null ? `${pay.shiftsCount} см.` : `${fmt0(pay.hours)} ч`}</td>
                  <td className="rp-num">{pay.advance ? fmtRub(pay.advance) : '—'}</td>
                  <td className="rp-num rp-strong">{fmtRub(pay.accrued)}</td>
                  <td>
                    <button className="rp-icon-btn" onClick={() => setEditing(e)}>✎</button>
                    <button className="rp-icon-btn rp-icon-btn-danger" onClick={() => setDeleteConfirm(e)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && <tr><td colSpan={9}><EmptyState icon={<Users size={24} color={COLORS.inkSoft} />} title="Сотрудники не найдены" /></td></tr>}
          </tbody>
        </table>
      </Card>

      {editing && (
        <Modal title={employees.some((e) => e.id === editing.id) ? 'Сотрудник' : 'Новый сотрудник'} onClose={() => setEditing(null)}>
          <EmployeeForm emp={editing} onSave={saveEmployee} />
        </Modal>
      )}

      {shiftsFor && (
        <ShiftGridModal
          emp={employees.find((e) => e.id === shiftsFor)}
          month={month} updateMonth={updateMonth} nd={nd} year={year} monthIdx={monthIdx}
          settings={settings} locked={month.closed}
          onClose={() => setShiftsFor(null)}
        />
      )}

      {deleteConfirm && (
        <ConfirmDialog
          title="Удалить сотрудника?"
          message={`Сотрудник «${deleteConfirm.name}» будет удалён из справочника. Уже начисленная зарплата за прошлые месяцы останется в данных, но сотрудник исчезнет из текущих списков и ведомостей.`}
          danger
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() => {
            setEmployees((prev) => prev.filter((p) => p.id !== deleteConfirm.id));
            logAudit({ what: 'Удалён сотрудник', employee: deleteConfirm.name });
            setDeleteConfirm(null);
          }}
        />
      )}
    </div>
  );
}

function EmployeeForm({ emp, onSave }) {
  const [f, setF] = useState({ ...emp });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div>
      <div className="rp-form-grid">
        <Field label="ФИО"><input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Должность"><input value={f.position} onChange={(e) => set('position', e.target.value)} /></Field>
        <Field label="Тип оплаты">
          <select value={f.payType} onChange={(e) => set('payType', e.target.value)}>
            <option value="shift">руб/смена</option>
            <option value="hour">руб/час</option>
            <option value="oklad">оклад</option>
          </select>
        </Field>
        <Field label="Ставка ₽"><input type="number" value={f.rate} onChange={(e) => set('rate', Number(e.target.value))} /></Field>
        <Field label="Стандартная смена, ч (пусто = из настроек)"><input type="number" value={f.standardShift ?? ''} onChange={(e) => set('standardShift', e.target.value === '' ? null : Number(e.target.value))} /></Field>
        <Field label="Статус">
          <select value={f.status} onChange={(e) => set('status', e.target.value)}>
            <option value="active">Активен</option>
            <option value="fired">Уволен</option>
          </select>
        </Field>
        <Field label="Дата начала"><input type="date" value={f.startDate || ''} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Дата увольнения"><input type="date" value={f.endDate || ''} onChange={(e) => set('endDate', e.target.value)} /></Field>
      </div>
      <Field label="Комментарий"><input value={f.comment} onChange={(e) => set('comment', e.target.value)} /></Field>
      <div className="rp-modal-actions">
        <button className="rp-btn" disabled={!f.name} onClick={() => onSave(f)}>Сохранить</button>
      </div>
    </div>
  );
}

function ShiftGridModal({ emp, month, updateMonth, nd, year, monthIdx, settings, locked, onClose }) {
  const standard = emp.standardShift || settings.standardShiftHours;
  const shifts = month.shifts?.[emp.id] || {};
  const setHours = (d, val) => {
    const ds = dateStr(year, monthIdx, d);
    updateMonth((m) => {
      const empShifts = { ...(m.shifts?.[emp.id] || {}) };
      if (val === '' || Number(val) === 0) delete empShifts[ds]; else empShifts[ds] = Number(val);
      return { ...m, shifts: { ...m.shifts, [emp.id]: empShifts } };
    });
  };
  const pay = computeEmployeePay(emp, month, settings);
  const [tab, setTab] = useState('shifts');

  return (
    <Modal title={`Смены — ${emp.name}`} onClose={onClose} wide>
      <div className="rp-tabs">
        <button className={tab === 'shifts' ? 'active' : ''} onClick={() => setTab('shifts')}>Часы по дням</button>
        <button className={tab === 'adjust' ? 'active' : ''} onClick={() => setTab('adjust')}>Бонусы / удержания</button>
      </div>

      {tab === 'shifts' && (
        <>
          <div className="rp-shift-grid">
            {Array.from({ length: nd }, (_, i) => i + 1).map((d) => {
              const ds = dateStr(year, monthIdx, d);
              return (
                <div key={d} className={`rp-shift-cell ${d === 16 ? 'half-start' : ''}`}>
                  <div className="rp-shift-day">{d}</div>
                  <input disabled={locked} type="number" value={shifts[ds] ?? ''} onChange={(e) => setHours(d, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { const next = document.querySelectorAll('.rp-shift-cell input')[d]; next?.focus(); } }}
                    placeholder="—" />
                  {!locked && <button className="rp-shift-full" title={`Полная смена (${standard} ч)`} onClick={() => setHours(d, standard)}>{standard}</button>}
                </div>
              );
            })}
          </div>
          <div className="rp-payslip">
            <div><span>1-я половина</span><b>{fmt0(pay.h1)} ч → {fmtRub(pay.base1)}</b></div>
            <div><span>2-я половина</span><b>{fmt0(pay.h2)} ч → {fmtRub(pay.base2)}</b></div>
            <div><span>Бонусы / мотивация</span><b>+{fmtRub(pay.bonus)}</b></div>
            <div><span>Удержания</span><b>−{fmtRub(pay.deduct)}</b></div>
            <div><span>Авансы</span><b>−{fmtRub(pay.advance)}</b></div>
            <div className="rp-payslip-total"><span>К выплате</span><b>{fmtRub(pay.payout)}</b></div>
          </div>
        </>
      )}

      {tab === 'adjust' && <AdjustmentsPanel emp={emp} month={month} updateMonth={updateMonth} locked={locked} year={year} monthIdx={monthIdx} />}
    </Modal>
  );
}

function AdjustmentsPanel({ emp, month, updateMonth, locked }) {
  const [amount, setAmount] = useState(''); const [type, setType] = useState('bonus'); const [half, setHalf] = useState(1); const [comment, setComment] = useState('');
  const [editingId, setEditingId] = useState(null);
  const list = (month.adjustments || []).filter((a) => a.employeeId === emp.id);
  const typeLabel = { bonus: 'Бонус', motivation: 'Мотивация', penalty: 'Штраф/удержание', advance: 'Аванс', manual: 'Ручная корректировка' };

  const resetForm = () => { setAmount(''); setType('bonus'); setHalf(1); setComment(''); setEditingId(null); };

  const startEdit = (a) => { setEditingId(a.id); setType(a.type); setHalf(a.half); setAmount(String(a.amount)); setComment(a.comment || ''); };

  const save = () => {
    if (!amount) return;
    if (editingId) {
      updateMonth((m) => ({ ...m, adjustments: (m.adjustments || []).map((a) => (a.id === editingId ? { ...a, type, half, amount: Number(amount), comment } : a)) }));
    } else {
      updateMonth((m) => ({ ...m, adjustments: [...(m.adjustments || []), { id: uid(), employeeId: emp.id, type, half, amount: Number(amount), comment, date: new Date().toISOString().slice(0, 10) }] }));
    }
    resetForm();
  };
  const del = (id) => { updateMonth((m) => ({ ...m, adjustments: (m.adjustments || []).filter((a) => a.id !== id) })); if (editingId === id) resetForm(); };

  return (
    <div>
      {!locked && (
        <div className="rp-form-grid">
          <Field label="Тип">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(typeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Половина месяца">
            <select value={half} onChange={(e) => setHalf(Number(e.target.value))}>
              <option value={1}>1-я (1–15)</option><option value={2}>2-я (16–конец)</option>
            </select>
          </Field>
          <Field label="Сумма ₽"><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Комментарий"><input value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
        </div>
      )}
      {!locked && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="rp-btn rp-btn-sm" onClick={save}>{editingId ? <><Check size={14} /> Сохранить изменения</> : <><Plus size={14} /> Добавить операцию</>}</button>
          {editingId && <button className="rp-btn rp-btn-sm rp-btn-ghost" onClick={resetForm}>Отменить</button>}
        </div>
      )}
      <div className="rp-list" style={{ marginTop: 12 }}>
        {list.length === 0 && <EmptyState icon={<Wallet size={24} color={COLORS.inkSoft} />} title="Нет корректировок" />}
        {list.map((a) => (
          <div className={`rp-list-row ${editingId === a.id ? 'rp-list-row-editing' : ''}`} key={a.id}>
            <div className={`rp-list-main ${!locked ? 'rp-clickable' : ''}`} onClick={() => !locked && startEdit(a)}>
              <div className="rp-list-cat">{typeLabel[a.type]} · {a.half}-я половина</div>{a.comment && <div className="rp-list-comment">{a.comment}</div>}
            </div>
            <div className="rp-list-amount">{['penalty', 'advance'].includes(a.type) ? '−' : '+'}{fmtRub(a.amount)}</div>
            {!locked && <button className="rp-icon-btn" onClick={() => startEdit(a)}>✎</button>}
            {!locked && <button className="rp-icon-btn rp-icon-btn-danger" onClick={() => del(a.id)}><Trash2 size={14} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================== PAYROLL ============================== */

function PayrollPage({ ctx }) {
  const { employees, month, settings, year, monthIdx, pnl } = ctx;
  const payroll = pnl.payroll;
  const shiftChartData = payroll.rows.map((r) => ({
    name: r.name,
    Смены: r.shiftsCount != null ? r.shiftsCount : Math.round((r.hours / (r.standardShift || settings.standardShiftHours)) * 10) / 10,
    'Ставка/смена': r.payType === 'shift' ? r.rate : null,
  }));
  return (
    <div className="rp-page">
      <div className="rp-page-head"><h1>Зарплата</h1><div className="rp-page-sub">Ведомость за {MONTHS_RU[monthIdx].toLowerCase()} {year}</div></div>
      <div className="rp-grid-4">
        <Stat label="Общий ФОТ" value={fmtRub(payroll.totalFot)} />
        <Stat label="Курьеры — ставка" value={fmtRub(pnl.courier.pay)} />
        <Stat label="Курьеры — бензин" value={fmtRub(pnl.courier.fuelTotal)} sub={`${fmt0(pnl.courier.km)} км`} />
        <Stat label="Промо" value={fmtRub(pnl.promo.total)} />
        <Stat label="ФОТ % от выручки" value={fmtPct(pnl.laborCostPct)} />
      </div>

      {shiftChartData.length > 0 && (
        <Card>
          <div className="rp-card-title">Количество смен за месяц по сотрудникам</div>
          <ResponsiveContainer width="100%" height={Math.max(220, shiftChartData.length * 30)}>
            <BarChart data={shiftChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11.5 }} width={90} />
              <Tooltip formatter={(v, key) => (key === 'Ставка/смена' ? fmtRub(v) : `${v} смен`)} />
              <Bar dataKey="Смены" fill={COLORS.accent} radius={[0, 4, 4, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card>
        <table className="rp-table">
          <thead><tr><th>Сотрудник</th><th>Смены/часы</th><th>Ставка</th><th>Начислено</th><th>Бонус</th><th>Удержано</th><th>Аванс</th><th>К выплате</th></tr></thead>
          <tbody>
            {payroll.rows.map((r) => (
              <tr key={r.empId}>
                <td className="rp-strong">{r.name}<div className="rp-muted-sm">{r.position}</div></td>
                <td>{r.shiftsCount != null ? `${r.shiftsCount} см.` : `${fmt0(r.hours)} ч`}</td>
                <td className="rp-num">{fmtRub(r.rate)}</td>
                <td className="rp-num">{fmtRub(r.base)}</td>
                <td className="rp-num">{r.bonus ? `+${fmtRub(r.bonus)}` : '—'}</td>
                <td className="rp-num">{r.deduct ? `−${fmtRub(r.deduct)}` : '—'}</td>
                <td className="rp-num">{r.advance ? `−${fmtRub(r.advance)}` : '—'}</td>
                <td className="rp-num rp-strong">{fmtRub(r.payout)}</td>
              </tr>
            ))}
            <tr className="rp-total-row"><td colSpan={3}>Итого ФОТ (начислено)</td><td className="rp-num">{fmtRub(payroll.totalFot)}</td><td colSpan={4} /></tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ============================== SUPPLIERS ============================== */

function SuppliersPage({ ctx }) {
  const { suppliers, setSuppliers, months, month, updateMonth, year, monthIdx, logAudit } = ctx;
  const [opModal, setOpModal] = useState(null); // {supplierId, kind:'order'|'payment'}
  const [newSupplier, setNewSupplier] = useState(false);
  const [name, setName] = useState('');
  const [historyFor, setHistoryFor] = useState(null);
  const [renaming, setRenaming] = useState(null); // supplier obj
  const [deleting, setDeleting] = useState(null); // supplier obj
  const [showArchived, setShowArchived] = useState(false);

  const ledger = useMemo(() => supplierLedger(months, suppliers, year, monthIdx), [months, suppliers, year, monthIdx]);
  const activeSuppliers = suppliers.filter((s) => !s.archived);
  const visibleSuppliers = showArchived ? suppliers : activeSuppliers;

  const addSupplier = () => {
    if (!name.trim()) return;
    setSuppliers((p) => [...p, { id: uid(), name: name.trim(), archived: false }]);
    setName(''); setNewSupplier(false);
  };
  const archive = (id) => setSuppliers((p) => p.map((s) => (s.id === id ? { ...s, archived: !s.archived } : s)));
  const rename = (id, newName) => { setSuppliers((p) => p.map((s) => (s.id === id ? { ...s, name: newName } : s))); logAudit({ what: 'Переименован поставщик', to: newName }); setRenaming(null); };
  const removeForever = (id, supplierName) => { setSuppliers((p) => p.filter((s) => s.id !== id)); logAudit({ what: 'Удалён поставщик', supplier: supplierName }); setDeleting(null); };

  const totalOrdered = activeSuppliers.reduce((s, sup) => s + (ledger[sup.id]?.ordered || 0), 0);
  const totalPaid = activeSuppliers.reduce((s, sup) => s + (ledger[sup.id]?.paid || 0), 0);

  return (
    <div className="rp-page">
      <div className="rp-page-head"><h1>Поставщики</h1><div className="rp-page-sub">Заявки, оплаты и задолженность (нарастающим итогом до {MONTHS_RU[monthIdx].toLowerCase()} {year})</div></div>

      <div className="rp-grid-4">
        <Stat label="Заявлено всего" value={fmtRub(totalOrdered)} />
        <Stat label="Оплачено всего" value={fmtRub(totalPaid)} />
        <Stat label="Общая задолженность" value={fmtRub(totalOrdered - totalPaid)} accent={COLORS.accent2} />
        <Stat label="Оплачено в этом месяце" value={fmtRub(pnlSupplierPayThisMonth(month, suppliers))} />
      </div>

      <div className="rp-toolbar">
        <button className="rp-btn" onClick={() => setNewSupplier(true)}><Plus size={15} /> Добавить поставщика</button>
        <label className="rp-toggle-inline">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Показывать архивных
        </label>
      </div>

      <Card>
        <table className="rp-table">
          <thead><tr><th>Поставщик</th><th>Поставлено</th><th>Оплачено</th><th>Долг</th><th /></tr></thead>
          <tbody>
            {visibleSuppliers.map((s) => {
              const l = ledger[s.id] || { ordered: 0, paid: 0 };
              const debt = l.ordered - l.paid;
              return (
                <tr key={s.id} style={s.archived ? { opacity: 0.55 } : {}}>
                  <td className="rp-strong rp-link" onClick={() => setHistoryFor(s.id)}>{s.name}{s.archived && <span className="rp-badge off" style={{ marginLeft: 6 }}>архив</span>}</td>
                  <td className="rp-num">{fmtRub(l.ordered)}</td>
                  <td className="rp-num">{fmtRub(l.paid)}</td>
                  <td className="rp-num" style={{ color: debt > 0 ? COLORS.accent2 : COLORS.accent }}>{fmtRub(debt)}</td>
                  <td>
                    {!s.archived && (
                      <>
                        <button className="rp-btn rp-btn-xs" onClick={() => setOpModal({ supplierId: s.id, kind: 'order' })}>+ Поставка</button>
                        <button className="rp-btn rp-btn-xs rp-btn-ghost" onClick={() => setOpModal({ supplierId: s.id, kind: 'payment' })}>+ Оплата</button>
                      </>
                    )}
                    <button className="rp-icon-btn" onClick={() => setRenaming(s)} title="Переименовать">✎</button>
                    <button className="rp-icon-btn" onClick={() => archive(s.id)} title={s.archived ? 'Восстановить' : 'Архивировать'}>{s.archived ? <Check size={14} /> : <Lock size={14} />}</button>
                    <button className="rp-icon-btn rp-icon-btn-danger" onClick={() => setDeleting(s)} title="Удалить полностью"><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {visibleSuppliers.length === 0 && <tr><td colSpan={5}><EmptyState icon={<Truck size={24} color={COLORS.inkSoft} />} title="Поставщиков нет" /></td></tr>}
          </tbody>
        </table>
      </Card>

      {newSupplier && (
        <Modal title="Новый поставщик" onClose={() => setNewSupplier(false)}>
          <Field label="Название"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSupplier()} /></Field>
          <div className="rp-modal-actions"><button className="rp-btn" onClick={addSupplier}>Добавить</button></div>
        </Modal>
      )}

      {opModal && (
        <SupplierOpModal
          supplier={suppliers.find((s) => s.id === opModal.supplierId)} kind={opModal.kind}
          history={ledger[opModal.supplierId]}
          thresholdPct={ctx.settings.anomalyThresholdPct || 60}
          onClose={() => setOpModal(null)}
          onSave={(op) => {
            updateMonth((m) => {
              const listKey = opModal.kind === 'order' ? 'supplierOrders' : 'supplierPayments';
              return { ...m, [listKey]: [...(m[listKey] || []), { id: uid(), supplierId: opModal.supplierId, ...op }] };
            });
            logAudit({ what: opModal.kind === 'order' ? 'Заявка поставщику' : 'Оплата поставщику', amount: op.amount });
            setOpModal(null);
          }}
        />
      )}

      {historyFor && (
        <SupplierHistoryModal supplier={suppliers.find((s) => s.id === historyFor)} ledger={ledger[historyFor]} onClose={() => setHistoryFor(null)} />
      )}

      {renaming && (
        <Modal title="Переименовать поставщика" onClose={() => setRenaming(null)}>
          <RenameForm initial={renaming.name} onSave={(v) => rename(renaming.id, v)} />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Удалить поставщика?"
          message={`Поставщик «${deleting.name}» будет удалён из справочника без возможности восстановления. История поставок и оплат за прошлые месяцы останется в данных, но поставщик исчезнет из текущих списков. Если нужно просто скрыть его — используйте архивирование.`}
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => removeForever(deleting.id, deleting.name)}
        />
      )}
    </div>
  );
}

function RenameForm({ initial, onSave }) {
  const [v, setV] = useState(initial);
  return (
    <div>
      <Field label="Название"><input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v.trim() && onSave(v.trim())} /></Field>
      <div className="rp-modal-actions"><button className="rp-btn" disabled={!v.trim()} onClick={() => onSave(v.trim())}>Сохранить</button></div>
    </div>
  );
}

function pnlSupplierPayThisMonth(month, suppliers) {
  return (month.supplierPayments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

function SupplierOpModal({ supplier, kind, onClose, onSave, history, thresholdPct = 60 }) {
  const [amount, setAmount] = useState(''); const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoice, setInvoice] = useState(''); const [method, setMethod] = useState('cashless'); const [comment, setComment] = useState('');

  const priorAmounts = ((kind === 'order' ? history?.orders : history?.payments) || []).map((x) => Number(x.amount) || 0).filter((v) => v > 0).slice(-5);
  const avg = priorAmounts.length >= 2 ? priorAmounts.reduce((a, b) => a + b, 0) / priorAmounts.length : null;
  const amountNum = Number(amount) || 0;
  const diffPct = avg ? (Math.abs(amountNum - avg) / avg) * 100 : 0;
  const showAnomaly = avg && amountNum > 0 && diffPct >= thresholdPct;

  return (
    <Modal title={`${kind === 'order' ? 'Поставка' : 'Оплата'} — ${supplier?.name}`} onClose={onClose}>
      <div className="rp-form-grid">
        <Field label="Дата"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Сумма ₽"><input type="number" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        {kind === 'order' && <Field label="№ накладной"><input value={invoice} onChange={(e) => setInvoice(e.target.value)} /></Field>}
        {kind === 'payment' && (
          <Field label="Способ оплаты">
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cashless">Безналичные</option><option value="cash">Наличные</option>
            </select>
          </Field>
        )}
        <Field label="Комментарий"><input value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      </div>
      {showAnomaly && (
        <div className="rp-inline-warn">
          <AlertTriangle size={13} /> Обычно у «{supplier?.name}» {kind === 'order' ? 'поставка' : 'оплата'} ~{fmtRub(avg)}, сейчас {fmtRub(amountNum)} ({diffPct >= 0 ? '+' : ''}{(amountNum > avg ? diffPct : -diffPct).toFixed(0)}%). Проверьте сумму.
        </div>
      )}
      <div className="rp-modal-actions">
        <button className="rp-btn" disabled={!amount} onClick={() => onSave({ amount: Number(amount), date, invoice, method, comment })}>Сохранить</button>
      </div>
    </Modal>
  );
}

function SupplierHistoryModal({ supplier, ledger, onClose }) {
  const events = [
    ...(ledger?.orders || []).map((o) => ({ ...o, kind: 'Поставка' })),
    ...(ledger?.payments || []).map((p) => ({ ...p, kind: 'Оплата' })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <Modal title={`История — ${supplier?.name}`} onClose={onClose} wide>
      <table className="rp-table">
        <thead><tr><th>Дата</th><th>Тип</th><th>Сумма</th><th>Комментарий</th></tr></thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}><td>{e.date}</td><td>{e.kind}</td><td className="rp-num">{fmtRub(e.amount)}</td><td>{e.comment || e.invoice || '—'}</td></tr>
          ))}
          {events.length === 0 && <tr><td colSpan={4}><EmptyState icon={<Truck size={24} color={COLORS.inkSoft} />} title="Пока нет операций" /></td></tr>}
        </tbody>
      </table>
    </Modal>
  );
}

/* ============================== P&L ============================== */

function PnLPage({ ctx }) {
  const { pnl, year, monthIdx } = ctx;
  const [drill, setDrill] = useState(null);

  const Row = ({ label, value, pctOf = pnl.revenue, bold, onClick, indent }) => (
    <div className={`rp-pnl-row ${bold ? 'bold' : ''} ${onClick ? 'rp-clickable' : ''}`} style={indent ? { paddingLeft: 20 } : {}} onClick={onClick}>
      <span>{label}</span>
      <span className="rp-num">{fmtRub(value)}</span>
      <span className="rp-num rp-muted-sm">{pctOf ? fmtPct((value / pctOf) * 100) : '—'}</span>
    </div>
  );

  return (
    <div className="rp-page">
      <div className="rp-page-head"><h1>P&L</h1><div className="rp-page-sub">{MONTHS_RU[monthIdx]} {year} · нажмите на строку для детализации</div></div>

      <Card>
        <div className="rp-pnl-section-title">Выручка</div>
        {ctx.settings.revenueChannels.map((c) => <Row key={c.id} label={c.name} value={pnl.revByChannel[c.id] || 0} indent />)}
        <Row label="Итого выручка" value={pnl.revenue} bold />

        <div className="rp-pnl-section-title">Переменные расходы</div>
        <Row label="Закупки кухня/бар (нал)" value={pnl.kitchen.total} indent onClick={() => setDrill('kitchen')} />
        <Row label="Поставщики (оплата)" value={pnl.supplierPay.total} indent onClick={() => setDrill('supplierPay')} />
        <Row label="Доставка (курьеры: ставка + бензин)" value={pnl.courier.total} indent onClick={() => setDrill('courier')} />
        <Row label="Эквайринг" value={pnl.acquiring.amount} indent onClick={() => setDrill('acquiring')} />
        <Row label="Прочие переменные" value={pnl.otherVar.total} indent onClick={() => setDrill('otherVar')} />
        <Row label="Итого переменные" value={pnl.kitchen.total + pnl.supplierPay.total + pnl.courier.total + pnl.acquiring.amount + pnl.otherVar.total} bold />

        <div className="rp-pnl-section-title">ФОТ</div>
        <Row label="Основной ФОТ" value={pnl.payroll.totalFot} indent onClick={() => setDrill('payroll')} />
        <Row label="Курьеры (ставка, справочно)" value={pnl.courier.pay} indent />
        <Row label="Промо" value={pnl.promo.total} indent onClick={() => setDrill('promo')} />
        <Row label="Налоги на сотрудников" value={pnl.fotTaxTotal} indent />
        <Row label="Итого ФОТ (справочно)" value={pnl.payroll.totalFot + pnl.courier.pay + pnl.promo.total + pnl.fotTaxTotal} bold />

        <div className="rp-pnl-section-title">Постоянные расходы</div>
        {pnl.fixedItems.map((f) => <Row key={f.id} label={f.name} value={f.amount} indent />)}
        {pnl.otherFixed.map((f) => <Row key={f.id} label={f.name} value={f.amount} indent />)}
        <Row label="Итого постоянные" value={pnl.fixedTotal} bold />

        <div className="rp-pnl-divider" />
        <Row label="ИТОГО РАСХОДОВ" value={pnl.totalExpenses} bold pctOf={pnl.revenue} />
        <Row label="ОПЕРАЦИОННАЯ ПРИБЫЛЬ" value={pnl.profit} bold />
        <div className="rp-pnl-margin" style={{ color: pnl.margin >= 0 ? COLORS.accent : COLORS.danger }}>Рентабельность: {fmtPct(pnl.margin)}</div>
      </Card>

      <div className="rp-grid-4" style={{ marginTop: 16 }}>
        <Stat label="Food Cost %" value={fmtPct(pnl.foodCostPct)} />
        <Stat label="Labor Cost %" value={fmtPct(pnl.laborCostPct)} />
        <Stat label="Prime Cost %" value={fmtPct(pnl.primeCostPct)} />
        <Stat label="Operating Expense %" value={fmtPct(pnl.opexPct)} />
        <Stat label="Net Profit %" value={fmtPct(pnl.netProfitPct)} />
        <Stat label="Доля наличных" value={fmtPct(pnl.cashShare)} />
        <Stat label="Доля карты" value={fmtPct(pnl.cardShare)} />
        <Stat label="Доля агрегаторов" value={fmtPct(pnl.aggregatorShare)} />
      </div>

      {drill && <DrillModal kind={drill} pnl={pnl} onClose={() => setDrill(null)} />}
    </div>
  );
}

function DrillModal({ kind, pnl, onClose }) {
  const configs = {
    kitchen: { title: 'Закупки кухня/бар — детализация', items: pnl.kitchen.items, cols: ['date', 'category', 'amount', 'comment'] },
    otherVar: { title: 'Прочие переменные расходы', items: pnl.otherVar.items, cols: ['date', 'category', 'amount', 'comment'] },
    supplierPay: { title: 'Оплаты поставщикам', items: pnl.supplierPay.items, cols: ['date', 'supplierName', 'amount', 'comment'] },
    courier: { title: 'Курьеры по дням', items: pnl.courier.items, cols: ['date', 'deliveries', 'pay', 'km', 'fuel'] },
    promo: { title: 'Промо по дням', items: pnl.promo.items, cols: ['date', 'pay', 'comment'] },
    acquiring: { title: 'Эквайринг', items: null },
    payroll: { title: 'ФОТ по сотрудникам', items: pnl.payroll.rows, cols: ['name', 'hours', 'base', 'bonus', 'accrued'] },
  };
  const c = configs[kind];
  const colLabel = { date: 'Дата', category: 'Категория', amount: 'Сумма', comment: 'Комментарий', supplierName: 'Поставщик', deliveries: 'Доставок', pay: 'Ставка', km: 'Км', fuel: 'Бензин', name: 'Сотрудник', hours: 'Часы', base: 'Оклад/база', bonus: 'Бонус', accrued: 'Начислено' };

  return (
    <Modal title={c.title} onClose={onClose} wide>
      {kind === 'acquiring' ? (
        <div>
          <p className="rp-muted">Эквайринг = {pnl.acquiring && ''}{fmt0(2)}%... формула считается автоматически по настройке (сейчас {fmtPct((pnl.acquiring.amount / (pnl.acquiring.base || 1)) * 100)} от базы).</p>
          <table className="rp-table"><thead><tr><th>Канал</th><th>Сумма</th></tr></thead>
            <tbody>{Object.entries(pnl.acquiring.byChannel).map(([k, v]) => <tr key={k}><td>{k}</td><td className="rp-num">{fmtRub(v)}</td></tr>)}</tbody>
          </table>
          <div className="rp-day-total">База для эквайринга: <b>{fmtRub(pnl.acquiring.base)}</b> → комиссия <b>{fmtRub(pnl.acquiring.amount)}</b></div>
        </div>
      ) : (
        <table className="rp-table">
          <thead><tr>{c.cols.map((col) => <th key={col}>{colLabel[col]}</th>)}</tr></thead>
          <tbody>
            {(c.items || []).length === 0 && <tr><td colSpan={c.cols.length}><EmptyState icon={<Info size={22} color={COLORS.inkSoft} />} title="Нет операций" /></td></tr>}
            {(c.items || []).map((it, i) => (
              <tr key={i}>{c.cols.map((col) => <td key={col} className={['amount', 'pay', 'base', 'bonus', 'accrued', 'hours', 'deliveries', 'km', 'fuel'].includes(col) ? 'rp-num' : ''}>{['amount', 'pay', 'base', 'bonus', 'accrued', 'fuel'].includes(col) ? fmtRub(it[col]) : (it[col] ?? '—')}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

/* ============================== SETTINGS ============================== */

function SettingsPage({ ctx }) {
  const { settings, setSettings } = ctx;
  const [tab, setTab] = useState('channels');

  const update = (fn) => setSettings((s) => fn({ ...s }));

  return (
    <div className="rp-page">
      <div className="rp-page-head"><h1>Настройки</h1><div className="rp-page-sub">Все изменяемые параметры системы — ничего не зашито в код</div></div>
      <div className="rp-tabs">
        <button className={tab === 'channels' ? 'active' : ''} onClick={() => setTab('channels')}>Каналы выручки</button>
        <button className={tab === 'expcat' ? 'active' : ''} onClick={() => setTab('expcat')}>Категории расходов</button>
        <button className={tab === 'fixed' ? 'active' : ''} onClick={() => setTab('fixed')}>Постоянные статьи</button>
        <button className={tab === 'payroll' ? 'active' : ''} onClick={() => setTab('payroll')}>ФОТ / смена</button>
        <button className={tab === 'courier' ? 'active' : ''} onClick={() => setTab('courier')}>Курьеры</button>
        <button className={tab === 'acq' ? 'active' : ''} onClick={() => setTab('acq')}>Эквайринг</button>
        <button className={tab === 'anomaly' ? 'active' : ''} onClick={() => setTab('anomaly')}>Проверки</button>
        <button className={tab === 'backup' ? 'active' : ''} onClick={() => setTab('backup')}>Резервная копия</button>
      </div>

      {tab === 'channels' && (
        <Card>
          <ListEditor
            items={settings.revenueChannels}
            renderLabel={(c) => c.name}
            onAdd={(name) => update((s) => { s.revenueChannels = [...s.revenueChannels, { id: uid(), name }]; return s; })}
            onRemove={(id) => update((s) => {
              s.revenueChannels = s.revenueChannels.filter((c) => c.id !== id);
              s.acquiringChannels = s.acquiringChannels.filter((cid) => cid !== id);
              return s;
            })}
            onRename={(id, name) => update((s) => { s.revenueChannels = s.revenueChannels.map((c) => (c.id === id ? { ...c, name } : c)); return s; })}
            addLabel="Добавить канал оплаты"
          />
          <p className="rp-muted">Уже внесённая выручка по удалённому каналу останется в данных прошлых дней, но перестанет отображаться и участвовать в новых расчётах.</p>
        </Card>
      )}

      {tab === 'expcat' && (
        <Card>
          <ListEditor
            items={settings.expenseCategories.map((c) => ({ id: c, name: c }))}
            renderLabel={(c) => c.name}
            onAdd={(name) => update((s) => { s.expenseCategories = [...s.expenseCategories, name]; return s; })}
            onRemove={(id) => update((s) => { s.expenseCategories = s.expenseCategories.filter((c) => c !== id); return s; })}
            onRename={(id, name) => update((s) => { s.expenseCategories = s.expenseCategories.map((c) => (c === id ? name : c)); return s; })}
            addLabel="Добавить категорию"
          />
        </Card>
      )}

      {tab === 'fixed' && (
        <Card>
          <FixedExpensesEditor settings={settings} update={update} />
        </Card>
      )}

      {tab === 'payroll' && (
        <Card>
          <div className="rp-form-grid">
            <Field label="Стандартная продолжительность смены, ч">
              <input type="number" value={settings.standardShiftHours} onChange={(e) => update((s) => { s.standardShiftHours = Number(e.target.value); return s; })} />
            </Field>
          </div>
          <p className="rp-muted">Используется для расчёта зарплаты «руб/смена»: ставка × (отработанные часы / стандартная смена). У каждого сотрудника можно задать своё значение в карточке сотрудника.</p>
        </Card>
      )}

      {tab === 'courier' && (
        <Card>
          <div className="rp-form-grid">
            <Field label="Тариф бензина, ₽/км">
              <input type="number" step="0.1" value={settings.courierFuelRatePerKm} onChange={(e) => update((s) => { s.courierFuelRatePerKm = Number(e.target.value); return s; })} />
            </Field>
          </div>
          <p className="rp-muted">Курьер получает фиксированную ставку за день (вносится на странице «День») + компенсацию бензина = километраж за день × этот тариф. Расход на бензин считается автоматически и попадает в P&L отдельной строкой.</p>
        </Card>
      )}

      {tab === 'acq' && (
        <Card>
          <div className="rp-form-grid">
            <Field label="Процент эквайринга, %">
              <input type="number" step="0.1" value={settings.acquiringPercent} onChange={(e) => update((s) => { s.acquiringPercent = Number(e.target.value); return s; })} />
            </Field>
          </div>
          <div className="rp-card-title" style={{ marginTop: 12 }}>Каналы, к которым применяется комиссия</div>
          <div className="rp-checklist">
            {settings.revenueChannels.map((c) => (
              <label key={c.id}>
                <input type="checkbox" checked={settings.acquiringChannels.includes(c.id)}
                  onChange={(e) => update((s) => {
                    s.acquiringChannels = e.target.checked ? [...s.acquiringChannels, c.id] : s.acquiringChannels.filter((x) => x !== c.id);
                    return s;
                  })} /> {c.name}
              </label>
            ))}
          </div>
        </Card>
      )}

      {tab === 'anomaly' && (
        <Card>
          <div className="rp-form-grid">
            <Field label="Порог отклонения для предупреждения, %">
              <input type="number" min="5" step="5" value={settings.anomalyThresholdPct} onChange={(e) => update((s) => { s.anomalyThresholdPct = Number(e.target.value); return s; })} />
            </Field>
          </div>
          <p className="rp-muted">
            На странице «День» приложение сравнивает сегодняшнюю выручку, расходы кухни/бара, курьера и промо со средним значением
            за последние 7 дней с данными (нужно минимум 3 дня для сравнения). Если отклонение больше указанного процента — показывается
            некритичное предупреждение с точными цифрами, которое можно скрыть. Значение по умолчанию — 60%.
          </p>
        </Card>
      )}

      {tab === 'backup' && <BackupPanel ctx={ctx} />}
    </div>
  );
}

function BackupPanel({ ctx }) {
  const { settings, employees, suppliers, months, auditLog, setSettings, setEmployees, setSuppliers, setMonths, setAuditLog, logAudit } = ctx;
  const fileInputRef = useRef(null);
  const [pendingImport, setPendingImport] = useState(null); // parsed object awaiting confirm
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const stamp = new Date().toISOString().slice(0, 10);
  const dataOut = { version: 1, exportedAt: new Date().toISOString(), settings, employees, suppliers, months, auditLog };

  const downloadBackup = () => {
    try {
      const json = JSON.stringify(dataOut, null, 2);
      const base64 = window.btoa(unescape(encodeURIComponent(json)));
      const url = `data:application/json;base64,${base64}`;
      const filename = `SIOSAN_backup_${stamp}.json`;
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setError('');
      logAudit({ what: 'Скачана резервная копия' });
    } catch (e) {
      setError('Не удалось сформировать копию: ' + e.message);
    }
  };

  const onFilePicked = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object' || !parsed.settings || !parsed.months) {
          setError('Файл не похож на резервную копию этой системы.');
          return;
        }
        setPendingImport(parsed);
      } catch (err) {
        setError('Не удалось прочитать файл: он повреждён или это не JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const applyImport = () => {
    if (!pendingImport) return;
    setSettings(pendingImport.settings || defaultSettings());
    setEmployees(pendingImport.employees || []);
    setSuppliers(pendingImport.suppliers || []);
    setMonths(pendingImport.months || {});
    setAuditLog(pendingImport.auditLog || []);
    logAudit({ what: 'Восстановлено из резервной копии', from: pendingImport.exportedAt });
    setPendingImport(null);
  };

  const doReset = () => {
    setSettings(defaultSettings());
    setEmployees([]);
    setSuppliers([]);
    setMonths({});
    setAuditLog([{ id: uid(), ts: new Date().toISOString(), what: 'База очищена вручную' }]);
    setConfirmReset(false);
  };

  const monthCount = Object.keys(months).length;

  return (
    <Card>
      <div className="rp-card-title">Резервная копия всей базы</div>
      <p className="rp-muted">
        Все данные (сотрудники, поставщики, настройки, {monthCount} {monthCount === 1 ? 'месяц' : 'месяцев'} и журнал истории) хранятся только в этом браузере.
        Скачивайте копию регулярно — при очистке кэша или переходе на другое устройство данные без копии не восстановить.
      </p>
      <div className="rp-toolbar" style={{ marginTop: 12 }}>
        <button className="rp-btn" onClick={downloadBackup}><DatabaseBackup size={15} /> Скачать резервную копию (.json)</button>
        <button className="rp-btn rp-btn-ghost" onClick={() => fileInputRef.current?.click()}><UploadCloud size={15} /> Восстановить из копии</button>
        <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={onFilePicked} />
      </div>
      {error && <div className="rp-export-error" style={{ marginTop: 8 }}>{error}</div>}

      <div className="rp-divider-line" />
      <div className="rp-card-title" style={{ color: COLORS.danger }}>Опасная зона</div>
      <p className="rp-muted">Полностью очистить базу (сотрудники, поставщики, все месяцы). Действие необратимо без резервной копии.</p>
      <button className="rp-btn" style={{ background: COLORS.danger }} onClick={() => setConfirmReset(true)}><Trash2 size={15} /> Очистить всю базу</button>

      {pendingImport && (
        <ConfirmDialog
          title="Восстановить из резервной копии?"
          message={`Текущие данные в браузере будут полностью заменены содержимым файла${pendingImport.exportedAt ? ' (копия от ' + new Date(pendingImport.exportedAt).toLocaleString('ru-RU') + ')' : ''}. Это необратимо — если текущие данные важны, сначала скачайте их резервную копию.`}
          danger
          onCancel={() => setPendingImport(null)}
          onConfirm={applyImport}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          title="Очистить всю базу?"
          message="Будут удалены все сотрудники, поставщики, месяцы и настройки без возможности восстановления, если вы не скачали резервную копию. Продолжить?"
          danger
          onCancel={() => setConfirmReset(false)}
          onConfirm={doReset}
        />
      )}
    </Card>
  );
}

function ListEditor({ items, onAdd, onRemove, onRename, renderLabel, addLabel }) {
  const [val, setVal] = useState('');
  return (
    <div>
      <div className="rp-list">
        {items.length === 0 && <EmptyState icon={<ClipboardList size={22} color={COLORS.inkSoft} />} title="Список пуст" sub="Добавьте первую позицию ниже" />}
        {items.map((it) => (
          <div className="rp-list-row" key={it.id}>
            <input className="rp-inline-input" defaultValue={renderLabel(it)}
              onBlur={(e) => e.target.value.trim() && e.target.value !== renderLabel(it) && onRename(it.id, e.target.value.trim())}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />
            <button className="rp-icon-btn rp-icon-btn-danger" onClick={() => onRemove(it.id)}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <div className="rp-toolbar" style={{ marginTop: 10 }}>
        <input placeholder={addLabel} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && val.trim()) { onAdd(val.trim()); setVal(''); } }} />
        <button className="rp-btn rp-btn-sm" onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(''); } }}><Plus size={14} /> Добавить</button>
      </div>
    </div>
  );
}

function FixedExpensesEditor({ settings, update }) {
  const [name, setName] = useState(''); const [amount, setAmount] = useState(''); const [group, setGroup] = useState('fixed');
  const groupLabel = { fixed: 'Постоянный', variable: 'Переменный', fot_tax: 'Налог на ФОТ' };
  return (
    <div>
      <table className="rp-table">
        <thead><tr><th>Статья</th><th>Тип</th><th>Сумма</th><th>Повтор ежемесячно</th><th /></tr></thead>
        <tbody>
          {settings.fixedExpenses.map((f) => (
            <tr key={f.id}>
              <td><input className="rp-inline-input" defaultValue={f.name} onBlur={(e) => update((s) => { s.fixedExpenses = s.fixedExpenses.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)); return s; })} /></td>
              <td>
                <select value={f.group} onChange={(e) => update((s) => { s.fixedExpenses = s.fixedExpenses.map((x) => (x.id === f.id ? { ...x, group: e.target.value } : x)); return s; })}>
                  {Object.entries(groupLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </td>
              <td><input className="rp-inline-input rp-num" type="number" defaultValue={f.amount} onBlur={(e) => update((s) => { s.fixedExpenses = s.fixedExpenses.map((x) => (x.id === f.id ? { ...x, amount: Number(e.target.value) } : x)); return s; })} /></td>
              <td><input type="checkbox" checked={f.recurring} onChange={(e) => update((s) => { s.fixedExpenses = s.fixedExpenses.map((x) => (x.id === f.id ? { ...x, recurring: e.target.checked } : x)); return s; })} /></td>
              <td><button className="rp-icon-btn rp-icon-btn-danger" onClick={() => update((s) => { s.fixedExpenses = s.fixedExpenses.filter((x) => x.id !== f.id); return s; })}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rp-toolbar" style={{ marginTop: 10 }}>
        <input placeholder="Название статьи" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Сумма" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 120 }} />
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          {Object.entries(groupLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="rp-btn rp-btn-sm" onClick={() => { if (name.trim()) { update((s) => { s.fixedExpenses = [...s.fixedExpenses, { id: uid(), name: name.trim(), amount: Number(amount) || 0, group, paymentMethod: 'cashless', recurring: true }]; return s; }); setName(''); setAmount(''); } }}><Plus size={14} /> Добавить статью</button>
      </div>
      <p className="rp-muted">Изменения здесь действуют на будущие месяцы. Суммы уже созданного месяца редактируются в его собственном P&L (раздел «Постоянные расходы» использует снимок на момент создания месяца).</p>
    </div>
  );
}

/* ============================== HISTORY ============================== */

function HistoryPage({ ctx }) {
  const { auditLog } = ctx;
  const [search, setSearch] = useState('');

  const rows = auditLog.filter((e) => {
    if (!search.trim()) return true;
    const hay = JSON.stringify(e).toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  const fmtTs = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  const describe = (e) => {
    const { id, ts, what, revert, ...rest } = e;
    const parts = Object.entries(rest).filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (!parts.length) return null;
    return parts.map(([k, v]) => `${historyFieldLabel[k] || k}: ${typeof v === 'number' ? fmtRub(v) : v}`).join(' · ');
  };

  return (
    <div className="rp-page">
      <div className="rp-page-head">
        <h1>История изменений</h1>
        <div className="rp-page-sub">Кто что менял в системе — последние {auditLog.length} записей</div>
      </div>

      <div className="rp-toolbar">
        <div className="rp-search"><Search size={15} /><input placeholder="Поиск по журналу…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<History size={26} color={COLORS.inkSoft} />} title="Журнал пуст" sub="Здесь появятся все действия по мере работы с системой" />
        ) : (
          <div className="rp-history-list">
            {rows.map((e) => (
              <div className="rp-history-row" key={e.id}>
                <div className="rp-history-ts">{fmtTs(e.ts)}</div>
                <div className="rp-history-body">
                  <div className="rp-history-what">{e.what}</div>
                  {describe(e) && <div className="rp-history-detail">{describe(e)}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <p className="rp-muted">Хранятся последние 500 действий. Восстановление предыдущего значения вручную из журнала пока не поддерживается — используйте резервную копию в Настройках, если нужно откатить крупные изменения.</p>
    </div>
  );
}

const historyFieldLabel = {
  month: 'месяц', date: 'дата', amount: 'сумма', employee: 'сотрудник', supplier: 'поставщик',
  category: 'категория', from: 'было', to: 'стало',
};

/* ============================== COMPARE ============================== */

function MonthPicker({ year, monthIdx, onChange, yearOptions }) {
  return (
    <div className="rp-compare-picker">
      <select className="rp-period-select" value={monthIdx} onChange={(e) => onChange(Number(e.target.value), year)}>
        {MONTHS_RU.map((m, i) => <option key={m} value={i}>{m}</option>)}
      </select>
      <select className="rp-period-select" value={year} onChange={(e) => onChange(monthIdx, Number(e.target.value))}>
        {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

function ComparePage({ ctx }) {
  const { settings, employees, suppliers, months, year, monthIdx } = ctx;
  const prevD = new Date(year, monthIdx - 1, 1);
  const [a, setA] = useState({ year: prevD.getFullYear(), monthIdx: prevD.getMonth() });
  const [b, setB] = useState({ year, monthIdx });

  const yearOptions = useMemo(() => {
    const base = todayObj().y;
    const set = new Set();
    for (let y2 = base - 3; y2 <= base + 3; y2++) set.add(y2);
    Object.keys(months).forEach((k) => set.add(Number(k.split('-')[0])));
    return Array.from(set).sort((x, y2) => x - y2);
  }, [months]);

  const dataCtx = { settings, employees, suppliers, months };
  const pnlA = useMemo(() => computePnL(dataCtx, a.year, a.monthIdx), [settings, employees, suppliers, months, a.year, a.monthIdx]);
  const pnlB = useMemo(() => computePnL(dataCtx, b.year, b.monthIdx), [settings, employees, suppliers, months, b.year, b.monthIdx]);

  const rows = [
    ['Выручка', pnlA.revenue, pnlB.revenue],
    ['Закупки (кухня + поставщики)', pnlA.kitchen.total + pnlA.supplierPay.total, pnlB.kitchen.total + pnlB.supplierPay.total],
    ['Доставка (курьеры + бензин)', pnlA.courier.total, pnlB.courier.total],
    ['Эквайринг', pnlA.acquiring.amount, pnlB.acquiring.amount],
    ['Прочие переменные', pnlA.otherVar.total, pnlB.otherVar.total],
    ['ФОТ', pnlA.payroll.totalFot, pnlB.payroll.totalFot],
    ['Промо', pnlA.promo.total, pnlB.promo.total],
    ['Постоянные расходы', pnlA.fixedTotal, pnlB.fixedTotal],
    ['Итого расходов', pnlA.totalExpenses, pnlB.totalExpenses],
    ['Прибыль', pnlA.profit, pnlB.profit],
  ];

  const chartData = rows.slice(0, 9).map(([name, va, vb]) => ({ name, [labelA(a)]: va, [labelB(b)]: vb }));

  function labelA(x) { return `${MONTHS_RU_SHORT[x.monthIdx]} ${x.year}`; }
  function labelB(x) { return `${MONTHS_RU_SHORT[x.monthIdx]} ${x.year}`; }

  return (
    <div className="rp-page">
      <div className="rp-page-head">
        <h1>Сравнение месяцев</h1>
        <div className="rp-page-sub">Выберите любые два месяца, чтобы сопоставить показатели</div>
      </div>

      <div className="rp-compare-heads">
        <Card className="rp-compare-head-card">
          <div className="rp-card-title">Период А</div>
          <MonthPicker year={a.year} monthIdx={a.monthIdx} yearOptions={yearOptions} onChange={(mi, y) => setA({ year: y, monthIdx: mi })} />
        </Card>
        <Card className="rp-compare-head-card">
          <div className="rp-card-title">Период Б</div>
          <MonthPicker year={b.year} monthIdx={b.monthIdx} yearOptions={yearOptions} onChange={(mi, y) => setB({ year: y, monthIdx: mi })} />
        </Card>
      </div>

      <Card>
        <div className="rp-card-title">Динамика по статьям</div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ left: 0, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={70} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v) => fmtRub(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey={labelA(a)} fill={COLORS.accent3} radius={[3, 3, 0, 0]} />
            <Bar dataKey={labelB(b)} fill={COLORS.accent} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <table className="rp-table">
          <thead><tr><th>Показатель</th><th>{labelA(a)}</th><th>{labelB(b)}</th><th>Δ</th><th>Δ %</th></tr></thead>
          <tbody>
            {rows.map(([name, va, vb]) => {
              const delta = vb - va;
              const deltaPct = va ? (delta / Math.abs(va)) * 100 : 0;
              const isProfitRow = name === 'Прибыль';
              const good = isProfitRow ? delta >= 0 : delta <= 0;
              return (
                <tr key={name} className={name === 'Итого расходов' || name === 'Прибыль' ? 'rp-total-row' : ''}>
                  <td>{name}</td>
                  <td className="rp-num">{fmtRub(va)}</td>
                  <td className="rp-num">{fmtRub(vb)}</td>
                  <td className="rp-num" style={{ color: delta === 0 ? COLORS.inkSoft : good ? COLORS.accent : COLORS.danger }}>{delta >= 0 ? '+' : ''}{fmtRub(delta)}</td>
                  <td className="rp-num" style={{ color: delta === 0 ? COLORS.inkSoft : good ? COLORS.accent : COLORS.danger }}>{va ? `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%` : '—'}</td>
                </tr>
              );
            })}
            <tr><td>Рентабельность</td><td className="rp-num">{fmtPct(pnlA.margin)}</td><td className="rp-num">{fmtPct(pnlB.margin)}</td><td className="rp-num">{(pnlB.margin - pnlA.margin) >= 0 ? '+' : ''}{(pnlB.margin - pnlA.margin).toFixed(1)} п.п.</td><td /></tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ============================== EXPORT ============================== */

function ExportMenu({ ctx }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const handleExcel = () => {
    setError('');
    try {
      const result = buildExcelFile(ctx);
      setFile(result);
      // attempt an automatic download; browsers/sandboxes vary in whether a
      // script-triggered click is allowed, so the manual link below is the
      // guaranteed way to get the file regardless.
      try {
        const a = document.createElement('a');
        a.href = result.url; a.download = result.filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      } catch (clickErr) { /* fall through to manual link */ }
    } catch (e) {
      setError('Не удалось сформировать файл: ' + (e?.message || 'неизвестная ошибка'));
    }
  };

  return (
    <div className="rp-export-wrap">
      <button className="rp-btn" onClick={() => setOpen((o) => !o)}><Download size={15} /> Экспорт <ChevronDown size={14} /></button>
      {open && (
        <div className="rp-export-menu">
          <button onClick={handleExcel}><FileBarChart2 size={14} /> Excel (.xlsx)</button>
          <button onClick={() => { window.print(); setOpen(false); }}><Printer size={14} /> Печать / PDF</button>
          {file && (
            <a className="rp-export-fallback rp-export-fallback-primary" href={file.url} download={file.filename}>
              <Download size={12} /> Скачать «{file.filename}»
            </a>
          )}
          {error && <div className="rp-export-error">{error}</div>}
        </div>
      )}
    </div>
  );
}

function buildExcelFile(ctx) {
  const { settings, suppliers, month, pnl, year, monthIdx } = ctx;
  const wb = XLSX.utils.book_new();

  // P&L sheet
  const pnlRows = [
    ['P&L СИОСАН', `${MONTHS_RU[monthIdx]} ${year}`],
    [],
    ['ВЫРУЧКА'],
    ...settings.revenueChannels.map((c) => [c.name, pnl.revByChannel[c.id] || 0]),
    ['Итого выручка', pnl.revenue],
    [],
    ['ПЕРЕМЕННЫЕ РАСХОДЫ'],
    ['Закупки кухня/бар', pnl.kitchen.total],
    ['Поставщики (оплата)', pnl.supplierPay.total],
    ['Доставка — ставка курьера', pnl.courier.pay],
    ['Доставка — бензин', pnl.courier.fuelTotal],
    ['Эквайринг', pnl.acquiring.amount],
    ['Прочие переменные', pnl.otherVar.total],
    [],
    ['ФОТ'],
    ['Основной ФОТ', pnl.payroll.totalFot],
    ['Промо', pnl.promo.total],
    ['Налоги на сотрудников', pnl.fotTaxTotal],
    [],
    ['ПОСТОЯННЫЕ РАСХОДЫ'],
    ...pnl.fixedItems.map((f) => [f.name, f.amount]),
    [],
    ['ИТОГО РАСХОДОВ', pnl.totalExpenses],
    ['ОПЕРАЦИОННАЯ ПРИБЫЛЬ', pnl.profit],
    ['РЕНТАБЕЛЬНОСТЬ, %', Number(pnl.margin.toFixed(1))],
  ];
  const wsPnl = XLSX.utils.aoa_to_sheet(pnlRows);
  wsPnl['!cols'] = [{ wch: 32 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsPnl, 'P&L');

  // Revenue by day
  const revHeader = ['День', ...settings.revenueChannels.map((c) => c.name), 'Итого'];
  const revRows = [revHeader];
  for (let d = 1; d <= pnl.nd; d++) {
    const ds = dateStr(year, monthIdx, d);
    const day = getDay(month, ds);
    const vals = settings.revenueChannels.map((c) => Number(day.revenue?.[c.id]) || 0);
    revRows.push([d, ...vals, vals.reduce((a, b) => a + b, 0)]);
  }
  const wsRev = XLSX.utils.aoa_to_sheet(revRows);
  XLSX.utils.book_append_sheet(wb, wsRev, 'Выручка');

  // Payroll
  const payHeader = ['Сотрудник', 'Должность', 'Тип оплаты', 'Ставка', 'Часы 1-я пол.', 'Часы 2-я пол.', 'Начислено', 'Бонус', 'Удержано', 'Аванс', 'К выплате'];
  const payRows = [payHeader, ...pnl.payroll.rows.map((r) => [r.name, r.position, r.payType, r.rate, r.h1, r.h2, r.base, r.bonus, r.deduct, r.advance, r.payout])];
  const wsPay = XLSX.utils.aoa_to_sheet(payRows);
  XLSX.utils.book_append_sheet(wb, wsPay, 'ФОТ');

  // Couriers detail
  const courHeader = ['Дата', 'Доставок', 'Ставка', 'Км', 'Бензин', 'Итого'];
  const courRows = [courHeader, ...pnl.courier.items.map((c) => [c.date, c.deliveries, c.pay, c.km, c.fuel, c.pay + c.fuel])];
  const wsCour = XLSX.utils.aoa_to_sheet(courRows);
  XLSX.utils.book_append_sheet(wb, wsCour, 'Курьеры');

  // Suppliers
  const ledger = supplierLedger(ctx.months, suppliers, year, monthIdx);
  const supHeader = ['Поставщик', 'Поставлено (всего)', 'Оплачено (всего)', 'Долг'];
  const supRows = [supHeader, ...suppliers.filter((s) => !s.archived).map((s) => { const l = ledger[s.id] || { ordered: 0, paid: 0 }; return [s.name, l.ordered, l.paid, l.ordered - l.paid]; })];
  const wsSup = XLSX.utils.aoa_to_sheet(supRows);
  XLSX.utils.book_append_sheet(wb, wsSup, 'Поставщики');

  // Expenses detail
  const expHeader = ['Дата', 'Блок', 'Категория', 'Сумма', 'Комментарий'];
  const expRows = [expHeader,
    ...pnl.kitchen.items.map((e) => [e.date, 'Кухня/бар', e.category, e.amount, e.comment || '']),
    ...pnl.otherVar.items.map((e) => [e.date, 'Прочие', e.category, e.amount, e.comment || '']),
  ];
  const wsExp = XLSX.utils.aoa_to_sheet(expRows);
  XLSX.utils.book_append_sheet(wb, wsExp, 'Расходы');

  const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
  const url = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
  const filename = `P&L_СИОСАН_${MONTHS_RU[monthIdx]}_${year}.xlsx`;
  return { url, filename };
}

/* ============================== STYLES ============================== */

function GlobalStyle() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      .rp-root { display: flex; min-height: 100vh; background: ${COLORS.bg}; font-family: 'Inter', -apple-system, sans-serif; color: ${COLORS.ink}; font-size: 13.5px; }
      .rp-sidebar { width: 216px; flex-shrink: 0; background: #1B2420; color: #EDEBE3; display: flex; flex-direction: column; padding: 20px 14px; }
      .rp-brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 22px; }
      .rp-brand-mark { width: 34px; height: 34px; border-radius: 9px; background: ${COLORS.accent}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; color: white; }
      .rp-brand-name { font-weight: 700; font-size: 14.5px; letter-spacing: 0.02em; }
      .rp-brand-sub { font-size: 10.5px; color: #9BA69C; }
      .rp-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
      .rp-nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; background: none; border: none; color: #C7CDC4; font-size: 13px; text-align: left; cursor: pointer; }
      .rp-nav-item:hover { background: #24302A; color: #fff; }
      .rp-nav-item.active { background: ${COLORS.accent}; color: #fff; font-weight: 600; }
      .rp-sidebar-foot { font-size: 11px; color: #8B968C; display: flex; align-items: center; gap: 6px; padding: 8px; }
      .rp-save-dot { width: 6px; height: 6px; border-radius: 50%; background: #4C8577; }
      .rp-save-dot.busy { background: ${COLORS.warn}; }
      .rp-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .rp-topbar { display: flex; justify-content: space-between; align-items: center; padding: 14px 26px; border-bottom: 1px solid ${COLORS.line}; background: ${COLORS.panel}; position: sticky; top: 0; z-index: 5; }
      .rp-month-switch { display: flex; align-items: center; gap: 10px; }
      .rp-month-label { font-weight: 700; font-size: 15px; min-width: 130px; text-align: center; }
      .rp-period-select { font-weight: 700; font-size: 13.5px; border: 1px solid ${COLORS.line}; border-radius: 8px; padding: 6px 8px; background: ${COLORS.panel}; cursor: pointer; }
      .rp-content { padding: 24px 26px 60px; overflow-y: auto; }
      .rp-page-head { margin-bottom: 18px; }
      .rp-page-head h1 { font-size: 21px; margin: 0 0 3px; font-weight: 700; }
      .rp-page-sub { color: ${COLORS.inkSoft}; font-size: 12.5px; }
      .rp-card { background: ${COLORS.panel}; border: 1px solid ${COLORS.line}; border-radius: 12px; padding: 16px 18px; margin-bottom: 16px; }
      .rp-card-title { font-weight: 700; font-size: 13px; margin-bottom: 10px; }
      .rp-card-title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      .rp-muted { color: ${COLORS.inkSoft}; font-weight: 400; font-size: 12px; }
      .rp-muted-sm { color: ${COLORS.inkSoft}; font-size: 11px; }
      .rp-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
      .rp-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
      @media (max-width: 980px) { .rp-grid-4 { grid-template-columns: repeat(2,1fr); } .rp-grid-2 { grid-template-columns: 1fr; } }
      .rp-stat { background: ${COLORS.panel}; border: 1px solid ${COLORS.line}; border-radius: 12px; padding: 13px 15px; }
      .rp-clickable { cursor: pointer; transition: box-shadow .15s, transform .15s; }
      .rp-clickable:hover { box-shadow: 0 3px 12px rgba(0,0,0,0.07); transform: translateY(-1px); }
      .rp-stat-label { font-size: 11px; color: ${COLORS.inkSoft}; margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: .02em; }
      .rp-stat-value { font-size: 19px; font-weight: 700; }
      .rp-stat-sub { display: flex; gap: 8px; align-items: center; margin-top: 4px; font-size: 11.5px; color: ${COLORS.inkSoft}; }
      .rp-delta { display: inline-flex; align-items: center; gap: 2px; font-weight: 600; }
      .rp-delta-good { color: ${COLORS.accent}; }
      .rp-delta-bad { color: ${COLORS.danger}; }
      .rp-alert { display: flex; align-items: center; gap: 8px; background: #FBEAEA; border: 1px solid #E7C6C6; color: #8A3232; padding: 10px 14px; border-radius: 10px; margin-bottom: 16px; font-size: 12.5px; }
      .rp-alert-info { background: #EEF1EE; border-color: ${COLORS.line}; color: ${COLORS.inkSoft}; }
      .rp-alert-warn { background: #FBF3E3; border-color: #EAD9A8; color: #7A5A17; align-items: flex-start; }
      .rp-alert-warn span { flex: 1; }
      .rp-alert-dismiss { background: none; border: 1px solid #D8C48C; color: #7A5A17; border-radius: 6px; padding: 3px 9px; font-size: 11px; cursor: pointer; white-space: nowrap; }
      .rp-inline-warn { display: flex; align-items: flex-start; gap: 6px; background: #FBF3E3; border: 1px solid #EAD9A8; color: #7A5A17; padding: 8px 10px; border-radius: 8px; font-size: 11.5px; margin-top: 6px; }
      .rp-btn { display: inline-flex; align-items: center; gap: 6px; background: ${COLORS.ink}; color: white; border: none; padding: 8px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
      .rp-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .rp-btn-sm { padding: 6px 11px; font-size: 12px; }
      .rp-btn-xs { padding: 4px 8px; font-size: 11px; margin-right: 4px; background: ${COLORS.accent}; }
      .rp-btn-ghost { background: transparent; color: ${COLORS.ink}; border: 1px solid ${COLORS.line}; }
      .rp-icon-btn { background: none; border: none; cursor: pointer; padding: 5px; border-radius: 6px; color: ${COLORS.inkSoft}; display: inline-flex; }
      .rp-icon-btn:hover { background: ${COLORS.bg}; }
      .rp-icon-btn-danger:hover { color: ${COLORS.danger}; }
      .rp-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid ${COLORS.line}; background: #F1F4F1; padding: 5px 10px; border-radius: 20px; font-size: 11.5px; cursor: pointer; color: ${COLORS.inkSoft}; }
      .rp-chip-locked { background: #FBF3E7; border-color: #EAD9BB; color: ${COLORS.warn}; }
      .rp-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
      .rp-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; color: ${COLORS.inkSoft}; border-bottom: 1px solid ${COLORS.line}; padding: 8px 8px; position: sticky; top: 0; background: ${COLORS.panel}; }
      .rp-table td { padding: 9px 8px; border-bottom: 1px solid #F0EFEA; }
      .rp-table .rp-num { text-align: right; font-variant-numeric: tabular-nums; }
      .rp-strong { font-weight: 600; }
      .rp-link { cursor: pointer; text-decoration: underline; text-decoration-color: ${COLORS.line}; }
      .rp-total-row td { font-weight: 700; border-top: 2px solid ${COLORS.ink}; }
      .rp-badge { padding: 2px 8px; border-radius: 20px; font-size: 10.5px; font-weight: 600; }
      .rp-badge.ok { background: #E4F0EA; color: ${COLORS.accent}; }
      .rp-badge.off { background: #F1EEEA; color: ${COLORS.inkSoft}; }
      .rp-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; }
      .rp-search { display: flex; align-items: center; gap: 6px; border: 1px solid ${COLORS.line}; border-radius: 8px; padding: 6px 10px; background: ${COLORS.panel}; flex: 1; max-width: 260px; color: ${COLORS.inkSoft}; }
      .rp-search input { border: none; outline: none; font-size: 12.5px; flex: 1; background: transparent; }
      .rp-toggle-inline { display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${COLORS.inkSoft}; cursor: pointer; }
      input, select { font-family: inherit; font-size: 12.5px; padding: 7px 9px; border: 1px solid ${COLORS.line}; border-radius: 7px; background: ${COLORS.panel}; color: ${COLORS.ink}; outline: none; }
      input:focus, select:focus { border-color: ${COLORS.accent}; }
      .rp-field { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: ${COLORS.inkSoft}; font-weight: 600; }
      .rp-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; }
      .rp-modal-backdrop { position: fixed; inset: 0; background: rgba(20,24,20,0.45); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
      .rp-modal { background: ${COLORS.panel}; border-radius: 14px; width: 480px; max-width: 100%; max-height: 88vh; overflow-y: auto; }
      .rp-modal-wide { width: 720px; }
      .rp-modal-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; border-bottom: 1px solid ${COLORS.line}; }
      .rp-modal-head h3 { margin: 0; font-size: 15px; }
      .rp-modal-body { padding: 16px 18px; }
      .rp-modal-actions { display: flex; justify-content: flex-end; margin-top: 12px; }
      .rp-day-strip { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 14px; }
      .rp-day-chip { width: 34px; height: 34px; border-radius: 8px; border: 1px solid ${COLORS.line}; background: ${COLORS.panel}; font-size: 12px; cursor: pointer; color: ${COLORS.inkSoft}; }
      .rp-day-chip.weekend { background: #FBF6EF; }
      .rp-day-chip.has-data { border-color: ${COLORS.accent}; color: ${COLORS.accent}; font-weight: 700; }
      .rp-day-chip.active { background: ${COLORS.ink}; color: white; border-color: ${COLORS.ink}; }
      .rp-day-chip.day-closed { position: relative; border-style: dashed; }
      .rp-day-chip-lock { position: absolute; top: 2px; right: 2px; opacity: 0.7; }
      .rp-day-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .rp-day-title { font-size: 15px; font-weight: 700; text-transform: capitalize; }
      .rp-day-total { margin-top: 10px; font-size: 13px; padding-top: 10px; border-top: 1px dashed ${COLORS.line}; display: flex; justify-content: space-between; }
      .rp-list { display: flex; flex-direction: column; gap: 6px; }
      .rp-list-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: ${COLORS.bg}; border-radius: 8px; }
      .rp-list-row-editing { outline: 2px solid ${COLORS.accent}; outline-offset: -2px; }
      .rp-list-main { flex: 1; }
      .rp-list-cat { font-weight: 600; font-size: 12.5px; }
      .rp-list-comment { font-size: 11px; color: ${COLORS.inkSoft}; }
      .rp-list-amount { font-weight: 700; font-variant-numeric: tabular-nums; }
      .rp-inline-input { border: 1px solid transparent; background: transparent; flex: 1; padding: 4px 6px; }
      .rp-inline-input:hover, .rp-inline-input:focus { border-color: ${COLORS.line}; background: ${COLORS.panel}; }
      .rp-empty { text-align: center; padding: 26px 10px; color: ${COLORS.inkSoft}; }
      .rp-empty-title { font-weight: 600; margin-top: 8px; font-size: 12.5px; }
      .rp-empty-sub { font-size: 11px; margin-top: 2px; }
      .rp-tabs { display: flex; gap: 4px; margin-bottom: 14px; border-bottom: 1px solid ${COLORS.line}; }
      .rp-tabs button { background: none; border: none; padding: 8px 12px; font-size: 12.5px; font-weight: 600; color: ${COLORS.inkSoft}; cursor: pointer; border-bottom: 2px solid transparent; }
      .rp-tabs button.active { color: ${COLORS.ink}; border-color: ${COLORS.accent}; }
      .rp-shift-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(52px, 1fr)); gap: 6px; margin-bottom: 14px; }
      .rp-shift-cell { text-align: center; background: ${COLORS.bg}; border-radius: 8px; padding: 5px 3px; }
      .rp-shift-cell.half-start { border-left: 2px solid ${COLORS.accent2}; }
      .rp-shift-day { font-size: 10px; color: ${COLORS.inkSoft}; margin-bottom: 3px; font-weight: 600; }
      .rp-shift-cell input { width: 100%; padding: 4px; text-align: center; font-size: 11.5px; margin-bottom: 3px; }
      .rp-shift-full { width: 100%; font-size: 9.5px; background: #EAF0EB; border: none; border-radius: 5px; padding: 2px; cursor: pointer; color: ${COLORS.accent}; }
      .rp-payslip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: ${COLORS.bg}; border-radius: 10px; padding: 12px; }
      .rp-payslip > div { display: flex; flex-direction: column; font-size: 11.5px; color: ${COLORS.inkSoft}; gap: 3px; }
      .rp-payslip > div b { font-size: 13.5px; color: ${COLORS.ink}; }
      .rp-payslip-total { grid-column: span 3; border-top: 1px dashed ${COLORS.line}; padding-top: 8px !important; }
      .rp-payslip-total b { color: ${COLORS.accent} !important; font-size: 16px !important; }
      .rp-checklist { display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; }
      .rp-checklist label { display: flex; align-items: center; gap: 8px; }
      .rp-pnl-section-title { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: ${COLORS.inkSoft}; font-weight: 700; margin: 16px 0 6px; padding-bottom: 4px; border-bottom: 1px solid ${COLORS.line}; }
      .rp-pnl-row { display: grid; grid-template-columns: 1fr 130px 70px; padding: 6px 4px; font-size: 12.5px; border-radius: 6px; }
      .rp-pnl-row.bold { font-weight: 700; }
      .rp-pnl-row .rp-num { text-align: right; font-variant-numeric: tabular-nums; }
      .rp-pnl-divider { height: 1px; background: ${COLORS.ink}; margin: 12px 0; }
      .rp-pnl-margin { text-align: right; font-weight: 700; font-size: 13px; margin-top: 4px; }
      .rp-export-wrap { position: relative; }
      .rp-export-menu { position: absolute; right: 0; top: 42px; background: ${COLORS.panel}; border: 1px solid ${COLORS.line}; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.1); overflow: hidden; z-index: 20; min-width: 180px; }
      .rp-export-menu button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 14px; background: none; border: none; text-align: left; font-size: 12.5px; cursor: pointer; }
      .rp-export-menu button:hover { background: ${COLORS.bg}; }
      .rp-export-fallback { display: flex; align-items: center; gap: 6px; padding: 9px 14px; font-size: 11px; color: ${COLORS.accent}; text-decoration: none; border-top: 1px solid ${COLORS.line}; }
      .rp-export-fallback-primary { font-weight: 700; background: #EAF3EE; font-size: 11.5px; }
      .rp-export-fallback:hover { background: ${COLORS.bg}; }
      .rp-export-error { padding: 8px 14px; font-size: 11px; color: ${COLORS.danger}; border-top: 1px solid ${COLORS.line}; }
      .rp-divider-line { height: 1px; background: ${COLORS.line}; margin: 18px 0; }
      .rp-history-list { display: flex; flex-direction: column; gap: 2px; max-height: 640px; overflow-y: auto; }
      .rp-history-row { display: flex; gap: 14px; padding: 9px 6px; border-bottom: 1px solid #F0EFEA; }
      .rp-history-ts { font-size: 11px; color: ${COLORS.inkSoft}; white-space: nowrap; padding-top: 1px; min-width: 118px; font-variant-numeric: tabular-nums; }
      .rp-history-body { flex: 1; }
      .rp-history-what { font-weight: 600; font-size: 12.5px; }
      .rp-history-detail { font-size: 11.5px; color: ${COLORS.inkSoft}; margin-top: 1px; }
      .rp-compare-heads { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
      .rp-compare-head-card { margin-bottom: 0; }
      .rp-compare-picker { display: flex; gap: 8px; }
      @media (max-width: 980px) { .rp-compare-heads { grid-template-columns: 1fr; } }
      @media print { .rp-sidebar, .rp-topbar { display: none !important; } .rp-content { padding: 0; } }
    `}</style>
  );
}
