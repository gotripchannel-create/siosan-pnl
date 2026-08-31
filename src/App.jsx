import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts';
import * as XLSX from 'xlsx';
import { parseVkReport, parseVkReportMulti } from './vk-report-parser.js';
import {
  LayoutDashboard, CalendarDays, Users, Wallet, Truck, FileBarChart2,
  Settings as SettingsIcon, ChevronLeft, ChevronRight, Plus, Trash2, X,
  Download, Lock, Unlock, Search, AlertTriangle, TrendingUp, TrendingDown,
  Copy as CopyIcon, Check, Minus, Printer, ChevronDown, ChevronUp, Info,
  UserPlus, Truck as TruckIcon, Megaphone, ClipboardList, Banknote,
  History, ArrowLeftRight, UploadCloud, DatabaseBackup, Menu, RotateCcw,
  RefreshCw, Link2, Unlink, FileSpreadsheet, Inbox, Radio, Sparkles, Send
} from 'lucide-react';

// ===== НОВАЯ ДИЗАЙН-СИСТЕМА =====
import './siosan-theme.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const RESTAURANT_ID = 'siosan';

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
  accent: '#1F6F54',
  accent2: '#B5652A',
  accent3: '#8A6BAE',
  danger: '#B33F3F',
  warn: '#C9832E',
  chartPalette: ['#3D4A5C','#4F5D70','#657485','#7C8B9B','#96A3B1','#B0BBC6'],
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
    dashboardWidgets: {
      hero: true, statToday: true, statFoodCost: true, statLaborCost: true, statSupplierDebt: true,
      trendChart: true, forecast: true, insights: true, expenseStructure: true, revenueByChannel: true,
    },
  };
}

const DASHBOARD_WIDGET_LABELS = {
  hero: 'Главный блок (прибыль за месяц)',
  statToday: 'Выручка сегодня',
  statFoodCost: 'Food Cost',
  statLaborCost: 'Labor Cost',
  statSupplierDebt: 'Задолженность поставщикам',
  trendChart: 'График выручки и расходов по дням',
  forecast: 'Прогноз на конец месяца',
  insights: 'Наблюдения ИИ',
  expenseStructure: 'Структура расходов (диаграмма)',
  revenueByChannel: 'Выручка по каналам (диаграмма)',
};

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

/* ============================== UI COMPONENTS ============================== */

function Card({ children, className = '', style = {} }) {
  return <div className={`rp-card ${className}`} style={style}>{children}</div>;
}

function Section({ title, count, defaultOpen = true, children, right }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{borderTop: `1px solid ${COLORS.line}`, paddingTop:16, marginTop:16}}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', userSelect:'none'}}
      >
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          {open ? <ChevronDown size={16} color={COLORS.inkSoft}/> : <ChevronRight size={16} color={COLORS.inkSoft}/>}
          <span style={{fontSize:14, fontWeight:700}}>{title}</span>
          {count != null && <span className="rp-muted" style={{fontSize:12}}>({count})</span>}
        </div>
        {right}
      </div>
      {open && <div style={{marginTop:14}}>{children}</div>}
    </div>
  );
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

/* ============================== NAVIGATION ============================== */

const NAV = [
  { id: 'dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { id: 'day', label: 'Кассовая смена (день)', icon: CalendarDays },
  { id: 'inbox', label: 'Входящие отчёты', icon: Inbox },
  { id: 'employees', label: 'Сотрудники', icon: Users },
  { id: 'payroll', label: 'Зарплата', icon: Wallet },
  { id: 'suppliers', label: 'Поставщики', icon: Truck },
  { id: 'purchases', label: 'Аналитика закупок', icon: TrendingUp },
  { id: 'ai', label: 'AI-помощник', icon: Sparkles },
  { id: 'pnl', label: 'P&L', icon: FileBarChart2 },
  { id: 'compare', label: 'Сравнение', icon: ArrowLeftRight },
  { id: 'history', label: 'История', icon: History },
  { id: 'iiko-novo', label: 'Отчёт Новошахтинск', icon: Radio },
  { id: 'iiko-belaya', label: 'Отчёт Белая Калитва', icon: Radio },
  { id: 'combined', label: 'Общий отчёт', icon: LayoutDashboard },
  { id: 'settings', label: 'Настройки', icon: SettingsIcon },
];

/* ============================== AUTH ============================== */

function AuthScreen({ onReady }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true); setMessage('');
    try {
      if (mode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data?.session) onReady(data.session);
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data?.session) onReady(data.session);
        else setMessage('Регистрация создана. Проверьте почту и подтвердите email, затем войдите.');
      }
    } catch (err) {
      setMessage(err?.message || 'Не удалось выполнить вход');
    } finally { setBusy(false); }
  };

  return (
    <div style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#F4F3EF',fontFamily:'Inter,Arial,sans-serif',padding:20}}>
      <div style={{width:'100%',maxWidth:420,background:'#fff',border:'1px solid #E4E1D8',borderRadius:16,padding:28,boxShadow:'0 12px 40px rgba(28,35,33,.08)'}}>
        <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:24}}>
          <div style={{width:42,height:42,borderRadius:12,display:'grid',placeItems:'center',background:'#1F6F54',color:'#fff',fontWeight:800,fontSize:20}}>С</div>
          <div><div style={{fontWeight:800,fontSize:20}}>СИОСАН</div><div style={{fontSize:12,color:'#5B645F'}}>Управленческий P&L · облачная версия</div></div>
        </div>
        <h2 style={{margin:'0 0 6px',fontSize:22}}>{mode==='signin'?'Вход':'Создать аккаунт'}</h2>
        <p style={{margin:'0 0 20px',color:'#5B645F',fontSize:13}}>Данные хранятся в общей базе ресторана.</p>
        <form onSubmit={submit} style={{display:'grid',gap:12}}>
          <label style={{display:'grid',gap:6,fontSize:12,color:'#5B645F'}}>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} style={{padding:'11px 12px',border:'1px solid #E4E1D8',borderRadius:9,fontSize:14}} /></label>
          <label style={{display:'grid',gap:6,fontSize:12,color:'#5B645F'}}>Пароль<input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} style={{padding:'11px 12px',border:'1px solid #E4E1D8',borderRadius:9,fontSize:14}} /></label>
          {message && <div style={{padding:10,borderRadius:8,background:'#F7EEE7',color:'#8C4B22',fontSize:12}}>{message}</div>}
          <button disabled={busy} style={{border:0,borderRadius:9,padding:'12px 14px',background:'#1F6F54',color:'#fff',fontWeight:700,cursor:'pointer'}}>{busy?'Подождите…':mode==='signin'?'Войти':'Зарегистрироваться'}</button>
        </form>
        <button onClick={()=>{setMode(mode==='signin'?'signup':'signin');setMessage('')}} style={{width:'100%',marginTop:12,border:0,background:'transparent',color:'#1F6F54',cursor:'pointer',fontSize:13}}>{mode==='signin'?'Нет аккаунта? Зарегистрироваться':'Уже есть аккаунт? Войти'}</button>
      </div>
    </div>
  );
}

/* ============================== MAIN APP ============================== */

export default function App() {
  const t = todayObj();
  const [session, setSession] = useState(undefined);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncError, setSyncError] = useState('');
  const VALID_PAGES = ['dashboard', 'day', 'inbox', 'employees', 'payroll', 'suppliers', 'purchases', 'ai', 'pnl', 'compare', 'history', 'iiko-novo', 'iiko-belaya', 'combined', 'settings'];
  const initialPage = (() => {
    const h = (window.location.hash || '').replace('#', '');
    return VALID_PAGES.includes(h) ? h : 'dashboard';
  })();
  const [page, _setPage] = useState(initialPage);
  const setPage = useCallback((p) => {
    _setPage(p);
    if (VALID_PAGES.includes(p)) window.location.hash = p;
  }, []);
  useEffect(() => {
    const onHashChange = () => {
      const h = (window.location.hash || '').replace('#', '');
      if (VALID_PAGES.includes(h)) _setPage(h);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [pendingReportsCount, setPendingReportsCount] = useState(0);
  const [year, setYear] = useState(t.y);
  const [monthIdx, setMonthIdx] = useState(t.m);
  const [selectedDate, setSelectedDate] = useState(dateStr(t.y, t.m, Math.min(t.d, daysInMonth(t.y, t.m))));

  const [settings, setSettings] = useState(defaultSettings());
  const [employees, setEmployees] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [months, setMonths] = useState({});
  const [auditLog, setAuditLog] = useState([]);

  const saveTimer = useRef(null);
  const cloudRowId = useRef(null);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession || null));
    return () => sub?.subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !supabase) { setLoaded(false); hydrated.current = false; return; }
    let cancelled = false;
    (async () => {
      setLoaded(false); setSyncError(''); hydrated.current = false;
      try {
        const { data: rows, error } = await supabase
          .from('restaurant_data')
          .select('id,data')
          .eq('restaurant_id', RESTAURANT_ID)
          .limit(1);
        if (error) throw error;
        if (cancelled) return;
        let row = rows?.[0] || null;
        let parsed = row?.data && Object.keys(row.data).length ? row.data : null;

        if (!parsed) {
          try {
            const raw = window.localStorage.getItem('restaurant-pnl-data');
            if (raw) parsed = JSON.parse(raw);
          } catch (_) {}
        }

        if (parsed) {
          setSettings(parsed.settings || defaultSettings());
          setEmployees(parsed.employees || seedEmployees());
          setSuppliers(parsed.suppliers || seedSuppliers());
          setMonths(parsed.months || {});
          setAuditLog(parsed.auditLog || []);
        } else {
          setSettings(defaultSettings());
          setEmployees(seedEmployees());
          setSuppliers(seedSuppliers());
          setMonths({});
          setAuditLog([]);
        }

        if (row) cloudRowId.current = row.id;
        else {
          const initial = parsed || { settings: defaultSettings(), employees: seedEmployees(), suppliers: seedSuppliers(), months: {}, auditLog: [] };
          const { data: inserted, error: insErr } = await supabase
            .from('restaurant_data')
            .insert({ restaurant_id: RESTAURANT_ID, data: initial, updated_at: new Date().toISOString() })
            .select('id')
            .single();
          if (insErr) throw insErr;
          cloudRowId.current = inserted.id;
        }
      } catch (e) {
        setSyncError(e?.message || 'Ошибка загрузки общей базы');
        setEmployees(seedEmployees()); setSuppliers(seedSuppliers());
      }
      if (!cancelled) { hydrated.current = true; setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!loaded || !hydrated.current || !session || !supabase || !cloudRowId.current) return;
    setSaving(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const payload = { settings, employees, suppliers, months, auditLog };
        const { error } = await supabase
          .from('restaurant_data')
          .update({ data: payload, updated_at: new Date().toISOString() })
          .eq('id', cloudRowId.current);
        if (error) throw error;
        window.localStorage.setItem('restaurant-pnl-data', JSON.stringify(payload));
        setSyncError('');
      } catch (e) {
        setSyncError(e?.message || 'Не удалось сохранить данные в облако');
      }
      setSaving(false);
    }, 900);
    return () => clearTimeout(saveTimer.current);
  }, [settings, employees, suppliers, months, auditLog, loaded, session?.user?.id]);

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

  const refreshPendingReportsCount = useCallback(async () => {
    if (!supabase) return;
    try {
      const { count } = await supabase
        .from('vk_report_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', RESTAURANT_ID)
        .eq('status', 'pending');
      setPendingReportsCount(count || 0);
    } catch (e) {}
  }, []);

  useEffect(() => { if (loaded) refreshPendingReportsCount(); }, [loaded, refreshPendingReportsCount]);

  const ctx = {
    settings, setSettings, employees, setEmployees, suppliers, setSuppliers,
    months, setMonths, month, updateMonth, monthKey, year, monthIdx, setYear, setMonthIdx,
    selectedDate, setSelectedDate, pnl, prevPnl, logAudit, auditLog, setAuditLog, goMonth, applyRevert,
    pendingReportsCount, refreshPendingReportsCount, session,
  };

  if (!supabase) {
    return <div style={{padding:40,fontFamily:'Inter, sans-serif',color:COLORS.danger}}>Не настроено подключение Supabase. Проверьте VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY в Vercel.</div>;
  }
  if (session === undefined) {
    return <div style={{ padding: 40, fontFamily: 'Inter, sans-serif', color: COLORS.inkSoft }}>Проверка входа…</div>;
  }
  if (!session) return <AuthScreen onReady={setSession} />;
  if (!loaded) {
    return <div style={{ padding: 40, fontFamily: 'Inter, sans-serif', color: COLORS.inkSoft }}>Загрузка общей базы…</div>;
  }

  return (
    <div className="rp-root">
      {mobileNavOpen && <div className="rp-nav-backdrop" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`rp-sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <div className="rp-brand">
          <div className="rp-brand-mark">С</div>
          <div>
            <div className="rp-brand-name">СИОСАН</div>
            <div className="rp-brand-sub">Управленческий P&L</div>
          </div>
          <button className="rp-icon-btn rp-nav-close" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
        </div>
        <nav className="rp-nav">
          {NAV.map((n) => (
            <button key={n.id} className={`rp-nav-item ${page === n.id ? 'active' : ''}`} onClick={() => { setPage(n.id); setMobileNavOpen(false); }}>
              <n.icon size={17} /> {n.label}
              {n.id === 'inbox' && pendingReportsCount > 0 && <span className="rp-nav-badge">{pendingReportsCount}</span>}
            </button>
          ))}
        </nav>
        <div className="rp-sidebar-foot" style={{display:'grid',gap:6}}>
          <div><span className={`rp-save-dot ${saving ? 'busy' : ''}`} />{syncError ? 'Ошибка синхронизации' : saving ? 'Сохранение…' : 'Облако синхронизировано'}</div>
          <button onClick={() => supabase.auth.signOut()} style={{border:0,background:'transparent',padding:0,textAlign:'left',fontSize:11,color:'#8A928E',cursor:'pointer'}}>Выйти · {session.user.email}</button>
        </div>
      </aside>

      <div className="rp-main">
        <header className="rp-topbar">
          <button className="rp-icon-btn rp-nav-hamburger" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
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
            <button className="rp-btn rp-btn-ghost" onClick={() => setSyncOpen(true)}><RefreshCw size={14} /> Синхронизация</button>
            <ExportMenu ctx={ctx} />
          </div>
        </header>

        {syncOpen && <SyncModal ctx={ctx} onClose={() => setSyncOpen(false)} />}

        <main className="rp-content">
          {page === 'dashboard' && <Dashboard ctx={ctx} setPage={setPage} />}
          {page === 'day' && <DayEntry ctx={ctx} />}
          {page === 'inbox' && <IncomingReportsPage ctx={ctx} />}
          {page === 'employees' && <EmployeesPage ctx={ctx} />}
          {page === 'payroll' && <PayrollPage ctx={ctx} />}
          {page === 'suppliers' && <SuppliersPage ctx={ctx} />}
          {page === 'purchases' && <PurchaseAnalyticsPage ctx={ctx} />}
          {page === 'ai' && <AiAssistantPage ctx={ctx} />}
          {page === 'pnl' && <PnLPage ctx={ctx} />}
          {page === 'settings' && <SettingsPage ctx={ctx} />}
          {page === 'compare' && <ComparePage ctx={ctx} />}
          {page === 'history' && <HistoryPage ctx={ctx} />}
          {page === 'iiko-novo' && <IikoDashboardPage ctx={ctx} />}
          {page === 'iiko-belaya' && <BelayaKalitvaPage ctx={ctx} />}
          {page === 'combined' && <CombinedReportPage ctx={ctx} />}
        </main>
      </div>
      <AiChatWidget ctx={ctx} />
    </div>
  );
}
/* ============================== DASHBOARD ============================== */

function Dashboard({ ctx, setPage }) {
  const { pnl, prevPnl, month, settings, year, monthIdx, selectedDate, setSelectedDate, session, monthKey } = ctx;
  const [drill, setDrill] = useState(null);
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState('');
  const [insightsLoaded, setInsightsLoaded] = useState(false);
  const [viewMode, setViewMode] = useState('month');
  const [dayDate, setDayDate] = useState(selectedDate);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const showWidget = (key) => settings.dashboardWidgets?.[key] !== false;

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

  const dayObj = getDay(month, dayDate);
  const dayRevByChannel = settings.revenueChannels.map(c => ({ name: c.name, id: c.id, value: Number(dayObj.revenue?.[c.id]) || 0 }));
  const dayRevenueSel = dayRevByChannel.reduce((s, c) => s + c.value, 0);
  const dayKitchen = (dayObj.kitchenExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const dayOther = (dayObj.otherExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const dayCourierPay = Number(dayObj.courier?.pay) || 0;
  const dayCourierFuel = (Number(dayObj.courier?.km) || 0) * (settings.courierFuelRatePerKm || 7);
  const dayPromo = Number(dayObj.promo?.pay) || 0;
  const dayExpensesSel = dayKitchen + dayOther + dayCourierPay + dayCourierFuel + dayPromo;
  const dayProfitSel = dayRevenueSel - dayExpensesSel;
  const dayStructure = [
    { name: 'Закупки (кухня/бар)', value: dayKitchen },
    { name: 'Курьер (ставка+бензин)', value: dayCourierPay + dayCourierFuel },
    { name: 'Промо', value: dayPromo },
    { name: 'Прочие', value: dayOther },
  ].filter(d => d.value > 0);

  const daysWithData = dailySeries.filter(d => d['Выручка'] > 0 || d['Расходы'] > 0).length;
  const forecast = useMemo(() => {
    if (daysWithData === 0 || daysWithData >= pnl.nd) return null;
    const scalableExpenses = pnl.totalExpenses - pnl.fixedTotal - pnl.fotTaxTotal;
    const projectedRevenue = (pnl.revenue / daysWithData) * pnl.nd;
    const projectedScalable = (scalableExpenses / daysWithData) * pnl.nd;
    const projectedExpenses = projectedScalable + pnl.fixedTotal + pnl.fotTaxTotal;
    return {
      daysWithData, daysRemaining: pnl.nd - daysWithData,
      projectedRevenue, projectedExpenses,
      projectedProfit: projectedRevenue - projectedExpenses,
      projectedMargin: projectedRevenue ? ((projectedRevenue - projectedExpenses) / projectedRevenue) * 100 : 0,
    };
  }, [pnl, daysWithData]);

  useEffect(() => {
    let cancelled = false;
    setInsights(null); setInsightsLoaded(false); setInsightsError('');
    if (!supabase) return;
    (async () => {
      try {
        const { data } = await supabase.from('ai_insights_cache').select('*').eq('month_key', monthKey).order('generated_at', { ascending: false }).limit(1).maybeSingle();
        if (!cancelled && data) setInsights({ insights: data.insights, generatedAt: data.generated_at });
      } catch (_) {}
      if (!cancelled) setInsightsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [monthKey]);

  const aggregateByCategory = (items) => {
    const map = new Map();
    (items || []).forEach(it => { const k = it.category || 'Без категории'; map.set(k, (map.get(k) || 0) + (Number(it.amount) || 0)); });
    return Array.from(map.entries()).map(([category, amount]) => ({ category, amount })).sort((a,b) => b.amount - a.amount).slice(0, 10);
  };

  const buildPnlSummary = (p) => p ? {
    выручка: Math.round(p.revenue), расходы_всего: Math.round(p.totalExpenses), прибыль: Math.round(p.profit),
    рентабельность_pct: Math.round(p.margin * 10) / 10,
    закупки_кухня: Math.round(p.kitchen.total), закупки_поставщики: Math.round(p.supplierPay.total),
    food_cost_pct: Math.round(p.foodCostPct * 10) / 10,
    фот: Math.round(p.payroll.totalFot), labor_cost_pct: Math.round(p.laborCostPct * 10) / 10,
    курьер_ставка: Math.round(p.courier.pay), курьер_бензин: Math.round(p.courier.fuelTotal), курьер_доставок: p.courier.deliveries, курьер_средний_чек_доставки: Math.round(p.courier.avgPerDelivery),
    промо: Math.round(p.promo.total), прочие_переменные: Math.round(p.otherVar.total),
    постоянные: Math.round(p.fixedTotal), налоги_фот: Math.round(p.fotTaxTotal),
    выручка_по_каналам: p.revByChannel,
  } : null;

  const refreshInsights = async () => {
    setInsightsLoading(true); setInsightsError('');
    try {
      const resp = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          month: `${MONTHS_RU[monthIdx]} ${year}`,
          current: buildPnlSummary(pnl),
          previous: buildPnlSummary(prevPnl),
          dailySeries: dailySeries.filter(d => d['Выручка'] > 0 || d['Расходы'] > 0),
          otherExpenseCategories: aggregateByCategory(pnl.otherVar.items),
          kitchenCategories: aggregateByCategory(pnl.kitchen.items),
        })
      });
      const data = await resp.json();
      if (!resp.ok) { setInsightsError(data?.error || 'Не удалось получить наблюдения.'); return; }
      setInsights(data);
      if (supabase) {
        await supabase.from('ai_insights_cache').insert({ month_key: monthKey, insights: data.insights, generated_at: data.generatedAt });
      }
    } catch (e) {
      setInsightsError(e?.message || 'Не удалось связаться с сервером.');
    } finally {
      setInsightsLoading(false);
    }
  };

  return (
    <div className="rp-page">
      <div className="rp-page-head-row">
        <div className="rp-page-head">
          <h1>Дашборд</h1>
          <div className="rp-page-sub">{MONTHS_RU[monthIdx]} {year} · {pnl.nd} дней</div>
        </div>
        <div style={{display:'flex', gap:10, alignItems:'center'}}>
          <div className="rp-view-toggle">
            <button className={viewMode === 'month' ? 'active' : ''} onClick={() => setViewMode('month')}>Месяц</button>
            <button className={viewMode === 'day' ? 'active' : ''} onClick={() => setViewMode('day')}>День</button>
          </div>
          <button className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => setCustomizeOpen(true)}><SettingsIcon size={13}/> Настроить</button>
        </div>
      </div>

      {viewMode === 'month' ? (
        <>
          {showWidget('hero') && (
            <div className={`rp-hero ${pnl.profit >= 0 ? 'rp-hero-pos' : 'rp-hero-neg'}`} onClick={() => setPage('pnl')}>
              <div className="rp-hero-main">
                <div className="rp-hero-label">Прибыль за месяц</div>
                <div className="rp-hero-value">{fmtRub(pnl.profit)}</div>
                <div className="rp-hero-meta">
                  <span className={`rp-delta ${delta(pnl.profit, prevPnl.profit) >= 0 ? 'rp-delta-good' : 'rp-delta-bad'}`}>
                    {delta(pnl.profit, prevPnl.profit) >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {fmtPct(Math.abs(delta(pnl.profit, prevPnl.profit)))} к пред. месяцу
                  </span>
                  <span className="rp-hero-margin">рентабельность {fmtPct(pnl.margin)}</span>
                  {pnl.profit < 0 && <span className="rp-hero-warning"><AlertTriangle size={12}/> проверьте расходы</span>}
                </div>
              </div>
              <div className="rp-hero-side">
                <div><div className="rp-hero-side-label">Выручка</div><div className="rp-hero-side-value">{fmtRub(pnl.revenue)}</div></div>
                <div className="rp-clickable" onClick={(e) => { e.stopPropagation(); setDrill('expenses'); }}><div className="rp-hero-side-label">Расходы</div><div className="rp-hero-side-value">{fmtRub(pnl.totalExpenses)}</div></div>
              </div>
            </div>
          )}

          {(showWidget('statToday') || showWidget('statFoodCost') || showWidget('statLaborCost') || showWidget('statSupplierDebt')) && (
            <div className="rp-grid-4">
              {showWidget('statToday') && <Stat label={`Выручка сегодня (${selectedDate.split('-').reverse().join('.')})`} value={fmtRub(todayRevenue)} onClick={() => setPage('day')} />}
              {showWidget('statFoodCost') && <Stat label="Food Cost" value={fmtPct(pnl.foodCostPct)} sub={fmtRub(pnl.kitchen.total + pnl.supplierPay.total)} />}
              {showWidget('statLaborCost') && <Stat label="Labor Cost" value={fmtPct(pnl.laborCostPct)} sub={fmtRub(pnl.payroll.totalFot)} onClick={() => setPage('payroll')} />}
              {showWidget('statSupplierDebt') && <Stat label="Задолженность поставщикам" value={fmtRub(supplierDebtTotal(ctx))} accent={supplierDebtTotal(ctx) > 0 ? COLORS.accent2 : undefined} onClick={() => setPage('suppliers')} />}
            </div>
          )}
        </>
      ) : (
        <>
          <Card style={{marginBottom:16}}>
            <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginBottom:14}}>
              <Field label="Выберите день"><input type="date" value={dayDate} onChange={e => setDayDate(e.target.value)} min={dateStr(year, monthIdx, 1)} max={dateStr(year, monthIdx, daysInMonth(year, monthIdx))} /></Field>
              <button className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => setPage('day')} style={{marginTop:18}}>Открыть в «День» для редактирования →</button>
            </div>
            <div className={`rp-hero ${dayProfitSel >= 0 ? 'rp-hero-pos' : 'rp-hero-neg'}`} style={{marginBottom:0, cursor:'default'}}>
              <div className="rp-hero-main">
                <div className="rp-hero-label">Прибыль за {dayDate.split('-').reverse().join('.')}</div>
                <div className="rp-hero-value">{fmtRub(dayProfitSel)}</div>
                <div className="rp-hero-meta">
                  <span>рентабельность {fmtPct(dayRevenueSel ? (dayProfitSel/dayRevenueSel)*100 : 0)}</span>
                </div>
              </div>
              <div className="rp-hero-side">
                <div><div className="rp-hero-side-label">Выручка</div><div className="rp-hero-side-value">{fmtRub(dayRevenueSel)}</div></div>
                <div><div className="rp-hero-side-label">Расходы</div><div className="rp-hero-side-value">{fmtRub(dayExpensesSel)}</div></div>
              </div>
            </div>
          </Card>

          <div className="rp-grid-2">
            <Card>
              <div className="rp-card-title">Выручка по каналам за день</div>
              {dayRevenueSel === 0 ? <EmptyState icon={<Info size={22} color={COLORS.inkSoft} />} title="Нет данных за этот день" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={dayRevByChannel.filter(c => c.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                      {dayRevByChannel.filter(c => c.value > 0).map((e, i) => <Cell key={i} fill={COLORS.chartPalette[i % COLORS.chartPalette.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtRub(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card>
              <div className="rp-card-title">Расходы за день</div>
              {dayStructure.length === 0 ? <EmptyState icon={<Info size={22} color={COLORS.inkSoft} />} title="Расходов за этот день нет" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={dayStructure} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                      {dayStructure.map((e, i) => <Cell key={i} fill={COLORS.chartPalette[i % COLORS.chartPalette.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtRub(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <p className="rp-muted" style={{fontSize:11, marginTop:8}}>ФОТ и постоянные расходы считаются за месяц целиком и здесь не разбиваются по дням.</p>
            </Card>
          </div>
        </>
      )}

      {showWidget('trendChart') && (
        <Card>
          <div className="rp-card-title">Выручка и расходы по дням</div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dailySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => fmtRub(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="Выручка" stroke={COLORS.accent} fill={COLORS.accent} fillOpacity={0.15} strokeWidth={2} />
              <Area type="monotone" dataKey="Расходы" stroke={COLORS.accent2} fill={COLORS.accent2} fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {viewMode === 'month' && (showWidget('forecast') || showWidget('insights')) && (
        <div className="rp-grid-2">
          {showWidget('forecast') && forecast && (
            <Card>
              <div className="rp-card-title">Прогноз на конец месяца</div>
              <div className="rp-muted" style={{marginBottom:12}}>По {forecast.daysWithData} дням с данными · осталось {forecast.daysRemaining} дн.</div>
              <div className="rp-forecast-grid">
                <div><div className="rp-forecast-label">Выручка</div><div className="rp-forecast-value">{fmtRub(forecast.projectedRevenue)}</div></div>
                <div><div className="rp-forecast-label">Расходы</div><div className="rp-forecast-value">{fmtRub(forecast.projectedExpenses)}</div></div>
                <div><div className="rp-forecast-label">Прибыль</div><div className="rp-forecast-value" style={{color: forecast.projectedProfit>=0?COLORS.accent:COLORS.danger}}>{fmtRub(forecast.projectedProfit)}</div></div>
                <div><div className="rp-forecast-label">Рентабельность</div><div className="rp-forecast-value">{fmtPct(forecast.projectedMargin)}</div></div>
              </div>
            </Card>
          )}
          {showWidget('insights') && (
            <Card>
              <div className="rp-card-title-row">
                <div className="rp-card-title">✨ Наблюдения ИИ</div>
                <button className="rp-btn rp-btn-ghost rp-btn-sm" onClick={refreshInsights} disabled={insightsLoading}>{insightsLoading?'Анализирую…':'Обновить'}</button>
              </div>
              {insights?.generatedAt && <div className="rp-muted" style={{marginBottom:10}}>Обновлено {new Date(insights.generatedAt).toLocaleString('ru-RU', {day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}</div>}
              {insightsError && <div className="rp-inline-warn"><AlertTriangle size={13}/> {insightsError}</div>}
              {!insightsError && insightsLoaded && !insights && <div className="rp-muted">Ещё не анализировали этот месяц. Нажмите «Обновить».</div>}
              {insights?.insights?.length === 0 && <div className="rp-muted">Ничего примечательного не найдено.</div>}
              {insights?.insights?.length > 0 && (
                <div className="rp-insights-list">
                  {insights.insights.slice(0,3).map((ins, i) => (
                    <div key={i} className={`rp-insight rp-insight-${ins.severity}`}>
                      <div className="rp-insight-title">{ins.title}</div>
                      <div className="rp-insight-detail">{ins.detail}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {viewMode === 'month' && (showWidget('expenseStructure') || showWidget('revenueByChannel')) && (
        <div className="rp-grid-2">
          {showWidget('expenseStructure') && (
            <Card>
              <div className="rp-card-title">Структура расходов</div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={structureData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={50}>
                    {structureData.map((e, i) => <Cell key={i} fill={COLORS.chartPalette[i % COLORS.chartPalette.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtRub(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          )}
          {showWidget('revenueByChannel') && (
            <Card>
              <div className="rp-card-title">Выручка по каналам</div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={settings.revenueChannels.map((c) => ({ name: c.name, value: pnl.revByChannel[c.id] || 0 }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={50}>
                    {settings.revenueChannels.map((c, i) => <Cell key={i} fill={COLORS.chartPalette[i % COLORS.chartPalette.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtRub(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      )}

      {drill === 'expenses' && (
        <Modal title="Детализация расходов месяца" onClose={() => setDrill(null)} wide>
          <ExpenseBreakdownTable pnl={pnl} />
        </Modal>
      )}

      {customizeOpen && (
        <Modal title="Настроить дашборд" onClose={() => setCustomizeOpen(false)}>
          <p className="rp-muted" style={{marginBottom:14}}>Выберите, какие блоки показывать. Настройка сохраняется и применяется на всех ваших устройствах.</p>
          <div className="rp-checklist">
            {Object.keys(DASHBOARD_WIDGET_LABELS).map(key => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={showWidget(key)}
                  onChange={(e) => ctx.setSettings(s => ({ ...s, dashboardWidgets: { ...(s.dashboardWidgets || {}), [key]: e.target.checked } }))}
                />
                {DASHBOARD_WIDGET_LABELS[key]}
              </label>
            ))}
          </div>
          <div style={{display:'flex', justifyContent:'flex-end', marginTop:16}}>
            <button className="rp-btn" onClick={() => setCustomizeOpen(false)}>Готово</button>
          </div>
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
    <div className="rp-table-wrap"><table className="rp-table">
      <thead><tr><th>Статья</th><th>Сумма</th><th>% от расходов</th></tr></thead>
      <tbody>
        {rows.map(([name, val]) => (
          <tr key={name}><td>{name}</td><td className="rp-num">{fmtRub(val)}</td><td className="rp-num">{fmtPct(pnl.totalExpenses ? (val / pnl.totalExpenses) * 100 : 0)}</td></tr>
        ))}
        <tr className="rp-total-row"><td>Итого расходов</td><td className="rp-num">{fmtRub(pnl.totalExpenses)}</td><td /></tr>
      </tbody>
    </table></div>
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
  const [expenseModal, setExpenseModal] = useState(null);
  const [rosterModal, setRosterModal] = useState(null);
  const [advanceModal, setAdvanceModal] = useState(null);
  const [dismissed, setDismissed] = useState({});
  const focusValuesRef = useRef({});

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

  const trackFocus = (key, val) => { focusValuesRef.current[key] = Number(val) || 0; };
  const trackRevenueBlur = (channelId) => {
    const key = `rev:${channelId}`;
    const oldVal = focusValuesRef.current[key];
    const newVal = Number(getDay(month, selectedDate).revenue?.[channelId]) || 0;
    if (oldVal !== undefined && oldVal !== newVal) {
      const channelName = settings.revenueChannels.find((c) => c.id === channelId)?.name || channelId;
      logAudit({
        what: `Выручка изменена (${channelName})`, date: selectedDate, from: oldVal, to: newVal,
        revert: { kind: 'revenueField', monthKey: ctx.monthKey, date: selectedDate, channelId, oldValue: oldVal, newValue: newVal },
      });
    }
    delete focusValuesRef.current[key];
  };
  const trackCourierBlur = (field, label) => {
    const key = `courier:${field}`;
    const oldVal = focusValuesRef.current[key];
    const newVal = Number(getDay(month, selectedDate).courier?.[field]) || 0;
    if (oldVal !== undefined && oldVal !== newVal) {
      logAudit({
        what: `Курьер изменён (${label})`, date: selectedDate, from: oldVal, to: newVal,
        revert: { kind: 'courierField', monthKey: ctx.monthKey, date: selectedDate, field, oldValue: oldVal, newValue: newVal },
      });
    }
    delete focusValuesRef.current[key];
  };
  const trackPromoBlur = () => {
    const key = 'promo:pay';
    const oldVal = focusValuesRef.current[key];
    const newVal = Number(getDay(month, selectedDate).promo?.pay) || 0;
    if (oldVal !== undefined && oldVal !== newVal) {
      logAudit({
        what: 'Промо изменено', date: selectedDate, from: oldVal, to: newVal,
        revert: { kind: 'promoField', monthKey: ctx.monthKey, date: selectedDate, oldValue: oldVal, newValue: newVal },
      });
    }
    delete focusValuesRef.current[key];
  };

  const todaysShifts = (ctx.employees || [])
    .map((e) => ({ emp: e, hours: month.shifts?.[e.id]?.[selectedDate] }))
    .filter((x) => x.hours !== undefined && x.hours !== null && Number(x.hours) > 0);
  const rosterEmployeeIds = new Set(todaysShifts.map((x) => x.emp.id));
  const availableForRoster = (ctx.employees || []).filter((e) => e.status === 'active' && !rosterEmployeeIds.has(e.id));

  const setShiftHours = (employeeId, hours) => {
    updateMonth((m) => {
      const empShifts = { ...(m.shifts?.[employeeId] || {}) };
      if (!hours || Number(hours) <= 0) delete empShifts[selectedDate]; else empShifts[selectedDate] = Number(hours);
      return { ...m, shifts: { ...m.shifts, [employeeId]: empShifts } };
    });
  };
  const removeFromRoster = (employeeId) => {
    setShiftHours(employeeId, 0);
    logAudit({ what: 'Смена сотрудника удалена', date: selectedDate });
  };

  const total = dayRevenueTotal(day, settings.revenueChannels);
  const kitchenTotal = (day.kitchenExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const otherTotal = (day.otherExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);

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
                <input disabled={locked} type="number" value={day.revenue?.[c.id] ?? ''}
                  onFocus={(e) => trackFocus(`rev:${c.id}`, e.target.value)}
                  onChange={(e) => setRevenue(c.id, e.target.value)}
                  onBlur={() => trackRevenueBlur(c.id)}
                  placeholder="0" />
              </Field>
            ))}
          </div>
          <div className="rp-day-total">Итого за день <b>{fmtRub(total)}</b></div>
        </Card>

        <Card>
          <div className="rp-card-title">Курьеры и промо</div>
          <div className="rp-form-grid">
            <Field label="Доставок за день">
              <input disabled={locked} type="number" value={day.courier?.deliveries ?? ''}
                onFocus={(e) => trackFocus('courier:deliveries', e.target.value)}
                onChange={(e) => setCourier('deliveries', Number(e.target.value))}
                onBlur={() => trackCourierBlur('deliveries', 'доставок')}
                placeholder="0" />
            </Field>
            <Field label="Ставка курьера за день">
              <input disabled={locked} type="number" value={day.courier?.pay ?? ''}
                onFocus={(e) => trackFocus('courier:pay', e.target.value)}
                onChange={(e) => setCourier('pay', Number(e.target.value))}
                onBlur={() => trackCourierBlur('pay', 'ставка курьера')}
                placeholder="0" />
            </Field>
            <Field label="Пробег курьера, км">
              <input disabled={locked} type="number" value={day.courier?.km ?? ''}
                onFocus={(e) => trackFocus('courier:km', e.target.value)}
                onChange={(e) => setCourier('km', Number(e.target.value))}
                onBlur={() => trackCourierBlur('km', 'пробег')}
                placeholder="0" />
            </Field>
            <Field label="Зарплата промо">
              <input disabled={locked} type="number" value={day.promo?.pay ?? ''}
                onFocus={(e) => trackFocus('promo:pay', e.target.value)}
                onChange={(e) => setPromo('pay', Number(e.target.value))}
                onBlur={trackPromoBlur}
                placeholder="0" />
            </Field>
          </div>
          <div className="rp-day-total">
            Бензин курьера ({fmt0(day.courier?.km || 0)} км × {settings.courierFuelRatePerKm || 7} ₽/км)
            <b>{fmtRub((Number(day.courier?.km) || 0) * (settings.courierFuelRatePerKm || 7))}</b>
          </div>
        </Card>
      </div>

      <Card>
        <div className="rp-card-title-row">
          <div className="rp-card-title">Кто работал сегодня <span className="rp-muted">— {todaysShifts.length} {todaysShifts.length === 1 ? 'человек' : 'человек(а)'}</span></div>
          <button className="rp-btn rp-btn-sm" disabled={locked || availableForRoster.length === 0} onClick={() => setRosterModal(true)}><UserPlus size={14} /> Добавить на смену</button>
        </div>
        {todaysShifts.length === 0 ? (
          <EmptyState icon={<Users size={26} color={COLORS.inkSoft} />} title="Пока никого не отметили" sub="Добавьте сотрудников, которые сегодня работали" />
        ) : (
          <div className="rp-list">
            {todaysShifts.map(({ emp, hours }) => {
              const standard = emp.standardShift || settings.standardShiftHours;
              let dayPay = null;
              if (emp.payType === 'shift') dayPay = emp.rate * (hours / standard);
              else if (emp.payType === 'hour') dayPay = emp.rate * hours;
              return (
                <div className="rp-list-row" key={emp.id}>
                  <div className={`rp-list-main ${!locked ? 'rp-clickable' : ''}`} onClick={() => !locked && setRosterModal(emp.id)}>
                    <div className="rp-list-cat">{emp.name} <span className="rp-muted-sm">· {emp.position}</span></div>
                    <div className="rp-list-comment">{fmt0(hours)} ч{emp.payType === 'oklad' ? ' · оклад (не по дням)' : ` из ${standard} ч`}</div>
                  </div>
                  <div className="rp-list-amount">{dayPay !== null ? fmtRub(dayPay) : '—'}</div>
                  {!locked && <button className="rp-icon-btn" onClick={() => setRosterModal(emp.id)}>✎</button>}
                  {!locked && <button className="rp-icon-btn rp-icon-btn-danger" onClick={() => removeFromRoster(emp.id)}><Trash2 size={14} /></button>}
                </div>
              );
            })}
          </div>
        )}
        <p className="rp-muted" style={{ marginTop: 10 }}>
          Записи попадают в общие часы сотрудника за месяц — итоговая зарплата, авансы и график смен считаются на странице «Зарплата».
        </p>
      </Card>

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

      {rosterModal && (
        <RosterModal
          mode={typeof rosterModal === 'string' ? 'edit' : 'add'}
          employees={ctx.employees}
          availableForRoster={availableForRoster}
          editingEmployee={typeof rosterModal === 'string' ? ctx.employees.find((e) => e.id === rosterModal) : null}
          editingHours={typeof rosterModal === 'string' ? month.shifts?.[rosterModal]?.[selectedDate] : null}
          standardShiftHours={settings.standardShiftHours}
          onClose={() => setRosterModal(null)}
          onSave={(employeeId, hours) => {
            const isNew = !rosterEmployeeIds.has(employeeId);
            setShiftHours(employeeId, hours);
            const emp = ctx.employees.find((e) => e.id === employeeId);
            logAudit({ what: isNew ? `Добавлен на смену (${emp?.name || ''})` : `Смена изменена (${emp?.name || ''})`, date: selectedDate, to: hours });
            setRosterModal(null);
          }}
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
            const key = expenseModal.kind === 'kitchen' ? 'kitchenExpenses' : 'otherExpenses';
            const oldItem = expenseModal.editItem;
            const newItem = oldItem ? { ...oldItem, ...exp } : { id: uid(), ...exp };
            updateMonth((m) => {
              const d = { ...getDay(m, selectedDate) };
              const list = d[key] || [];
              d[key] = oldItem ? list.map((x) => (x.id === oldItem.id ? newItem : x)) : [...list, newItem];
              return { ...m, days: { ...m.days, [selectedDate]: d } };
            });
            logAudit({
              what: `${oldItem ? 'Изменён' : 'Добавлен'} расход (${expenseModal.kind === 'kitchen' ? 'кухня/бар' : 'прочее'})`,
              date: selectedDate, from: oldItem ? oldItem.amount : undefined, to: exp.amount, category: exp.category,
              revert: oldItem ? { kind: 'expenseItem', monthKey: ctx.monthKey, date: selectedDate, listKey: key, itemId: oldItem.id, oldItem, newItem } : undefined,
            });
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

function RosterModal({ mode, employees, availableForRoster, editingEmployee, editingHours, standardShiftHours, onClose, onSave }) {
  const [employeeId, setEmployeeId] = useState(editingEmployee?.id || availableForRoster[0]?.id || '');
  const emp = mode === 'edit' ? editingEmployee : employees.find((e) => e.id === employeeId);
  const standard = emp?.standardShift || standardShiftHours;
  const [hours, setHours] = useState(editingHours != null ? String(editingHours) : String(standard));

  const dayPayPreview = () => {
    if (!emp) return null;
    const h = Number(hours) || 0;
    if (emp.payType === 'shift') return emp.rate * (h / standard);
    if (emp.payType === 'hour') return emp.rate * h;
    return null;
  };
  const preview = dayPayPreview();

  const options = mode === 'edit' ? [editingEmployee].filter(Boolean) : availableForRoster;

  return (
    <Modal title={mode === 'edit' ? `Смена — ${editingEmployee?.name}` : 'Добавить на смену'} onClose={onClose}>
      {options.length === 0 ? (
        <EmptyState icon={<Users size={24} color={COLORS.inkSoft} />} title="Все активные сотрудники уже добавлены на сегодня" />
      ) : (
        <>
          <div className="rp-form-grid">
            <Field label="Сотрудник">
              <select value={employeeId} disabled={mode === 'edit'} onChange={(e) => { setEmployeeId(e.target.value); const ne = employees.find((x) => x.id === e.target.value); setHours(String(ne?.standardShift || standardShiftHours)); }}>
                {options.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.position}</option>)}
              </select>
            </Field>
            <Field label={`Часы (${emp?.payType === 'oklad' ? 'для учёта, оклад не по дням' : `ставка/смена: ${emp ? fmtRub(emp.rate) : '—'}`})`}>
              <input type="number" autoFocus={mode === 'edit'} value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
          </div>
          <div className="rp-toolbar" style={{ marginBottom: 8 }}>
            <button type="button" className="rp-btn rp-btn-xs rp-btn-ghost" onClick={() => setHours(String(standard))}>Полная смена ({standard} ч)</button>
            <button type="button" className="rp-btn rp-btn-xs rp-btn-ghost" onClick={() => setHours(String(Math.round(standard / 2)))}>Полсмены ({Math.round(standard / 2)} ч)</button>
          </div>
          {preview !== null && <div className="rp-day-total">Оплата за день <b>{fmtRub(preview)}</b></div>}
          <div className="rp-modal-actions">
            <button className="rp-btn" disabled={!employeeId || !hours} onClick={() => onSave(employeeId, Number(hours))}>{mode === 'edit' ? 'Сохранить' : 'Добавить'}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
/* ============================== EMPLOYEES ============================== */

function EmployeesPage({ ctx }) {
  const { employees, setEmployees, month, updateMonth, settings, year, monthIdx, monthKey, logAudit } = ctx;
  const [editing, setEditing] = useState(null);
  const [shiftsFor, setShiftsFor] = useState(null);
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
        <div className="rp-table-wrap"><table className="rp-table">
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
        </table></div>
      </Card>

      {editing && (
        <Modal title={employees.some((e) => e.id === editing.id) ? 'Сотрудник' : 'Новый сотрудник'} onClose={() => setEditing(null)}>
          <EmployeeForm emp={editing} onSave={saveEmployee} />
        </Modal>
      )}

      {shiftsFor && (
        <ShiftGridModal
          emp={employees.find((e) => e.id === shiftsFor)}
          month={month} updateMonth={updateMonth} nd={nd} year={year} monthIdx={monthIdx} monthKey={monthKey}
          settings={settings} locked={month.closed} logAudit={logAudit}
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

function ShiftGridModal({ emp, month, updateMonth, nd, year, monthIdx, monthKey, settings, locked, onClose, logAudit }) {
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

      {tab === 'adjust' && <AdjustmentsPanel emp={emp} month={month} updateMonth={updateMonth} locked={locked} year={year} monthIdx={monthIdx} monthKey={monthKey} logAudit={logAudit} />}
    </Modal>
  );
}

function AdjustmentsPanel({ emp, month, updateMonth, locked, year, monthIdx, monthKey, logAudit }) {
  const defaultDateFor = (h) => dateStr(year, monthIdx, h === 1 ? 1 : Math.min(16, daysInMonth(year, monthIdx)));
  const [amount, setAmount] = useState(''); const [type, setType] = useState('bonus'); const [half, setHalf] = useState(1); const [comment, setComment] = useState('');
  const [date, setDate] = useState(defaultDateFor(1));
  const [editingId, setEditingId] = useState(null);
  const [editingOriginal, setEditingOriginal] = useState(null);
  const list = (month.adjustments || []).filter((a) => a.employeeId === emp.id);
  const typeLabel = { bonus: 'Бонус', motivation: 'Мотивация', penalty: 'Штраф/удержание', advance: 'Аванс', manual: 'Ручная корректировка' };

  const resetForm = () => { setAmount(''); setType('bonus'); setHalf(1); setComment(''); setDate(defaultDateFor(1)); setEditingId(null); setEditingOriginal(null); };

  const startEdit = (a) => {
    setEditingId(a.id); setEditingOriginal(a); setType(a.type); setHalf(a.half); setAmount(String(a.amount));
    setComment(a.comment || ''); setDate(a.date || defaultDateFor(a.half));
  };

  const onHalfChange = (h) => { setHalf(h); if (!editingId) setDate(defaultDateFor(h)); };

  const save = () => {
    if (!amount) return;
    if (editingId) {
      const newItem = { ...editingOriginal, type, half, amount: Number(amount), comment, date };
      updateMonth((m) => ({ ...m, adjustments: (m.adjustments || []).map((a) => (a.id === editingId ? newItem : a)) }));
      if (logAudit) {
        logAudit({
          what: `Корректировка изменена (${emp.name})`, date, from: editingOriginal.amount, to: Number(amount), category: typeLabel[type],
          revert: { kind: 'adjustmentItem', monthKey, employeeId: emp.id, adjustmentId: editingId, oldItem: editingOriginal, newItem },
        });
      }
    } else {
      updateMonth((m) => ({ ...m, adjustments: [...(m.adjustments || []), { id: uid(), employeeId: emp.id, type, half, amount: Number(amount), comment, date }] }));
      if (logAudit) logAudit({ what: `Добавлена корректировка (${emp.name})`, date, amount: Number(amount), category: typeLabel[type] });
    }
    resetForm();
  };
  const del = (id) => {
    updateMonth((m) => ({ ...m, adjustments: (m.adjustments || []).filter((a) => a.id !== id) }));
    if (editingId === id) resetForm();
  };

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
            <select value={half} onChange={(e) => onHalfChange(Number(e.target.value))}>
              <option value={1}>1-я (1–15)</option><option value={2}>2-я (16–конец)</option>
            </select>
          </Field>
          <Field label="Дата"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
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
              <div className="rp-list-cat">{typeLabel[a.type]} · {a.half}-я половина{a.date ? ` · ${a.date.split('-').reverse().join('.')}` : ''}</div>{a.comment && <div className="rp-list-comment">{a.comment}</div>}
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
        <div className="rp-table-wrap"><table className="rp-table">
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
        </table></div>
      </Card>
    </div>
  );
}

/* ============================== SUPPLIERS ============================== */

function SuppliersPage({ ctx }) {
  const { suppliers, setSuppliers, months, setMonths, month, updateMonth, year, monthIdx, logAudit, session, settings } = ctx;
  const [opModal, setOpModal] = useState(null);
  const [newSupplier, setNewSupplier] = useState(false);
  const [name, setName] = useState('');
  const [historyFor, setHistoryFor] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncSummary, setSyncSummary] = useState(null);
  const [itemsFor, setItemsFor] = useState(null);

  const ledger = useMemo(() => supplierLedger(months, suppliers, year, monthIdx), [months, suppliers, year, monthIdx]);
  const activeSuppliers = suppliers.filter((s) => !s.archived);
  const visibleSuppliers = showArchived ? suppliers : activeSuppliers;

  const addSupplier = () => {
    if (!name.trim()) return;
    setSuppliers((p) => [...p, { id: uid(), name: name.trim(), archived: false }]);
    setName(''); setNewSupplier(false);
  };
  const archive = (id) => setSuppliers((p) => p.map((s) => (s.id === id ? { ...s, archived: !s.archived } : s)));
  const rename = (id, newName) => {
    const oldName = renaming?.name;
    setSuppliers((p) => p.map((s) => (s.id === id ? { ...s, name: newName } : s)));
    logAudit({ what: 'Переименован поставщик', from: oldName, to: newName, revert: { kind: 'supplierName', supplierId: id, oldValue: oldName, newValue: newName } });
    setRenaming(null);
  };
  const removeForever = (id, supplierName) => { setSuppliers((p) => p.filter((s) => s.id !== id)); logAudit({ what: 'Удалён поставщик', supplier: supplierName }); setDeleting(null); };

  const normalizeForDupe = (s) => String(s || '').replace(/["«»]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const duplicateGroups = useMemo(() => {
    const byNorm = new Map();
    for (const s of suppliers) {
      const key = normalizeForDupe(s.name);
      if (!byNorm.has(key)) byNorm.set(key, []);
      byNorm.get(key).push(s);
    }
    return [...byNorm.values()].filter((g) => g.length > 1);
  }, [suppliers]);

  const mergeDuplicates = () => {
    if (duplicateGroups.length === 0) return;
    const idRemap = new Map();
    let keptSuppliers = [...suppliers];
    for (const group of duplicateGroups) {
      const sorted = [...group].sort((a, b) => a.name.length - b.name.length);
      const keeper = sorted[0];
      for (const dup of sorted.slice(1)) idRemap.set(dup.id, keeper.id);
    }
    keptSuppliers = keptSuppliers.filter((s) => !idRemap.has(s.id));
    setSuppliers(keptSuppliers);
    setMonths((prev) => {
      const next = {};
      for (const [mk, m] of Object.entries(prev)) {
        const remappedOrders = (m.supplierOrders || []).map((o) => idRemap.has(o.supplierId) ? { ...o, supplierId: idRemap.get(o.supplierId) } : o);
        const seen = new Map();
        for (const o of remappedOrders) {
          const key = `${o.supplierId}::${o.date}::${o.amount}`;
          const existing = seen.get(key);
          if (!existing) { seen.set(key, o); continue; }
          if ((!existing.items || existing.items.length === 0) && o.items?.length > 0) seen.set(key, o);
        }
        next[mk] = {
          ...m,
          supplierOrders: [...seen.values()],
          supplierPayments: (m.supplierPayments || []).map((p) => idRemap.has(p.supplierId) ? { ...p, supplierId: idRemap.get(p.supplierId) } : p),
        };
      }
      return next;
    });
    logAudit({ what: `Объединены дубли поставщиков (${duplicateGroups.length})`, });
  };

  const syncFromIiko = async (customFrom, customTo) => {
    setSyncLoading(true); setSyncError(''); setSyncSummary(null);
    try {
      const from = customFrom || dateStr(year, monthIdx, 1);
      const to = customTo || dateStr(year, monthIdx, daysInMonth(year, monthIdx));
      const resp = await fetch('/api/iiko-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ from, to })
      });
      const data = await resp.json();
      if (!resp.ok) { setSyncError(data?.error || 'Не удалось получить накладные из iiko.'); return; }

      const invoices = data?.invoices || [];
      if (invoices.length === 0) { setSyncSummary({ added: 0, newSuppliers: 0, skipped: 0, filledIn: 0, total: 0 }); return; }

      const normalize = (s) => String(s || '').trim().toLowerCase();
      const existingByName = new Map(suppliers.map((s) => [normalize(s.name), s]));
      const newSuppliersToAdd = [];
      const monthPatches = {};
      let skipped = 0;
      let filledIn = 0;
      let added = 0;

      for (const inv of invoices) {
        const invMonthKey = inv.date.slice(0, 7);
        if (!monthPatches[invMonthKey]) monthPatches[invMonthKey] = { updateItemsById: new Map(), toAdd: [] };

        const key = normalize(inv.supplier);
        let supplierId;
        const found = existingByName.get(key);
        if (found) {
          supplierId = found.id;
        } else {
          const created = { id: uid(), name: inv.supplier, archived: false };
          newSuppliersToAdd.push(created);
          existingByName.set(key, created);
          supplierId = created.id;
        }

        const existingOrders = (months[invMonthKey]?.supplierOrders || []).filter((o) => o.source === 'iiko');
        const existing = existingOrders.find((o) => o.supplierId === supplierId && o.date === inv.date && o.amount === inv.amount);
        if (existing) {
          if ((!existing.items || existing.items.length === 0) && inv.items?.length > 0) {
            monthPatches[invMonthKey].updateItemsById.set(existing.id, inv.items);
            filledIn += 1;
          } else {
            skipped += 1;
          }
          continue;
        }
        const alreadyQueued = monthPatches[invMonthKey].toAdd.some((o) => o.supplierId === supplierId && o.date === inv.date && o.amount === inv.amount);
        if (alreadyQueued) { skipped += 1; continue; }
        monthPatches[invMonthKey].toAdd.push({ id: uid(), supplierId, date: inv.date, amount: inv.amount, invoice: '', comment: 'Импортировано из iiko', source: 'iiko', items: inv.items || [] });
        added += 1;
      }

      if (newSuppliersToAdd.length > 0) setSuppliers((prev) => [...prev, ...newSuppliersToAdd]);
      if (added > 0 || filledIn > 0) {
        setMonths((prevMonths) => {
          const next = { ...prevMonths };
          for (const [mk, patch] of Object.entries(monthPatches)) {
            const cur = next[mk] || emptyMonth(settings, null);
            next[mk] = {
              ...cur,
              supplierOrders: [
                ...(cur.supplierOrders || []).map((o) => patch.updateItemsById.has(o.id) ? { ...o, items: patch.updateItemsById.get(o.id) } : o),
                ...patch.toAdd
              ]
            };
          }
          return next;
        });
        logAudit({ what: 'Синхронизация накладных с iiko', amount: Object.values(monthPatches).reduce((s, p) => s + p.toAdd.reduce((s2, o) => s2 + o.amount, 0), 0) });
      }

      setSyncSummary({ added, newSuppliers: newSuppliersToAdd.length, skipped, filledIn, total: invoices.length });
    } catch (e) {
      setSyncError(e?.message || 'Не удалось связаться с сервером.');
    } finally {
      setSyncLoading(false);
    }
  };

  const [fullSyncOpen, setFullSyncOpen] = useState(false);
  const earliestKnownOrderDate = useMemo(() => {
    let earliest = null;
    for (const m of Object.values(months)) {
      for (const o of (m.supplierOrders || [])) {
        if (o.date && (!earliest || o.date < earliest)) earliest = o.date;
      }
    }
    return earliest;
  }, [months]);
  const [fullSyncFrom, setFullSyncFrom] = useState(() => earliestKnownOrderDate || (() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10); })());
  const [fullSyncTo, setFullSyncTo] = useState(() => new Date().toISOString().slice(0, 10));

  const totalOrdered = activeSuppliers.reduce((s, sup) => s + (ledger[sup.id]?.ordered || 0), 0);
  const totalPaid = activeSuppliers.reduce((s, sup) => s + (ledger[sup.id]?.paid || 0), 0);

  const deliveriesByDay = useMemo(() => {
    const map = {};
    for (const o of (month.supplierOrders || [])) {
      if (!o.date) continue;
      const sup = suppliers.find((s) => s.id === o.supplierId);
      (map[o.date] ||= []).push({ id: o.id, supplierName: sup?.name || '—', amount: Number(o.amount) || 0, items: o.items || [] });
    }
    return map;
  }, [month.supplierOrders, suppliers]);

  const calendarWeeks = useMemo(() => {
    const total = daysInMonth(year, monthIdx);
    const firstWeekday = (new Date(year, monthIdx, 1).getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [year, monthIdx]);

  return (
    <div className="rp-page">
      <div className="rp-page-head"><h1>Поставщики</h1><div className="rp-page-sub">Заявки, оплаты и задолженность (нарастающим итогом до {MONTHS_RU[monthIdx].toLowerCase()} {year})</div></div>

      <div className="rp-grid-4">
        <Stat label="Заявлено всего" value={fmtRub(totalOrdered)} />
        <Stat label="Заявлено в этом месяце" value={fmtRub((month.supplierOrders || []).reduce((s, o) => s + (Number(o.amount) || 0), 0))} />
        <Stat label="Поставок в этом месяце" value={fmt0((month.supplierOrders || []).length)} />
        <Stat label="Активных поставщиков" value={fmt0(activeSuppliers.length)} />
      </div>

      <div className="rp-toolbar">
        <button className="rp-btn" onClick={() => setNewSupplier(true)}><Plus size={15} /> Добавить поставщика</button>
        <button className="rp-btn rp-btn-ghost" onClick={() => syncFromIiko()} disabled={syncLoading}>
          <RefreshCw size={15} className={syncLoading ? 'rp-spin' : ''} /> {syncLoading ? 'Синхронизирую…' : 'Синхронизировать с iiko'}
        </button>
        <button className="rp-btn rp-btn-ghost" onClick={() => setFullSyncOpen(true)} disabled={syncLoading} title="Пройтись по широкому диапазону дат разом — полезно, если состав накладных заполнен не за все месяцы">
          <History size={15} /> Досинхронизировать историю
        </button>
        <label className="rp-toggle-inline">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Показывать архивных
        </label>
      </div>
      {syncError && <div className="rp-inline-warn" style={{marginBottom:16}}><AlertTriangle size={13}/> {syncError}</div>}
      {syncSummary && (
        <div className="rp-cash-check" style={{marginBottom:16}}>
          <Info size={13}/> {syncSummary.total === 0
            ? 'За выбранный период накладных в iiko не найдено.'
            : <>Готово: добавлено <b>{syncSummary.added}</b> поставок{syncSummary.newSuppliers > 0 && <> (создано {syncSummary.newSuppliers} новых поставщиков)</>}{syncSummary.filledIn > 0 && <>, у {syncSummary.filledIn} уже загруженных ранее дозаполнен состав</>}{syncSummary.skipped > 0 && <>, {syncSummary.skipped} уже были загружены раньше (без изменений)</>}.</>}
        </div>
      )}

      {duplicateGroups.length > 0 && (
        <div className="rp-alert" style={{marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12}}>
          <div><AlertTriangle size={16}/> Найдено {duplicateGroups.length} задвоенных поставщиков: {duplicateGroups.map((g) => g.map((s) => s.name).join(' = ')).join('; ')}.</div>
          <button className="rp-btn" onClick={mergeDuplicates}>Объединить</button>
        </div>
      )}

      {fullSyncOpen && (
        <Modal title="Досинхронизировать историю" onClose={() => setFullSyncOpen(false)}>
          <p className="rp-muted" style={{marginBottom:14}}>Пройдёмся по выбранному диапазону дат разом. Уже загруженные поставки не задвоятся — если у них раньше не было состава (списка товаров), он дозаполнится. Чем шире диапазон, тем дольше запрос — обычно до минуты на несколько месяцев.</p>
          <div className="rp-form-grid">
            <Field label="С"><input type="date" value={fullSyncFrom} onChange={(e) => setFullSyncFrom(e.target.value)} /></Field>
            <Field label="По"><input type="date" value={fullSyncTo} onChange={(e) => setFullSyncTo(e.target.value)} /></Field>
          </div>
          <div className="rp-modal-actions">
            <button className="rp-btn rp-btn-ghost" onClick={() => setFullSyncOpen(false)}>Отмена</button>
            <button className="rp-btn" disabled={syncLoading} onClick={async () => { setFullSyncOpen(false); await syncFromIiko(fullSyncFrom, fullSyncTo); }}>
              {syncLoading ? 'Синхронизирую…' : 'Начать'}
            </button>
          </div>
        </Modal>
      )}

      <Card>
        <div className="rp-table-wrap"><table className="rp-table">
          <thead><tr><th>Поставщик</th><th>Заявлено</th><th /></tr></thead>
          <tbody>
            {visibleSuppliers.map((s) => {
              const l = ledger[s.id] || { ordered: 0, paid: 0 };
              return (
                <tr key={s.id} style={s.archived ? { opacity: 0.55 } : {}}>
                  <td className="rp-strong rp-link" onClick={() => setHistoryFor(s.id)}>{s.name}{s.archived && <span className="rp-badge off" style={{ marginLeft: 6 }}>архив</span>}</td>
                  <td className="rp-num">{fmtRub(l.ordered)}</td>
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
            {visibleSuppliers.length === 0 && <tr><td colSpan={3}><EmptyState icon={<Truck size={24} color={COLORS.inkSoft} />} title="Поставщиков нет" /></td></tr>}
          </tbody>
        </table></div>
      </Card>

      <Card style={{marginTop:16}}>
        <div className="rp-card-title">График поставок — {MONTHS_RU[monthIdx]} {year}</div>
        <div className="rp-muted" style={{marginBottom:14}}>Что и когда приехало. Только суммы поставок — статус оплаты здесь не отслеживается.</div>
        <div className="rp-cal-grid">
          {WEEKDAYS_RU.map((w) => <div key={w} className="rp-cal-weekday">{w}</div>)}
          {calendarWeeks.flat().map((d, i) => {
            if (d == null) return <div key={i} className="rp-cal-cell rp-cal-cell-empty" />;
            const dateKey = dateStr(year, monthIdx, d);
            const items = deliveriesByDay[dateKey] || [];
            const dayTotal = items.reduce((s, it) => s + it.amount, 0);
            const isToday = dateKey === new Date().toISOString().slice(0, 10);
            return (
              <div key={i} className={`rp-cal-cell ${items.length > 0 ? 'rp-cal-has-items' : ''} ${isToday ? 'rp-cal-today' : ''}`}>
                <div className="rp-cal-daynum">{d}</div>
                {items.length > 0 && (
                  <div className="rp-cal-items">
                    {items.map((it, j) => (
                      <div
                        key={j}
                        className={`rp-cal-chip ${it.items?.length > 0 ? 'rp-cal-chip-clickable' : ''}`}
                        title={`${it.supplierName}: ${fmtRub(it.amount)}${it.items?.length ? ' — нажмите, чтобы увидеть состав' : ''}`}
                        onClick={it.items?.length > 0 ? () => setItemsFor({ supplierName: it.supplierName, date: dateKey, amount: it.amount, items: it.items }) : undefined}
                      >{it.supplierName}</div>
                    ))}
                    <div className="rp-cal-daytotal">{fmtRub(dayTotal)}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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

      {itemsFor && (
        <Modal title={`${itemsFor.supplierName} — ${itemsFor.date}`} onClose={() => setItemsFor(null)}>
          <div className="rp-muted" style={{marginBottom:10}}>Сумма накладной: <b>{fmtRub(itemsFor.amount)}</b></div>
          <div className="rp-table-wrap"><table className="rp-table">
            <thead><tr><th>Товар</th><th>Кол-во</th><th>Сумма</th></tr></thead>
            <tbody>
              {itemsFor.items.map((it, j) => (
                <tr key={j}><td>{it.name}</td><td className="rp-num">{it.qty}{it.unit ? ` ${it.unit}` : ""}</td><td className="rp-num">{fmtRub(it.sum)}</td></tr>
              ))}
            </tbody>
          </table></div>
        </Modal>
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
  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (id) => setExpanded((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const events = [
    ...(ledger?.orders || []).map((o) => ({ ...o, kind: 'Поставка' })),
    ...(ledger?.payments || []).map((p) => ({ ...p, kind: 'Оплата' })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <Modal title={`История — ${supplier?.name}`} onClose={onClose} wide>
      <div className="rp-table-wrap"><table className="rp-table">
        <thead><tr><th>Дата</th><th>Тип</th><th>Сумма</th><th>Комментарий</th></tr></thead>
        <tbody>
          {events.map((e) => {
            const hasItems = e.kind === 'Поставка' && e.items?.length > 0;
            const open = expanded.has(e.id);
            return (
              <React.Fragment key={e.id}>
                <tr className={hasItems ? 'rp-clickable' : ''} onClick={hasItems ? () => toggle(e.id) : undefined}>
                  <td>{e.date}</td>
                  <td>
                    {e.kind}
                    {hasItems && (open ? <ChevronUp size={12} style={{verticalAlign:-1, marginLeft:4}}/> : <ChevronDown size={12} style={{verticalAlign:-1, marginLeft:4}}/>)}
                    {e.kind === 'Поставка' && !hasItems && <span className="rp-muted" style={{fontSize:11, marginLeft:6}}>(нет состава)</span>}
                  </td>
                  <td className="rp-num">{fmtRub(e.amount)}</td>
                  <td>{e.comment || e.invoice || '—'}</td>
                </tr>
                {hasItems && open && (
                  <tr>
                    <td colSpan={4} style={{padding:0, background:COLORS.bg}}>
                      <table className="rp-table" style={{margin:'4px 0 8px 24px', width:'calc(100% - 24px)'}}>
                        <thead><tr><th>Товар</th><th>Кол-во</th><th>Сумма</th></tr></thead>
                        <tbody>
                          {e.items.map((it, j) => (
                            <tr key={j}><td>{it.name}</td><td className="rp-num">{it.qty}{it.unit ? ` ${it.unit}` : ""}</td><td className="rp-num">{fmtRub(it.sum)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {events.length === 0 && <tr><td colSpan={4}><EmptyState icon={<Truck size={24} color={COLORS.inkSoft} />} title="Пока нет операций" /></td></tr>}
        </tbody>
      </table></div>
    </Modal>
  );
}
/* ============================== PURCHASE ANALYTICS ============================== */

function PurchaseAnalyticsPage({ ctx }) {
  const { months, suppliers, year, monthIdx, goMonth } = ctx;
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [expandedDelivery, setExpandedDelivery] = useState(null);

  const monthKey = monthKeyOf(year, monthIdx);
  const prevDateObj = new Date(year, monthIdx - 1, 1);
  const prevMonthKey = monthKeyOf(prevDateObj.getFullYear(), prevDateObj.getMonth());

  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name || '—';

  const roundQty = (v, unit) => {
    const n = Number(v) || 0;
    const isPieces = /^шт/i.test(String(unit || ''));
    const decimals = isPieces ? 0 : 3;
    const factor = 10 ** decimals;
    return Math.round(n * factor) / factor;
  };
  const fmtQty = (v, unit) => `${roundQty(v, unit)}${unit ? ` ${unit}` : ''}`;

  const productsByMonth = useMemo(() => {
    const byMonth = {};
    for (const [mk, m] of Object.entries(months)) {
      const bucket = new Map();
      for (const o of (m.supplierOrders || [])) {
        if (!o.items || o.items.length === 0) continue;
        if (supplierFilter !== 'all' && o.supplierId !== supplierFilter) continue;
        for (const it of o.items) {
          const key = String(it.name || '').trim().toLowerCase();
          if (!key) continue;
          if (!bucket.has(key)) bucket.set(key, { key, name: it.name, unit: it.unit || '', qty: 0, sum: 0, suppliers: new Set() });
          const entry = bucket.get(key);
          entry.qty += Number(it.qty) || 0;
          entry.sum += Number(it.sum) || 0;
          entry.suppliers.add(supplierName(o.supplierId));
        }
      }
      for (const entry of bucket.values()) {
        entry.qty = roundQty(entry.qty, entry.unit);
        entry.sum = Math.round(entry.sum * 100) / 100;
      }
      byMonth[mk] = bucket;
    }
    return byMonth;
  }, [months, suppliers, supplierFilter]);

  const curMap = productsByMonth[monthKey] || new Map();
  const prevMap = productsByMonth[prevMonthKey] || new Map();
  const hasComparison = prevMap.size > 0;

  const deliveryHistory = useMemo(() => {
    const all = [];
    for (const m of Object.values(months)) {
      for (const o of (m.supplierOrders || [])) {
        if (!o.date) continue;
        if (supplierFilter !== 'all' && o.supplierId !== supplierFilter) continue;
        all.push({ id: o.id, date: o.date, supplierId: o.supplierId, amount: Number(o.amount) || 0, hasItems: (o.items || []).length > 0, items: o.items || [] });
      }
    }
    all.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const lastBySupplier = new Map();
    const rows = all.map((d) => {
      const prevAmount = lastBySupplier.get(d.supplierId);
      lastBySupplier.set(d.supplierId, d.amount);
      const deltaPct = prevAmount != null && prevAmount > 0 ? ((d.amount - prevAmount) / prevAmount) * 100 : null;
      return { ...d, supplierName: supplierName(d.supplierId), prevAmount: prevAmount ?? null, deltaPct };
    });
    return rows.reverse();
  }, [months, suppliers, supplierFilter]);

  const avgBySupplier = useMemo(() => {
    const sums = new Map();
    for (const d of deliveryHistory) {
      const cur = sums.get(d.supplierId) || { total: 0, count: 0 };
      cur.total += d.amount; cur.count += 1;
      sums.set(d.supplierId, cur);
    }
    const avg = new Map();
    for (const [id, { total, count }] of sums) avg.set(id, count > 0 ? total / count : 0);
    return avg;
  }, [deliveryHistory]);

  const supplierSummary = useMemo(() => {
    const ids = new Set(suppliers.filter((s) => !s.archived).map((s) => s.id));
    const rows = [...ids].map((id) => {
      const curTotal = ((months[monthKey]?.supplierOrders) || []).filter((o) => o.supplierId === id).reduce((s, o) => s + (Number(o.amount) || 0), 0);
      const prevTotal = ((months[prevMonthKey]?.supplierOrders) || []).filter((o) => o.supplierId === id).reduce((s, o) => s + (Number(o.amount) || 0), 0);
      const curCount = ((months[monthKey]?.supplierOrders) || []).filter((o) => o.supplierId === id).length;
      const deltaPct = prevTotal > 0 ? ((curTotal - prevTotal) / prevTotal) * 100 : (curTotal > 0 ? null : 0);
      return { id, name: supplierName(id), curTotal, prevTotal, curCount, deltaPct };
    });
    return rows.filter((r) => r.curTotal > 0 || r.prevTotal > 0).sort((a, b) => b.curTotal - a.curTotal);
  }, [suppliers, months, monthKey, prevMonthKey]);

  const selectedSupplierMonthly = useMemo(() => {
    if (supplierFilter === 'all') return [];
    const keys = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, monthIdx - i, 1);
      keys.push(monthKeyOf(d.getFullYear(), d.getMonth()));
    }
    return keys.map((mk) => ({
      label: `${mk.slice(5)}.${mk.slice(2, 4)}`,
      Сумма: Math.round((((months[mk]?.supplierOrders) || []).filter((o) => o.supplierId === supplierFilter).reduce((s, o) => s + (Number(o.amount) || 0), 0)) * 100) / 100
    }));
  }, [supplierFilter, months, year, monthIdx]);

  const comparisonRows = useMemo(() => {
    const keys = new Set([...curMap.keys(), ...prevMap.keys()]);
    const rows = [];
    for (const key of keys) {
      const cur = curMap.get(key);
      const prev = prevMap.get(key);
      const curQty = cur?.qty || 0;
      const prevQty = prev?.qty || 0;
      const deltaQty = curQty - prevQty;
      const deltaPct = prevQty > 0 ? (deltaQty / prevQty) * 100 : (curQty > 0 ? null : 0);
      rows.push({
        key,
        name: cur?.name || prev?.name,
        unit: cur?.unit || prev?.unit || '',
        curQty, prevQty, deltaQty, deltaPct,
        curSum: cur?.sum || 0, prevSum: prev?.sum || 0,
        suppliers: [...new Set([...(cur?.suppliers || []), ...(prev?.suppliers || [])])]
      });
    }
    return rows.sort((a, b) => b.curSum - a.curSum);
  }, [curMap, prevMap]);

  const topThisMonth = [...curMap.values()].sort((a, b) => b.sum - a.sum);

  const movers = comparisonRows.filter((r) => r.prevQty > 0 && r.curQty > 0 && r.deltaPct != null).map((r) => ({ ...r, impact: r.curSum - r.prevSum }));
  const growing = [...movers].filter((r) => r.deltaPct > 5 && r.impact > 0).sort((a, b) => b.impact - a.impact).slice(0, 12);
  const declining = [...movers].filter((r) => r.deltaPct < -5 && r.impact < 0).sort((a, b) => a.impact - b.impact).slice(0, 12);
  const newProducts = hasComparison ? comparisonRows.filter((r) => r.prevQty === 0 && r.curQty > 0).sort((a, b) => b.curSum - a.curSum) : [];
  const droppedProducts = hasComparison ? comparisonRows.filter((r) => r.prevQty > 0 && r.curQty === 0).sort((a, b) => b.prevSum - a.prevSum) : [];
  const growingImpactTotal = growing.reduce((s, r) => s + r.impact, 0);
  const decliningImpactTotal = declining.reduce((s, r) => s + r.impact, 0);
  const newProductsTotal = newProducts.reduce((s, r) => s + r.curSum, 0);
  const droppedProductsTotal = droppedProducts.reduce((s, r) => s + r.prevSum, 0);

  const curTotalSpend = topThisMonth.reduce((s, r) => s + r.sum, 0);
  const prevTotalSpend = [...prevMap.values()].reduce((s, r) => s + r.sum, 0);
  const totalDeltaPct = prevTotalSpend > 0 ? ((curTotalSpend - prevTotalSpend) / prevTotalSpend) * 100 : 0;

  const last6MonthKeys = useMemo(() => {
    const keys = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, monthIdx - i, 1);
      keys.push(monthKeyOf(d.getFullYear(), d.getMonth()));
    }
    return keys;
  }, [year, monthIdx]);

  const topSuppliersThisMonth = useMemo(() => {
    const totals = new Map();
    for (const o of ((months[monthKey]?.supplierOrders) || [])) {
      totals.set(o.supplierId, (totals.get(o.supplierId) || 0) + (Number(o.amount) || 0));
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
  }, [months, monthKey]);

  const supplierTrendData = useMemo(() => {
    return last6MonthKeys.map((mk) => {
      const row = { label: `${mk.slice(5)}.${mk.slice(2, 4)}` };
      for (const id of topSuppliersThisMonth) {
        const name = supplierName(id);
        const total = ((months[mk]?.supplierOrders) || []).filter((o) => o.supplierId === id).reduce((s, o) => s + (Number(o.amount) || 0), 0);
        row[name] = Math.round(total * 100) / 100;
      }
      return row;
    });
  }, [last6MonthKeys, months, topSuppliersThisMonth, suppliers]);

  const productTimeline = useMemo(() => {
    if (!selectedProduct) return [];
    const points = [];
    for (const m of Object.values(months)) {
      for (const o of (m.supplierOrders || [])) {
        for (const it of (o.items || [])) {
          if (String(it.name || '').trim().toLowerCase() === selectedProduct) {
            points.push({ date: o.date, qty: roundQty(it.qty, it.unit), unit: it.unit || '', sum: Math.round((Number(it.sum) || 0) * 100) / 100, supplier: supplierName(o.supplierId) });
          }
        }
      }
    }
    return points.sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedProduct, months, suppliers]);

  const selectedProductName = comparisonRows.find((r) => r.key === selectedProduct)?.name
    || topThisMonth.find((r) => r.key === selectedProduct)?.name
    || productTimeline[0]?.name || selectedProduct;

  const hasAnyItemsData = Object.values(productsByMonth).some((m) => m.size > 0);

  const DeltaBadge = ({ pct }) => {
    if (pct == null) return <span className="rp-badge" style={{ background: `${COLORS.accent}22`, color: COLORS.accent }}>новый</span>;
    return (
      <span className={`rp-delta ${pct > 0 ? 'rp-delta-bad' : 'rp-delta-good'}`}>
        {pct > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {pct > 0 ? '+' : ''}{pct.toFixed(0)}%
      </span>
    );
  };

  return (
    <div className="rp-page">
      <div className="rp-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Аналитика закупок</h1>
          <div className="rp-page-sub">
            {hasComparison
              ? <>{MONTHS_RU[monthIdx]} {year} против {MONTHS_RU[prevDateObj.getMonth()].toLowerCase()} {prevDateObj.getFullYear()}</>
              : <>{MONTHS_RU[monthIdx]} {year} — за прошлый месяц данных ещё нет, сравнение появится позже</>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="rp-icon-btn" onClick={() => goMonth(-1)}><ChevronLeft size={18} /></button>
          <div style={{ fontWeight: 700, minWidth: 130, textAlign: 'center' }}>{MONTHS_RU[monthIdx]} {year}</div>
          <button className="rp-icon-btn" onClick={() => goMonth(1)}><ChevronRight size={18} /></button>
        </div>
      </div>

      {!hasAnyItemsData && (
        <div className="rp-alert rp-alert-info" style={{ marginBottom: 16 }}>
          <Info size={16} /> Пока нет ни одной поставки с составом (товарами). Зайдите на страницу «Поставщики» и нажмите «Синхронизировать с iiko» — аналитика строится по составу накладных, полученному оттуда. Поставки, добавленные вручную, сюда не попадают (у них нет списка товаров).
        </div>
      )}

      <div className="rp-grid-4">
        <Stat label="Закупки в этом месяце" value={fmtRub(curTotalSpend)} delta={hasComparison ? totalDeltaPct : undefined} deltaGood={false} />
        <Stat label="Закупки в прошлом месяце" value={hasComparison ? fmtRub(prevTotalSpend) : '—'} />
        <Stat label="Товарных позиций" value={fmt0(topThisMonth.length)} />
        <Stat label="Поставщиков закупало" value={fmt0(new Set(((months[monthKey]?.supplierOrders) || []).map((o) => o.supplierId)).size)} />
      </div>

      <div style={{ margin: '16px 0' }}>
        <Field label="Фильтр по поставщику">
          <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
            <option value="all">Все поставщики</option>
            {suppliers.filter((s) => !s.archived).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>

      <Card>
        {supplierFilter === 'all' ? (
          <Section title="Сводка по поставщикам" count={supplierSummary.length} defaultOpen={true}>
            {supplierSummary.length === 0 ? (
              <div className="rp-muted" style={{ fontSize: 13 }}>Пока нет ни одной поставки.</div>
            ) : (
              <>
                <p className="rp-muted" style={{ fontSize: 12, marginBottom: 10 }}>Клик по поставщику — детальная история и график только по нему.</p>
                <div className="rp-table-wrap">
                  <table className="rp-table">
                    <thead><tr><th>Поставщик</th><th>Поставок в этом месяце</th><th>Этот месяц</th><th>Прошлый месяц</th><th>Δ</th></tr></thead>
                    <tbody>
                      {supplierSummary.map((r) => (
                        <tr key={r.id} className="rp-clickable" onClick={() => setSupplierFilter(r.id)}>
                          <td className="rp-strong">{r.name}</td>
                          <td className="rp-num">{fmt0(r.curCount)}</td>
                          <td className="rp-num">{fmtRub(r.curTotal)}</td>
                          <td className="rp-num">{r.prevTotal > 0 ? fmtRub(r.prevTotal) : '—'}</td>
                          <td className="rp-num">
                            {r.deltaPct == null ? <span className="rp-badge" style={{ background: `${COLORS.accent}22`, color: COLORS.accent }}>новый</span> : r.prevTotal === 0 && r.curTotal === 0 ? '—' : (
                              <span className={`rp-delta ${r.deltaPct > 0 ? 'rp-delta-bad' : 'rp-delta-good'}`}>
                                {r.deltaPct > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {r.deltaPct > 0 ? '+' : ''}{r.deltaPct.toFixed(0)}%
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Section>
        ) : (
          <Section title={`История — ${supplierName(supplierFilter)}`} count={deliveryHistory.length} defaultOpen={true}>
            <button className="rp-btn-link" style={{ marginBottom: 12 }} onClick={() => setSupplierFilter('all')}>← Ко всем поставщикам</button>

            {selectedSupplierMonthly.some((r) => r.Сумма > 0) && (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={selectedSupplierMonthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v) => fmtRub(v)} />
                  <Bar dataKey="Сумма" fill={COLORS.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}

            {deliveryHistory.length === 0 ? (
              <div className="rp-muted" style={{ fontSize: 13, marginTop: 12 }}>Пока нет поставок от этого поставщика.</div>
            ) : (
              <div className="rp-table-wrap" style={{ marginTop: 12 }}>
                <table className="rp-table">
                  <thead><tr><th></th><th>Дата</th><th>Сумма</th><th>Пред. поставка</th><th>Δ к предыдущей</th><th>Δ к средней</th></tr></thead>
                  <tbody>
                    {deliveryHistory.map((d) => {
                      const avg = avgBySupplier.get(d.supplierId) || 0;
                      const avgDeltaPct = avg > 0 ? ((d.amount - avg) / avg) * 100 : null;
                      const isAnomaly = avgDeltaPct != null && Math.abs(avgDeltaPct) >= 60;
                      const isOpen = expandedDelivery === d.id;
                      return (
                        <React.Fragment key={d.id}>
                          <tr
                            style={isAnomaly ? { background: `${COLORS.accent2}11`, cursor: 'pointer' } : { cursor: 'pointer' }}
                            onClick={() => d.hasItems && setExpandedDelivery(isOpen ? null : d.id)}
                          >
                            <td style={{ width: 20 }}>{d.hasItems && (isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}</td>
                            <td>{d.date.split('-').reverse().join('.')}</td>
                            <td className="rp-num">{fmtRub(d.amount)}</td>
                            <td className="rp-num">{d.prevAmount != null ? fmtRub(d.prevAmount) : '—'}</td>
                            <td className="rp-num">
                              {d.deltaPct == null ? <span className="rp-muted">первая</span> : (
                                <span className={`rp-delta ${d.deltaPct > 0 ? 'rp-delta-bad' : 'rp-delta-good'}`}>
                                  {d.deltaPct > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {d.deltaPct > 0 ? '+' : ''}{d.deltaPct.toFixed(0)}%
                                </span>
                              )}
                            </td>
                            <td className="rp-num">
                              {avgDeltaPct == null ? '—' : (
                                <span className={isAnomaly ? 'rp-delta rp-delta-bad' : 'rp-muted'} style={isAnomaly ? {} : { fontSize: 12 }}>
                                  {isAnomaly && <AlertTriangle size={12} style={{ verticalAlign: -2, marginRight: 2 }} />}
                                  {avgDeltaPct > 0 ? '+' : ''}{avgDeltaPct.toFixed(0)}%
                                </span>
                              )}
                            </td>
                          </tr>
                          {isOpen && d.hasItems && (
                            <tr>
                              <td colSpan={6} style={{ padding: 0, background: COLORS.bg }}>
                                <table className="rp-table" style={{ margin: '4px 0 8px 24px', width: 'calc(100% - 24px)' }}>
                                  <thead><tr><th>Товар</th><th>Кол-во</th><th>Сумма</th></tr></thead>
                                  <tbody>
                                    {d.items.map((it, j) => (
                                      <tr key={j}><td>{it.name}</td><td className="rp-num">{it.qty}{it.unit ? ` ${it.unit}` : ''}</td><td className="rp-num">{fmtRub(it.sum)}</td></tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                <p className="rp-muted" style={{fontSize:11, marginTop:8}}>Клик по строке — показать/скрыть состав поставки (доступно, если поставка пришла из iiko-синхронизации; у поставок, добавленных вручную, состава нет).</p>
              </div>
            )}
          </Section>
        )}

        <Section title="Топ закупок в этом месяце" count={topThisMonth.length} defaultOpen={true}>
          {topThisMonth.length === 0 ? (
            <div className="rp-muted" style={{ fontSize: 13 }}>Нет данных за этот месяц.</div>
          ) : (
            <div className="rp-table-wrap">
              <table className="rp-table">
                <thead><tr><th>Товар</th><th>Поставщик(и)</th><th>Кол-во</th><th>Сумма</th></tr></thead>
                <tbody>
                  {topThisMonth.slice(0, 30).map((r) => (
                    <tr key={r.key} className="rp-clickable" onClick={() => setSelectedProduct(r.key)}>
                      <td className="rp-strong">{r.name}</td>
                      <td className="rp-muted" style={{ fontSize: 12 }}>{[...r.suppliers].join(', ')}</td>
                      <td className="rp-num">{fmtQty(r.qty, r.unit)}</td>
                      <td className="rp-num">{fmtRub(r.sum)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {topThisMonth.length > 30 && <div className="rp-muted" style={{ fontSize: 12, marginTop: 8 }}>И ещё {topThisMonth.length - 30} позиций — см. «Все товары» ниже.</div>}
            </div>
          )}
        </Section>

        {hasComparison && (growing.length > 0 || declining.length > 0) && (
          <Section title="Заметные изменения к прошлому месяцу" defaultOpen={true}>
            {(growing.length > 0 || declining.length > 0) && (
              <p className="rp-muted" style={{ fontSize: 12, marginBottom: 14 }}>
                💡 Суммарно рост закупок «съел» примерно <b style={{color: COLORS.danger}}>{fmtRub(growingImpactTotal)}</b>, а снижение сэкономило около <b style={{color: COLORS.accent}}>{fmtRub(Math.abs(decliningImpactTotal))}</b> — чистый эффект: <b>{fmtRub(growingImpactTotal + decliningImpactTotal)}</b>. Отсортировано по реальному влиянию на бюджет, а не по проценту — так крупные позиции не теряются за громкими процентами у мелких.
              </p>
            )}
            <div className="rp-grid-2">
              <div>
                <div className="rp-muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: COLORS.danger }}>Закупаем больше</div>
                {growing.length === 0 ? <div className="rp-muted" style={{ fontSize: 13 }}>Заметного роста нет.</div> : (
                  <div className="rp-list">
                    {growing.map((r) => (
                      <div key={r.key} className="rp-list-row rp-clickable" onClick={() => setSelectedProduct(r.key)}>
                        <div className="rp-list-main">
                          <div className="rp-list-cat">{r.name}</div>
                          <div className="rp-muted" style={{ fontSize: 11 }}>{fmtQty(r.prevQty, r.unit)} → {fmtQty(r.curQty, r.unit)} · {r.suppliers.join(', ')}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <DeltaBadge pct={r.deltaPct} />
                          <div className="rp-muted" style={{ fontSize: 11 }}>+{fmtRub(r.impact)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="rp-muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: COLORS.accent }}>Закупаем меньше</div>
                {declining.length === 0 ? <div className="rp-muted" style={{ fontSize: 13 }}>Заметного падения нет.</div> : (
                  <div className="rp-list">
                    {declining.map((r) => (
                      <div key={r.key} className="rp-list-row rp-clickable" onClick={() => setSelectedProduct(r.key)}>
                        <div className="rp-list-main">
                          <div className="rp-list-cat">{r.name}</div>
                          <div className="rp-muted" style={{ fontSize: 11 }}>{fmtQty(r.prevQty, r.unit)} → {fmtQty(r.curQty, r.unit)} · {r.suppliers.join(', ')}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <DeltaBadge pct={r.deltaPct} />
                          <div className="rp-muted" style={{ fontSize: 11 }}>{fmtRub(r.impact)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Section>
        )}

        {hasComparison && (newProducts.length > 0 || droppedProducts.length > 0) && (
          <Section title="Новое и переставшее заказываться" count={newProducts.length + droppedProducts.length} defaultOpen={false}>
            <p className="rp-muted" style={{ fontSize: 12, marginBottom: 14 }}>
              💡 Новые позиции добавили к закупкам <b>{fmtRub(newProductsTotal)}</b>; то, что перестали заказывать, раньше стоило <b>{fmtRub(droppedProductsTotal)}</b> в месяц — возможно, стоит уточнить, забыли позицию или сознательно от неё отказались.
            </p>
            <div className="rp-grid-2">
              <div>
                <div className="rp-muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Новые позиции ({newProducts.length})</div>
                <div className="rp-list">
                  {newProducts.slice(0, 25).map((r) => (
                    <div key={r.key} className="rp-list-row rp-clickable" onClick={() => setSelectedProduct(r.key)}>
                      <div className="rp-list-main"><div className="rp-list-cat">{r.name}</div><div className="rp-muted" style={{ fontSize: 11 }}>{r.suppliers.join(', ')}</div></div>
                      <div style={{ textAlign: 'right' }}><div className="rp-list-amount">{fmtQty(r.curQty, r.unit)}</div><div className="rp-muted" style={{ fontSize: 11 }}>{fmtRub(r.curSum)}</div></div>
                    </div>
                  ))}
                  {newProducts.length > 25 && <div className="rp-muted" style={{ fontSize: 11 }}>И ещё {newProducts.length - 25}…</div>}
                  {newProducts.length === 0 && <div className="rp-muted" style={{ fontSize: 13 }}>Нет.</div>}
                </div>
              </div>
              <div>
                <div className="rp-muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Перестали заказывать ({droppedProducts.length})</div>
                <div className="rp-list">
                  {droppedProducts.slice(0, 25).map((r) => (
                    <div key={r.key} className="rp-list-row rp-clickable" onClick={() => setSelectedProduct(r.key)}>
                      <div className="rp-list-main"><div className="rp-list-cat">{r.name}</div><div className="rp-muted" style={{ fontSize: 11 }}>{r.suppliers.join(', ')}</div></div>
                      <div style={{ textAlign: 'right' }}><div className="rp-list-amount">было {fmtQty(r.prevQty, r.unit)}</div><div className="rp-muted" style={{ fontSize: 11 }}>{fmtRub(r.prevSum)}</div></div>
                    </div>
                  ))}
                  {droppedProducts.length > 25 && <div className="rp-muted" style={{ fontSize: 11 }}>И ещё {droppedProducts.length - 25}…</div>}
                  {droppedProducts.length === 0 && <div className="rp-muted" style={{ fontSize: 13 }}>Нет.</div>}
                </div>
              </div>
            </div>
          </Section>
        )}

        {supplierTrendData.length > 0 && topSuppliersThisMonth.length > 0 && (
          <Section title="Траты по поставщикам — последние 6 месяцев" defaultOpen={false}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={supplierTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => fmtRub(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {topSuppliersThisMonth.map((id, i) => (
                  <Line key={id} type="monotone" dataKey={supplierName(id)} stroke={COLORS.chartPalette[i % COLORS.chartPalette.length]} strokeWidth={2} dot={{ r: 3 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Section>
        )}

        {comparisonRows.length > 0 && (
          <Section title="Все товары" count={comparisonRows.length} defaultOpen={false}>
            <div className="rp-table-wrap">
              <table className="rp-table">
                <thead><tr><th>Товар</th><th>Поставщик(и)</th><th>Этот месяц</th><th>Прошлый месяц</th><th>Δ</th><th>Сумма (этот мес.)</th></tr></thead>
                <tbody>
                  {comparisonRows.map((r) => (
                    <tr key={r.key} className="rp-clickable" onClick={() => setSelectedProduct(r.key)}>
                      <td className="rp-strong">{r.name}</td>
                      <td className="rp-muted" style={{ fontSize: 12 }}>{r.suppliers.join(', ')}</td>
                      <td className="rp-num">{fmtQty(r.curQty, r.unit)}</td>
                      <td className="rp-num">{fmtQty(r.prevQty, r.unit)}</td>
                      <td className="rp-num">{hasComparison ? <DeltaBadge pct={r.deltaPct} /> : '—'}</td>
                      <td className="rp-num">{fmtRub(r.curSum)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </Card>

      {selectedProduct && (
        <Card style={{ marginTop: 16 }}>
          <div className="rp-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>«{selectedProductName}» — по каждой поставке</span>
            <button className="rp-icon-btn" onClick={() => setSelectedProduct(null)}><X size={16} /></button>
          </div>
          {productTimeline.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={productTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d?.slice(5).split('-').reverse().join('.')} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={(d) => d?.split('-').reverse().join('.')} formatter={(v, n) => n === 'qty' ? [`${v} ${productTimeline[0]?.unit || ''}`, 'Количество'] : v} />
                  <Line type="monotone" dataKey="qty" stroke={COLORS.accent2} strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
              <div className="rp-table-wrap" style={{ marginTop: 12 }}>
                <table className="rp-table">
                  <thead><tr><th>Дата</th><th>Поставщик</th><th>Кол-во</th><th>Сумма</th></tr></thead>
                  <tbody>
                    {productTimeline.slice().reverse().map((p, i) => (
                      <tr key={i}><td>{p.date}</td><td>{p.supplier}</td><td className="rp-num">{fmtQty(p.qty, p.unit)}</td><td className="rp-num">{fmtRub(p.sum)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : <div className="rp-muted">Нет данных по этому товару.</div>}
        </Card>
      )}
    </div>
  );
}


/* ============================== AI-помощник ============================== */

async function buildAiContext(ctx, session) {
  const { pnl, prevPnl, year, monthIdx, months, suppliers } = ctx;
  const prevDateObj = new Date(year, monthIdx - 1, 1);
  const monthLabel = `${MONTHS_RU[monthIdx]} ${year}`;
  const prevMonthLabel = `${MONTHS_RU[prevDateObj.getMonth()]} ${prevDateObj.getFullYear()}`;

  const productsFor = (mk) => {
    const bucket = new Map();
    for (const o of (months[mk]?.supplierOrders || [])) {
      for (const it of (o.items || [])) {
        const k = String(it.name || '').trim().toLowerCase();
        if (!k) continue;
        if (!bucket.has(k)) bucket.set(k, { name: it.name, unit: it.unit || '', qty: 0, sum: 0 });
        const e = bucket.get(k);
        e.qty += Number(it.qty) || 0;
        e.sum += Number(it.sum) || 0;
      }
    }
    return bucket;
  };
  const curP = productsFor(pnl.key);
  const prevP = productsFor(prevPnl.key);
  const movers = [];
  for (const [k, cur] of curP) {
    const prev = prevP.get(k);
    if (prev && prev.qty > 0 && cur.qty > 0) {
      const deltaPct = ((cur.qty - prev.qty) / prev.qty) * 100;
      if (Math.abs(deltaPct) > 15) {
        movers.push({
          name: cur.name, unit: cur.unit,
          prevQty: Math.round(prev.qty * 100) / 100, curQty: Math.round(cur.qty * 100) / 100,
          deltaPct: Math.round(deltaPct), impactRub: Math.round(cur.sum - prev.sum)
        });
      }
    }
  }
  movers.sort((a, b) => Math.abs(b.impactRub) - Math.abs(a.impactRub));

  const supplierTotals = (mk) => {
    const totals = new Map(); // id -> {sum, count}
    for (const o of (months[mk]?.supplierOrders || [])) {
      const cur = totals.get(o.supplierId) || { sum: 0, count: 0 };
      cur.sum += Number(o.amount) || 0;
      cur.count += 1;
      totals.set(o.supplierId, cur);
    }
    return [...totals.entries()]
      .map(([id, { sum, count }]) => ({ name: suppliers.find((s) => s.id === id)?.name || '—', sumRub: Math.round(sum), количествоНакладных: count }))
      .sort((a, b) => b.sumRub - a.sumRub);
  };
  const totalInvoiceCount = (mk) => (months[mk]?.supplierOrders || []).length;

  // Реальная выручка ресторана — из iiko (касса/продажи), а НЕ из ручного раздела
  // «Кассовая смена (день)» (тот часто пустой или не совпадает с кассой). Это два
  // независимых источника в приложении — для AI-контекста используем именно iiko,
  // так как это то, что человек имеет в виду под «выручкой» в первую очередь.
  let iikoRevenue = { этотМесяц: null, прошлыйМесяц: null, ошибка: null };
  try {
    const from = dateStr(year, monthIdx, 1);
    const to = dateStr(year, monthIdx, daysInMonth(year, monthIdx));
    const pFrom = dateStr(prevDateObj.getFullYear(), prevDateObj.getMonth(), 1);
    const pTo = dateStr(prevDateObj.getFullYear(), prevDateObj.getMonth(), daysInMonth(prevDateObj.getFullYear(), prevDateObj.getMonth()));
    const headers = { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) };
    const [curResp, prevResp] = await Promise.all([
      fetch('/api/iiko-dashboard', { method: 'POST', headers, body: JSON.stringify({ from, to }) }),
      fetch('/api/iiko-dashboard', { method: 'POST', headers, body: JSON.stringify({ from: pFrom, to: pTo }) })
    ]);
    const [curData, prevData] = await Promise.all([curResp.json(), prevResp.json()]);
    if (curResp.ok) {
      iikoRevenue.этотМесяц = Math.round(curData.grandTotal);
      iikoRevenue.поДнямЭтотМесяц = (curData.days || []).map((d) => ({ дата: d.date, выручка: Math.round(d.total * 100) / 100 }));
    }
    if (prevResp.ok) iikoRevenue.прошлыйМесяц = Math.round(prevData.grandTotal);
    if (!curResp.ok) iikoRevenue.ошибка = curData?.error || 'Не удалось получить выручку из iiko за текущий месяц.';
  } catch (e) {
    iikoRevenue.ошибка = 'Не удалось связаться с iiko: ' + (e?.message || 'неизвестная ошибка');
  }

  return {
    месяц: monthLabel,
    предыдущийМесяц: prevMonthLabel,
    выручкаИзKассыIiko_ЭТОРЕАЛЬНАЯВЫРУЧКА: iikoRevenue,
    прибыльПоРучномуУчётуРасходов: { этотМесяц: Math.round(pnl.profit), прошлыйМесяц: Math.round(prevPnl.profit) },
    примечаниеПроПрибыльИМаржу: 'Прибыль и маржа посчитаны в приложении на основе ручного ввода выручки в разделе «Кассовая смена (день)», который отдельный от кассы iiko и часто не заполняется — если он пустой, прибыль/маржа ниже будут некорректны. Для реальной выручки используй поле выручкаИзKассыIiko_ЭТОРЕАЛЬНАЯВЫРУЧКА.',
    выручкаПоРучномуУчётуОбычноНеЗаполнена: { этотМесяц: Math.round(pnl.revenue), прошлыйМесяц: Math.round(prevPnl.revenue) },
    маржаПроцентПоРучномуУчёту: { этотМесяц: Math.round(pnl.margin * 10) / 10, прошлыйМесяц: Math.round(prevPnl.margin * 10) / 10 },
    фудКостПроцентПоРучномуУчёту: { этотМесяц: Math.round(pnl.foodCostPct * 10) / 10, прошлыйМесяц: Math.round(prevPnl.foodCostPct * 10) / 10 },
    зарплатыПроцентОтВыручкиПоРучномуУчёту: { этотМесяц: Math.round(pnl.laborCostPct * 10) / 10, прошлыйМесяц: Math.round(prevPnl.laborCostPct * 10) / 10 },
    расходыЗаМесяцРуб: {
      кухня: Math.round(pnl.kitchen.total),
      закупкиУПоставщиков: Math.round(pnl.supplierOrd.total),
      фондОплатыТруда: Math.round(pnl.payroll.totalFot),
      постоянные: Math.round(pnl.fixedTotal),
      эквайринг: Math.round(pnl.acquiring.amount),
    },
    всегоНакладныхЗаЭтотМесяц: totalInvoiceCount(pnl.key),
    топПоставщиковЗаЭтотМесяц: supplierTotals(pnl.key).slice(0, 8),
    заметныеИзмененияЗакупокТоваров: movers.slice(0, 12),
  };
}

function AiAssistantPage({ ctx }) {
  const { pnl, month, updateMonth, session, year, monthIdx } = ctx;
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  const cachedSummary = month.aiSummary;
  const cachedSummaryDate = month.aiSummaryGeneratedAt;

  const generateSummary = async () => {
    setSummaryLoading(true); setSummaryError('');
    try {
      const context = await buildAiContext(ctx, session);
      const resp = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ mode: 'summary', context })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Не удалось получить ответ.');
      updateMonth((m) => ({ ...m, aiSummary: data.answer, aiSummaryGeneratedAt: new Date().toISOString() }));
    } catch (e) {
      setSummaryError(e.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  return (
    <div className="rp-page">
      <div className="rp-page-head">
        <h1>AI-помощник</h1>
        <div className="rp-page-sub">Отвечает на основе цифр за {MONTHS_RU[monthIdx]} {year} — ничего не выдумывает сверх того, что посчитано в приложении. Задать вопрос можно с любой страницы — кнопка со звёздочкой в правом нижнем углу.</div>
      </div>

      <Card>
        <div className="rp-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><Sparkles size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Сводка месяца</span>
          <button className="rp-btn rp-btn-ghost" onClick={generateSummary} disabled={summaryLoading}>
            <RefreshCw size={14} className={summaryLoading ? 'rp-spin' : ''} /> {summaryLoading ? 'Пишу…' : cachedSummary ? 'Обновить' : 'Сгенерировать'}
          </button>
        </div>
        {summaryError && <div className="rp-inline-warn" style={{ marginTop: 10 }}><AlertTriangle size={13} /> {summaryError}</div>}
        {cachedSummary ? (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 12, whiteSpace: 'pre-wrap' }}>{cachedSummary}</p>
            {cachedSummaryDate && <div className="rp-muted" style={{ fontSize: 11, marginTop: 8 }}>Сгенерировано {new Date(cachedSummaryDate).toLocaleString('ru-RU')}</div>}
          </>
        ) : (
          !summaryLoading && <div className="rp-muted" style={{ fontSize: 13, marginTop: 10 }}>Сводки за этот месяц ещё нет — нажмите «Сгенерировать».</div>
        )}
      </Card>
    </div>
  );
}

// Плавающий чат-виджет — доступен на любой странице приложения (рендерится один раз в
// корне App, поэтому переписка не сбрасывается при переходах между страницами, только
// при полной перезагрузке вкладки). Контекст (P&L, закупки) всегда актуален для
// текущего выбранного вверху месяца, независимо от того, какая страница открыта.
function AiChatWidget({ ctx }) {
  const { session } = ctx;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => { if (open) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, chatLoading, open]);

  const sendQuestion = async () => {
    const q = input.trim();
    if (!q || chatLoading) return;
    setInput(''); setChatError('');
    const historyForRequest = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setChatLoading(true);
    try {
      const context = await buildAiContext(ctx, session);
      const resp = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ mode: 'chat', question: q, context, history: historyForRequest })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Не удалось получить ответ.');
      setMessages((prev) => [...prev, { role: 'assistant', content: data.answer }]);
    } catch (e) {
      setChatError(e.message);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <>
      <button className="rp-ai-fab" onClick={() => setOpen((o) => !o)} aria-label="AI-помощник" title="AI-помощник">
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      {open && (
        <div className="rp-ai-panel">
          <div className="rp-ai-panel-head">
            <span><Sparkles size={15} style={{ verticalAlign: -2, marginRight: 6 }} />AI-помощник</span>
            <button className="rp-icon-btn" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <div className="rp-ai-panel-body">
            {messages.length === 0 && (
              <div className="rp-muted" style={{ fontSize: 13 }}>
                Например: «Сколько мы потратили на закупки в этом месяце?», «Какая маржа по сравнению с прошлым месяцем?», «Что подорожало сильнее всего?»
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div className={`rp-ai-bubble ${m.role === 'user' ? 'rp-ai-bubble-user' : 'rp-ai-bubble-assistant'}`}>{m.content}</div>
              </div>
            ))}
            {chatLoading && <div className="rp-muted" style={{ fontSize: 13 }}>Думаю…</div>}
            <div ref={chatEndRef} />
          </div>
          {chatError && <div className="rp-inline-warn" style={{ margin: '0 14px 10px' }}><AlertTriangle size={13} /> {chatError}</div>}
          <div className="rp-ai-panel-input">
            <input
              placeholder="Спросите что-нибудь…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(); } }}
            />
            <button className="rp-btn" onClick={sendQuestion} disabled={chatLoading || !input.trim()}><Send size={15} /></button>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================== P&L ============================== */

function PnLPage({ ctx }) {
  const { pnl, year, monthIdx, month, updateMonth, logAudit } = ctx;
  const [drill, setDrill] = useState(null);
  const [newName, setNewName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newGroup, setNewGroup] = useState('fixed');
  const locked = month.closed;

  const Row = ({ label, value, pctOf = pnl.revenue, bold, onClick, indent }) => (
    <div className={`rp-pnl-row ${bold ? 'bold' : ''} ${onClick ? 'rp-clickable' : ''}`} style={indent ? { paddingLeft: 20 } : {}} onClick={onClick}>
      <span>{label}</span>
      <span className="rp-num">{fmtRub(value)}</span>
      <span className="rp-num rp-muted-sm">{pctOf ? fmtPct((value / pctOf) * 100) : '—'}</span>
    </div>
  );

  const removeExpenseItem = (id) => {
    const item = (month.monthExpenses || []).find(f => f.id === id);
    updateMonth(m => ({ ...m, monthExpenses: (m.monthExpenses || []).filter(f => f.id !== id) }));
    logAudit({ what: `Удалена статья постоянных расходов «${item?.name || ''}» из P&L месяца`, date: dateStr(year, monthIdx, 1) });
  };

  const renameExpenseItem = (id, patch) => {
    updateMonth(m => ({ ...m, monthExpenses: (m.monthExpenses || []).map(f => f.id === id ? { ...f, ...patch } : f) }));
  };

  const addExpenseItem = () => {
    if (!newName.trim()) return;
    updateMonth(m => ({ ...m, monthExpenses: [...(m.monthExpenses || []), { id: uid(), name: newName.trim(), amount: Number(newAmount) || 0, group: newGroup, paymentMethod: 'cashless' }] }));
    logAudit({ what: `Добавлена статья постоянных расходов «${newName.trim()}» в P&L месяца`, date: dateStr(year, monthIdx, 1) });
    setNewName(''); setNewAmount('');
  };

  const EditableFixedRow = (f) => (
    <div className="rp-pnl-row" style={{ paddingLeft: 20, gap: 8 }} key={f.id}>
      <input className="rp-inline-input" defaultValue={f.name} disabled={locked} onBlur={(e) => e.target.value !== f.name && renameExpenseItem(f.id, { name: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
      <input className="rp-inline-input rp-num" type="number" defaultValue={f.amount} disabled={locked} onBlur={(e) => Number(e.target.value) !== f.amount && renameExpenseItem(f.id, { amount: Number(e.target.value) })} style={{ width: 100 }} />
      {!locked && <button className="rp-icon-btn rp-icon-btn-danger" onClick={() => removeExpenseItem(f.id)} title="Удалить эту статью из текущего месяца"><Trash2 size={13} /></button>}
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

        <div className="rp-pnl-section-title">Постоянные расходы {locked && <span className="rp-muted-sm">(месяц закрыт — только просмотр)</span>}</div>
        {pnl.fixedItems.map(EditableFixedRow)}
        {pnl.otherFixed.map(EditableFixedRow)}
        <Row label="Итого постоянные" value={pnl.fixedTotal} bold />
        {!locked && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingLeft: 20, marginTop: 8, flexWrap: 'wrap' }}>
            <input className="rp-inline-input" placeholder="Название статьи" value={newName} onChange={e => setNewName(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
            <input className="rp-inline-input rp-num" type="number" placeholder="Сумма" value={newAmount} onChange={e => setNewAmount(e.target.value)} style={{ width: 100 }} />
            <select value={newGroup} onChange={e => setNewGroup(e.target.value)}><option value="fixed">Постоянный</option><option value="fot_tax">Налог на ФОТ</option></select>
            <button className="rp-btn rp-btn-sm" onClick={addExpenseItem}><Plus size={13} /> Добавить в этот месяц</button>
          </div>
        )}
        <p className="rp-muted" style={{ fontSize: 11, marginTop: 8, paddingLeft: 20 }}>
          Изменения здесь касаются только {MONTHS_RU[monthIdx].toLowerCase()}а {year}. Следующий месяц, когда будет создан, унаследует этот же список — если статья больше не нужна нигде, уберите её и в «Настройки → Постоянные статьи», чтобы она не попала и в будущие месяцы.
        </p>

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
          <div className="rp-table-wrap"><table className="rp-table"><thead><tr><th>Канал</th><th>Сумма</th></tr></thead>
            <tbody>{Object.entries(pnl.acquiring.byChannel).map(([k, v]) => <tr key={k}><td>{k}</td><td className="rp-num">{fmtRub(v)}</td></tr>)}</tbody>
          </table></div>
          <div className="rp-day-total">База для эквайринга: <b>{fmtRub(pnl.acquiring.base)}</b> → комиссия <b>{fmtRub(pnl.acquiring.amount)}</b></div>
        </div>
      ) : (
        <div className="rp-table-wrap"><table className="rp-table">
          <thead><tr>{c.cols.map((col) => <th key={col}>{colLabel[col]}</th>)}</tr></thead>
          <tbody>
            {(c.items || []).length === 0 && <tr><td colSpan={c.cols.length}><EmptyState icon={<Info size={22} color={COLORS.inkSoft} />} title="Нет операций" /></td></tr>}
            {(c.items || []).map((it, i) => (
              <tr key={i}>{c.cols.map((col) => <td key={col} className={['amount', 'pay', 'base', 'bonus', 'accrued', 'hours', 'deliveries', 'km', 'fuel'].includes(col) ? 'rp-num' : ''}>{['amount', 'pay', 'base', 'bonus', 'accrued', 'fuel'].includes(col) ? fmtRub(it[col]) : (it[col] ?? '—')}</td>)}</tr>
            ))}
          </tbody>
        </table></div>
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
        <button className={tab === 'integrations' ? 'active' : ''} onClick={() => setTab('integrations')}>Интеграции</button>
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
      {tab === 'integrations' && <IikoIntegrationPanel ctx={ctx} />}
    </div>
  );
}

function IikoIntegrationPanel({ ctx }) {
  const { session } = ctx;
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuResult, setMenuResult] = useState(null);
  const [menuError, setMenuError] = useState('');

  const testConnection = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const resp = await fetch('/api/iiko-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ date })
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data?.error || 'Не удалось подключиться.'); if (data?.raw) setResult(data); return; }
      setResult(data);
    } catch (e) {
      setError(e?.message || 'Не удалось связаться с сервером.');
    } finally {
      setLoading(false);
    }
  };

  const loadMenu = async () => {
    setMenuLoading(true); setMenuError(''); setMenuResult(null);
    try {
      const resp = await fetch('/api/iiko-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({})
      });
      const data = await resp.json();
      if (!resp.ok) { setMenuError(data?.error || 'Не удалось прочитать меню.'); if (data?.raw) setMenuResult(data); return; }
      setMenuResult(data);
    } catch (e) {
      setMenuError(e?.message || 'Не удалось связаться с сервером.');
    } finally {
      setMenuLoading(false);
    }
  };

  return (
    <>
    <Card>
      <div className="rp-card-title">Синхронизация с iiko</div>
      <p className="rp-muted" style={{marginBottom:14}}>
        Тестовое подключение к вашему серверу iikoRMS/iikoOffice. Сначала нужно настроить переменные окружения
        на Vercel: <b>IIKO_SERVER_URL</b> (адрес сервера), <b>IIKO_API_LOGIN</b> и <b>IIKO_API_PASSWORD</b> (отдельный
        технический пользователь iiko с правами только на чтение отчётов — не ваш личный логин).
        Эта кнопка не применяет ничего в P&L, только проверяет связь и показывает, какие данные вообще доступны.
      </p>
      <div style={{display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap'}}>
        <Field label="Дата для проверки"><input type="date" value={date} onChange={e=>setDate(e.target.value)} /></Field>
        <button className="rp-btn" onClick={testConnection} disabled={loading}>{loading ? 'Подключаюсь…' : 'Проверить подключение'}</button>
      </div>
      {error && <div className="rp-inline-warn" style={{marginTop:12}}><AlertTriangle size={13}/> {error}</div>}
      {result && (
        <div style={{marginTop:14}}>
          <div className="rp-cash-check" style={{marginBottom:10}}><Info size={13}/> Подключение к iiko работает. Ниже — сырой ответ сервера, пришлите его мне, чтобы настроить точный маппинг на каналы выручки.</div>
          <pre style={{background:'#F4F3EF', border:'1px solid '+COLORS.line, borderRadius:10, padding:14, fontSize:11, overflow:'auto', maxHeight:400}}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </Card>
    <Card style={{marginTop:16}}>
      <div className="rp-card-title">Меню из iiko (только чтение)</div>
      <p className="rp-muted" style={{marginBottom:14}}>
        Первый шаг к управлению меню из приложения — показать текущие позиции. Пока ничего не редактирует,
        только читает. Как увидим реальную структуру ваших блюд/категорий — добавим редактирование цен,
        добавление и удаление позиций отдельным шагом.
      </p>
      <button className="rp-btn" onClick={loadMenu} disabled={menuLoading}>{menuLoading ? 'Загружаю…' : 'Показать меню'}</button>
      {menuError && <div className="rp-inline-warn" style={{marginTop:12}}><AlertTriangle size={13}/> {menuError}</div>}
      {menuResult && (
        <div style={{marginTop:14}}>
          <div className="rp-cash-check" style={{marginBottom:10}}><Info size={13}/> {menuResult.totalCount != null ? `Всего позиций: ${menuResult.totalCount}. ` : ''}Показаны первые записи — пришлите этот ответ, чтобы настроить редактирование.</div>
          <pre style={{background:'#F4F3EF', border:'1px solid '+COLORS.line, borderRadius:10, padding:14, fontSize:11, overflow:'auto', maxHeight:400}}>{JSON.stringify(menuResult, null, 2)}</pre>
        </div>
      )}
    </Card>
    </>
  );
}

function BackupPanel({ ctx }) {
  const { settings, employees, suppliers, months, auditLog, setSettings, setEmployees, setSuppliers, setMonths, setAuditLog, logAudit } = ctx;
  const fileInputRef = useRef(null);
  const [pendingImport, setPendingImport] = useState(null);
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
        Все данные (сотрудники, поставщики, настройки, {monthCount} {monthCount === 1 ? 'месяц' : 'месяцев'} и журнал истории) хранятся в общей облачной базе Supabase.
        Локальная копия полезна как дополнительная страховка (например, перед крупными правками) — скачайте её на всякий случай.
      </p>
      <div className="rp-toolbar" style={{ marginTop: 12 }}>
        <button className="rp-btn" onClick={downloadBackup}><DatabaseBackup size={15} /> Скачать резервную копию (.json)</button>
        <button className="rp-btn rp-btn-ghost" onClick={() => fileInputRef.current?.click()}><UploadCloud size={15} /> Восстановить из копии</button>
        <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={onFilePicked} />
      </div>
      {error && <div className="rp-export-error" style={{ marginTop: 8 }}>{error}</div>}

      <div className="rp-divider-line" />
      <div className="rp-card-title" style={{ color: COLORS.danger }}>Опасная зона</div>
      <p className="rp-muted">Полностью очистить облачную базу (сотрудники, поставщики, все месяцы). Действие необратимо без резервной копии.</p>
      <button className="rp-btn" style={{ background: COLORS.danger }} onClick={() => setConfirmReset(true)}><Trash2 size={15} /> Очистить всю базу</button>

      {pendingImport && (
        <ConfirmDialog
          title="Восстановить из резервной копии?"
          message={`Текущие данные будут полностью заменены содержимым файла${pendingImport.exportedAt ? ' (копия от ' + new Date(pendingImport.exportedAt).toLocaleString('ru-RU') + ')' : ''}. Это необратимо — если текущие данные важны, сначала скачайте их резервную копию.`}
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
      <div className="rp-table-wrap"><table className="rp-table">
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
      </table></div>
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
  const { auditLog, applyRevert } = ctx;
  const [search, setSearch] = useState('');
  const [justReverted, setJustReverted] = useState(null);

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

  const handleRevert = (e) => {
    applyRevert(e);
    setJustReverted(e.id);
    setTimeout(() => setJustReverted((cur) => (cur === e.id ? null : cur)), 2500);
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
                {e.revert && (
                  <button className="rp-btn rp-btn-xs rp-btn-ghost rp-history-revert" onClick={() => handleRevert(e)}>
                    {justReverted === e.id ? <><Check size={12} /> Готово</> : <><RotateCcw size={12} /> Восстановить</>}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      <p className="rp-muted">
        Хранятся последние 500 действий. Кнопка «Восстановить» доступна для изменений выручки, курьера, промо, расходов дня,
        корректировок сотрудника и переименований поставщика — она возвращает предыдущее значение и сама становится обратимой.
        Для остальных изменений (настройки, добавление/удаление сущностей) откатывайте через резервную копию в Настройках.
      </p>
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
        <div className="rp-table-wrap"><table className="rp-table">
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
        </table></div>
      </Card>
    </div>
  );
}
/* ============================== IIKO DASHBOARD ============================== */

function IikoDashboardPage({ ctx }) {
  const { settings, session, year, monthIdx } = ctx;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cashData, setCashData] = useState(null);
  const [cashError, setCashError] = useState('');
  const [dayDate, setDayDate] = useState(new Date().toISOString().slice(0, 10));
  const [dayReport, setDayReport] = useState(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState('');
  const [expandedChecks, setExpandedChecks] = useState(() => new Set());
  const toggleCheck = (key) => setExpandedChecks(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });

  const monthFrom = dateStr(year, monthIdx, 1);
  const monthTo = dateStr(year, monthIdx, daysInMonth(year, monthIdx));

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const resp = await fetch('/api/iiko-dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ from: monthFrom, to: monthTo })
      });
      const json = await resp.json();
      if (!resp.ok) { setError(json?.error || 'Не удалось получить данные из iiko.'); setData(null); return; }
      setData(json);
    } catch (e) {
      setError(e?.message || 'Не удалось связаться с сервером.');
    } finally {
      setLoading(false);
    }
  }, [monthFrom, monthTo, session]);

  useEffect(() => { load(); }, [load]);

  const loadCash = useCallback(async () => {
    setCashError('');
    try {
      const resp = await fetch('/api/iiko-cashshifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ from: monthFrom, to: monthTo })
      });
      const json = await resp.json();
      if (!resp.ok) { setCashError(json?.error || 'Не удалось получить данные по кассовым сменам.'); setCashData(null); return; }
      setCashData(json);
    } catch (e) {
      setCashError(e?.message || 'Не удалось связаться с сервером.');
    }
  }, [monthFrom, monthTo, session]);

  useEffect(() => { loadCash(); }, [loadCash]);

  const loadDayReport = useCallback(async () => {
    setDayLoading(true); setDayError(''); setDayReport(null);
    try {
      const resp = await fetch('/api/iiko-day-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ date: dayDate })
      });
      const json = await resp.json();
      if (!resp.ok) { setDayError(json?.error || 'Не удалось получить отчёт за день.'); return; }
      setDayReport(json);
    } catch (e) {
      setDayError(e?.message || 'Не удалось связаться с сервером.');
    } finally {
      setDayLoading(false);
    }
  }, [dayDate, session]);

  // Автозагрузка отчёта при выборе даты — без отдельной кнопки. Небольшая задержка,
  // чтобы не слать запрос на каждую промежуточную дату при печати вручную в поле.
  useEffect(() => {
    if (!dayDate) return;
    const t = setTimeout(() => { loadDayReport(); }, 300);
    return () => clearTimeout(t);
  }, [dayDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const dailySeries = (data?.days || []).map(d => ({ day: Number(d.date.slice(8, 10)), Выручка: d.total }));
  const payTypeData = Object.entries(data?.totalsByPayType || {}).map(([name, value]) => ({ name, value }));

  return (
    <div className="rp-page">
      <div className="rp-page-head">
        <h1><Radio size={20} style={{verticalAlign:'-3px', marginRight:8}}/>Отчёт Новошахтинск</h1>
        <div className="rp-page-sub">{MONTHS_RU[monthIdx]} {year} · данные напрямую с кассы iiko, для сверки — в P&L не входят</div>
      </div>

      <div className="rp-alert rp-alert-info" style={{marginBottom:16}}>
        <Info size={16}/> Это отдельная витрина данных из iiko. Она никак не связана с тем, что вы вносите вручную в «Кассовая смена (день)» —
        цифры здесь никогда не попадают в P&L автоматически. Если хотите перенести что-то отсюда в отчёт — сделайте это вручную на странице «Кассовая смена (день)».
      </div>

      <Card style={{marginBottom:16}}>
        <div className="rp-card-title">Полный отчёт за день</div>
        <div className="rp-muted" style={{marginBottom:12}}>Как при закрытии смены: выручка по оплатам, скидки, удаления, топ проданных блюд, внесения/изъятия.</div>
        <div style={{display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap'}}>
          <Field label="Дата"><input type="date" value={dayDate} onChange={e=>setDayDate(e.target.value)} /></Field>
          {dayLoading && <span className="rp-muted" style={{fontSize:13, paddingBottom:9}}>Загружаю…</span>}
        </div>
        {dayError && <div className="rp-inline-warn" style={{marginTop:12}}><AlertTriangle size={13}/> {dayError}</div>}

        {dayReport && (
          <div>
            <div className="rp-grid-4" style={{marginTop:20}}>
              <Stat label="Выручка" value={fmtRub(dayReport.revenue?.total)} />
              <Stat label="Чеков" value={fmt0(dayReport.revenue?.checks)} />
              <Stat label="Скидки" value={fmtRub(dayReport.discount?.total)} accent={COLORS.accent2} />
              <Stat label="Удаления" value={fmtRub(dayReport.deletions?.total)} accent={COLORS.danger} />
            </div>

            <Section title="По способам оплаты" defaultOpen={true}>
              {dayReport.revenue?.byPayType && Object.keys(dayReport.revenue.byPayType).length > 0 ? (
                <div className="rp-list">
                  {Object.entries(dayReport.revenue.byPayType).map(([name, amt]) => (
                    <div className="rp-list-row" key={name}><div className="rp-list-main"><div className="rp-list-cat">{name}</div></div><div className="rp-list-amount">{fmtRub(amt)}</div></div>
                  ))}
                </div>
              ) : <div className="rp-muted" style={{fontSize:13}}>Нет данных.</div>}
            </Section>

            <Section title="Кассовые смены" count={dayReport.cashShifts?.length ?? 0} defaultOpen={true}>
              {dayReport.cashShifts?.length > 0 ? (
                <div className="rp-list">
                  {dayReport.cashShifts.map((s,i) => (
                    <div key={i} className="rp-list-row" style={{flexDirection:'column', alignItems:'flex-start', gap:4}}>
                      <div style={{display:'flex', justifyContent:'space-between', width:'100%'}}>
                        <b>Смена №{s.sessionNumber}</b>
                        <span className="rp-muted" style={{fontSize:12}}>{s.status === 'OPEN' ? 'открыта' : 'закрыта'}</span>
                      </div>
                      <div className="rp-muted" style={{fontSize:12}}>Внесено {fmtRub(s.payIn)} · Изъято {fmtRub(s.payOut)} · Нал {fmtRub(s.salesCash)} · Карта {fmtRub(s.salesCard)}</div>
                    </div>
                  ))}
                </div>
              ) : <div className="rp-muted" style={{fontSize:13}}>Кассовых смен за этот день не найдено (или все были фантомными).</div>}
            </Section>

            {dayReport.checks?.length > 0 && (
              <Section title="Чеки за день" count={dayReport.checks.length} defaultOpen={false}>
                <div className="rp-table-wrap">
                  <table className="rp-table">
                    <thead><tr><th>Время</th><th>№ заказа</th><th>Оплата</th><th style={{textAlign:'right'}}>Сумма</th></tr></thead>
                    <tbody>
                      {dayReport.checks.map((c,i) => {
                        const key = `${c.orderNum}-${i}`;
                        const open = expandedChecks.has(key);
                        return (
                          <React.Fragment key={key}>
                            <tr onClick={() => toggleCheck(key)} style={{cursor:'pointer'}}>
                              <td>{c.time || '—'}</td>
                              <td>№{c.orderNum} {open ? <ChevronUp size={12} style={{verticalAlign:-1}}/> : <ChevronDown size={12} style={{verticalAlign:-1}}/>}</td>
                              <td className="rp-muted" style={{fontSize:12}}>{c.payType}</td>
                              <td className="rp-num" style={{fontWeight:600}}>{fmtRub(c.total)}</td>
                            </tr>
                            {open && (
                              <tr>
                                <td colSpan={4} style={{padding:0, background:COLORS.bg}}>
                                  <table className="rp-table" style={{margin:'4px 0 8px 24px', width:'calc(100% - 24px)'}}>
                                    <tbody>
                                      {c.items.map((it,j) => (
                                        <tr key={j}><td>{it.name}</td><td className="rp-num" style={{width:60}}>×{fmt0(it.qty)}</td><td className="rp-num" style={{width:100}}>{fmtRub(it.amount)}</td></tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {dayReport.topDishes?.length > 0 && (
              <Section title="Что продавалось" count={dayReport.topDishes.length} defaultOpen={false}>
                <div className="rp-table-wrap">
                  <table className="rp-table">
                    <thead><tr><th>Блюдо</th><th>Кол-во</th><th>Сумма</th></tr></thead>
                    <tbody>
                      {dayReport.topDishes.map((d,i) => (
                        <tr key={i}><td>{d.name}</td><td className="rp-num">{fmt0(d.qty)}</td><td className="rp-num">{fmtRub(d.amount)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {dayReport.deletions?.items?.length > 0 && (
              <Section title="Что удаляли" count={dayReport.deletions.items.length} defaultOpen={false}>
                <div className="rp-table-wrap">
                  <table className="rp-table">
                    <thead><tr><th>Блюдо</th><th>Кол-во</th><th>Сумма</th></tr></thead>
                    <tbody>
                      {dayReport.deletions.items.map((d,i) => (
                        <tr key={i}><td>{d.name}</td><td className="rp-num">{fmt0(d.qty)}</td><td className="rp-num">{fmtRub(d.amount)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {(dayReport.revenue?.payIncomeAdded > 0 || dayReport.secondBranch || dayReport.secondBranchRawOrders?.length > 0 || Object.keys(dayReport.errors || {}).length > 0) && (
              <Section title="Технические детали и сверка" defaultOpen={false}>
                <div style={{display:'flex', flexDirection:'column', gap:10}}>
                  {dayReport.revenue?.payIncomeAdded > 0 && (
                    <div className="rp-cash-check">
                      <Info size={13}/> В выручку дня включено внесение по заказу: <b>{fmtRub(dayReport.revenue.payIncomeAdded)}</b> — деньги, принятые отдельной кассовой операцией «Внесение наличных» (любой комментарий, кроме «дб» — начального остатка кассы, и «зп» — выплаты зарплаты), не проходят через обычную продажу и не попадают в отчёт по продажам, поэтому добавлены отдельно.
                    </div>
                  )}

                  {dayReport.secondBranch && (
                    <div className="rp-cash-check">
                      <Info size={13}/> Из выручки уже исключена сумма второго филиала: <b>{fmtRub(dayReport.secondBranch.total)}</b> ({dayReport.secondBranch.count} чек.), пробитая через «Блюдо от Шефа» (от 5000 ₽ — меньшие суммы под этим названием считаются обычным заказом первого заведения).
                      {dayReport.revenue?.totalWithSecondBranch != null && <> Сумма филиала 2 вычтена и из разбивки «По способам оплаты» выше — из того способа оплаты, которым её реально пробили (общая касса за день была {fmtRub(dayReport.revenue.totalWithSecondBranch)}).</>}
                    </div>
                  )}

                  {dayReport.secondBranchRawOrders?.length > 0 && (
                    <details>
                      <summary style={{cursor:'pointer', fontSize:12, color:COLORS.inkSoft}}>Показать заказы «Блюдо от Шефа» за этот день (для проверки)</summary>
                      <div className="rp-table-wrap" style={{marginTop:8}}>
                        <table className="rp-table">
                          <thead><tr><th>№ заказа</th><th>Сумма</th><th>Учтено как филиал 2?</th></tr></thead>
                          <tbody>
                            {dayReport.secondBranchRawOrders.map((o,i) => (
                              <tr key={i}><td>{o.orderNum ?? '—'}</td><td className="rp-num">{fmtRub(o.amount)}</td><td>{o.countedAsBranch ? 'Да' : 'Нет (меньше 5000₽)'}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}

                  {Object.keys(dayReport.errors || {}).length > 0 && (
                    <div className="rp-muted" style={{fontSize:11}}>
                      Часть данных не удалось получить: {Object.entries(dayReport.errors).filter(([k])=>!k.endsWith('Raw')).map(([k,v]) => `${k} — ${v}`).join('; ')}
                    </div>
                  )}
                </div>
              </Section>
            )}
          </div>
        )}
      </Card>

      {loading && <Card><div className="rp-muted">Загружаю данные из iiko…</div></Card>}
      {error && <div className="rp-alert" style={{marginBottom:16}}><AlertTriangle size={16}/> {error} <button className="rp-btn-link" onClick={load} style={{marginLeft:8}}>Повторить</button></div>}

      {!loading && !error && data && (
        <>
          <div className="rp-grid-4">
            <Stat label="Выручка за месяц (iiko)" value={fmtRub(data.grandTotal)} />
            <Stat label="Чеков" value={fmt0(data.totalChecks)} />
            <Stat label="Средний чек" value={fmtRub(data.avgCheck)} />
            <Stat label="Скидки за месяц" value={fmtRub(data.totalDiscount)} accent={COLORS.accent2} />
          </div>

          {(data.secondBranch || data.secondBranchError || data.cashPayIncome > 0 || data.cashPayIncomeError) && (
            <details style={{marginBottom:16}}>
              <summary style={{cursor:'pointer', fontSize:13, color:COLORS.inkSoft, fontWeight:600}}>Технические детали и сверка</summary>
              <div style={{marginTop:10, display:'flex', flexDirection:'column', gap:10}}>
                {data.secondBranch && (
                  <div className="rp-cash-check">
                    <Info size={13}/> Выручка второго филиала (без своей кассы, пробивается через «Блюдо от Шефа» от 5000 ₽): <b>{fmtRub(data.secondBranch.total)}</b> за месяц — уже исключена из всех цифр выше, показана отдельно.
                  </div>
                )}
                {data.secondBranchError && <div className="rp-muted" style={{fontSize:11}}>Не удалось проверить выручку второго филиала: {data.secondBranchError}</div>}

                {data.cashPayIncome > 0 && (
                  <div className="rp-cash-check">
                    <Info size={13}/> В выручку за месяц включены внесения наличных: <b>{fmtRub(data.cashPayIncome)}</b> — деньги, принятые отдельной кассовой операцией «Внесение наличных» (любой комментарий, кроме «дб» — начального остатка кассы, и «зп» — выплаты зарплаты), не проходят через обычную продажу и не попадают в OLAP-отчёт, поэтому добавлены отдельно.
                  </div>
                )}
                {data.cashPayIncomeError && <div className="rp-muted" style={{fontSize:11}}>Не удалось получить внесения по заказу: {data.cashPayIncomeError}</div>}
              </div>
            </details>
          )}

          <div className="rp-grid-2">
            <Card>
              <div className="rp-card-title">Выручка по дням (iiko)</div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={dailySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v) => fmtRub(v)} />
                  <Area type="monotone" dataKey="Выручка" stroke={COLORS.accent2} fill={COLORS.accent2} fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
            <Card>
              <div className="rp-card-title">По способам оплаты</div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={payTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={55}>
                    {payTypeData.map((e, i) => <Cell key={i} fill={COLORS.chartPalette[i % COLORS.chartPalette.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtRub(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card>
            <div className="rp-card-title">Удаления</div>
            {data.deletionsError && <div className="rp-muted">Не удалось получить: {data.deletionsError}</div>}
            {data.deletions && (
              <div className="rp-grid-4">
                <Stat label="Сумма удалённых позиций" value={fmtRub(data.deletions.total)} accent={COLORS.danger} />
                <Stat label="Количество" value={fmt0(data.deletions.count)} />
              </div>
            )}
            {!data.deletions && !data.deletionsError && <div className="rp-muted">Нет данных за период.</div>}
          </Card>

          <Card>
            <div className="rp-card-title">Внесения и изъятия</div>
            {cashError && <div className="rp-muted">Не удалось получить: {cashError}</div>}
            {cashData && (
              <>
                <div className="rp-grid-4">
                  <Stat label="Внесено за месяц" value={fmtRub(cashData.totalPayIn)} />
                  <Stat label="Изъято за месяц" value={fmtRub(cashData.totalPayOut)} />
                  <Stat label="Чистое движение" value={fmtRub(cashData.totalPayIn - cashData.totalPayOut)} />
                  <Stat label="Смен за месяц" value={fmt0((cashData.shifts||[]).length)} />
                </div>
                <p className="rp-muted" style={{marginTop:10, fontSize:11}}>Внесение по заказу уже учтено в «Выручка за месяц (iiko)» выше. Здесь — общее движение наличных по всем причинам сразу (без разбивки по комментарию). Отдельного поля «инкассация» в API нет — она входит в изъятия.</p>
                {cashData.shifts?.length > 0 && (
                  <Section title="Смены за месяц" count={cashData.shifts.length} defaultOpen={false}>
                    <div className="rp-table-wrap">
                      <table className="rp-table">
                        <thead><tr><th>Дата</th><th>Смена</th><th>Статус</th><th>Внесено</th><th>Изъято</th><th>Нал. продажи</th><th>Карта</th></tr></thead>
                        <tbody>
                          {cashData.shifts.map((s,i) => (
                            <tr key={i}>
                              <td>{s.date?.split('-').reverse().join('.')}</td>
                              <td>№{s.sessionNumber}</td>
                              <td>{s.status === 'OPEN' ? 'Открыта' : s.status === 'CLOSED' ? 'Закрыта' : s.status}</td>
                              <td className="rp-num">{fmtRub(s.payIn)}</td>
                              <td className="rp-num">{fmtRub(s.payOut)}</td>
                              <td className="rp-num">{fmtRub(s.salesCash)}</td>
                              <td className="rp-num">{fmtRub(s.salesCard)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Section>
                )}
              </>
            )}
            {!cashData && !cashError && <div className="rp-muted">Загружаю…</div>}
          </Card>

          {(data.days || []).length === 0 && (
            <Card><EmptyState icon={<Radio size={24} color={COLORS.inkSoft} />} title="Нет данных за этот месяц" description="Либо продаж ещё не было, либо период не совпадает с текущей датой на сервере iiko." /></Card>
          )}
        </>
      )}
    </div>
  );
}

function BelayaKalitvaPage({ ctx }) {
  const { session, year, monthIdx } = ctx;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const monthFrom = dateStr(year, monthIdx, 1);
  const monthTo = dateStr(year, monthIdx, daysInMonth(year, monthIdx));

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const resp = await fetch('/api/iiko-dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ from: monthFrom, to: monthTo })
      });
      const json = await resp.json();
      if (!resp.ok) { setError(json?.error || 'Не удалось получить данные из iiko.'); setData(null); return; }
      setData(json.secondBranch);
    } catch (e) {
      setError(e?.message || 'Не удалось связаться с сервером.');
    } finally {
      setLoading(false);
    }
  }, [monthFrom, monthTo, session]);

  useEffect(() => { load(); }, [load]);

  const dailySeries = (data?.days || []).map(d => ({ day: Number(d.date.slice(8, 10)), Выручка: d.total }));

  return (
    <div className="rp-page">
      <div className="rp-page-head">
        <h1><Radio size={20} style={{verticalAlign:'-3px', marginRight:8}}/>Отчёт Белая Калитва</h1>
        <div className="rp-page-sub">{MONTHS_RU[monthIdx]} {year} · выручка, которую присылают вечером и пробивают через кассу Новошахтинска</div>
      </div>

      <div className="rp-alert rp-alert-info" style={{marginBottom:16}}>
        <Info size={16}/> У этой точки нет своей онлайн-кассы. Здесь показана только выручка (то, что распознано как позиция «Блюдо от Шефа» на сумму от 5000 ₽ — так на кассе Новошахтинска отмечают суммы, присланные из Белой Калитвы). Расходов, ФОТ и P&L по этой точке в приложении нет — вести их можно на странице «Кассовая смена (день)» вручную, если понадобится.
      </div>

      {loading && <Card><div className="rp-muted">Загружаю данные из iiko…</div></Card>}
      {error && <div className="rp-alert" style={{marginBottom:16}}><AlertTriangle size={16}/> {error} <button className="rp-btn-link" onClick={load} style={{marginLeft:8}}>Повторить</button></div>}

      {!loading && !error && (
        data ? (
          <>
            <div className="rp-grid-4">
              <Stat label="Выручка за месяц" value={fmtRub(data.total)} />
              <Stat label="Чеков" value={fmt0(data.checks)} />
              <Stat label="Средний чек" value={fmtRub(data.avgCheck)} />
              <Stat label="Дней с выручкой" value={fmt0((data.days || []).length)} />
            </div>
            <Card>
              <div className="rp-card-title">Выручка по дням</div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={dailySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v) => fmtRub(v)} />
                  <Area type="monotone" dataKey="Выручка" stroke={COLORS.accent2} fill={COLORS.accent2} fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </>
        ) : (
          <Card><EmptyState icon={<Radio size={24} color={COLORS.inkSoft} />} title="Нет данных за этот месяц" description="Выручка Белой Калитвы за этот период не найдена (или ещё не пробита через кассу)." /></Card>
        )
      )}
    </div>
  );
}

function CombinedReportPage({ ctx }) {
  const { pnl, session, year, monthIdx } = ctx;
  const [belaya, setBelaya] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const monthFrom = dateStr(year, monthIdx, 1);
  const monthTo = dateStr(year, monthIdx, daysInMonth(year, monthIdx));

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const resp = await fetch('/api/iiko-dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ from: monthFrom, to: monthTo })
      });
      const json = await resp.json();
      if (!resp.ok) { setError(json?.error || 'Не удалось получить данные из iiko.'); return; }
      setBelaya(json.secondBranch);
    } catch (e) {
      setError(e?.message || 'Не удалось связаться с сервером.');
    } finally {
      setLoading(false);
    }
  }, [monthFrom, monthTo, session]);

  useEffect(() => { load(); }, [load]);

  const belayaRevenue = belaya?.total || 0;
  const totalRevenue = pnl.revenue + belayaRevenue;

  return (
    <div className="rp-page">
      <div className="rp-page-head">
        <h1>Общий отчёт</h1>
        <div className="rp-page-sub">{MONTHS_RU[monthIdx]} {year} · обе точки вместе</div>
      </div>

      <div className="rp-alert rp-alert-info" style={{marginBottom:16}}>
        <Info size={16}/> По Новошахтинску — полный P&L (выручка, расходы, прибыль), вносится вручную на странице «Кассовая смена (день)».
        По Белой Калитве — только выручка из iiko, расходов и прибыли по этой точке в приложении нет, поэтому общая прибыль по бизнесу здесь не считается — только сумма выручки для понимания общего объёма.
      </div>

      {loading && <div className="rp-muted" style={{marginBottom:12}}>Обновляю данные Белой Калитвы…</div>}
      {error && <div className="rp-alert" style={{marginBottom:16}}><AlertTriangle size={16}/> {error} <button className="rp-btn-link" onClick={load} style={{marginLeft:8}}>Повторить</button></div>}

      <div className="rp-grid-2">
        <Card>
          <div className="rp-card-title">Новошахтинск (полный P&L)</div>
          <div className="rp-grid-2" style={{marginTop:10}}>
            <Stat label="Выручка" value={fmtRub(pnl.revenue)} />
            <Stat label="Расходы" value={fmtRub(pnl.totalExpenses)} />
          </div>
          <div style={{marginTop:10}}>
            <Stat label="Прибыль" value={fmtRub(pnl.profit)} accent={pnl.profit >= 0 ? COLORS.accent : COLORS.danger} sub={`рентабельность ${fmtPct(pnl.margin)}`} />
          </div>
        </Card>
        <Card>
          <div className="rp-card-title">Белая Калитва (только выручка из iiko)</div>
          <div style={{marginTop:10}}>
            <Stat label="Выручка" value={fmtRub(belayaRevenue)} />
          </div>
          <p className="rp-muted" style={{fontSize:11, marginTop:10}}>Расходы и прибыль по этой точке не отслеживаются в приложении.</p>
        </Card>
      </div>

      <Card>
        <div className="rp-card-title">Суммарная выручка по бизнесу</div>
        <div className="rp-hero-value" style={{marginTop:6}}>{fmtRub(totalRevenue)}</div>
        <p className="rp-muted" style={{fontSize:11, marginTop:8}}>Новошахтинск ({fmtRub(pnl.revenue)}) + Белая Калитва ({fmtRub(belayaRevenue)}). Это только выручка, не прибыль — по Белой Калитве расходы не считаются.</p>
      </Card>
    </div>
  );
}

/* ============================== INCOMING VK REPORTS ============================== */

function IncomingReportsPage({ ctx }) {
  const { settings, employees, months, setMonths, logAudit, refreshPendingReportsCount, session } = ctx;
  const [text, setText] = useState('');
  const [parsedList, setParsedList] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [loadWarning, setLoadWarning] = useState('');
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [resultMeta, setResultMeta] = useState({ usedAi: false, usedFallback: false });

  const loadDrafts = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from('vk_report_drafts').select('*').eq('restaurant_id', RESTAURANT_ID).eq('status', 'pending').order('message_date', { ascending: true }).order('vk_message_id', { ascending: true });
      if (!error) setDrafts(data || []);
    } catch (_) {}
  }, []);
  useEffect(() => { loadDrafts(); refreshPendingReportsCount?.(); }, [loadDrafts, refreshPendingReportsCount]);

  const currentFallbackDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  const runRegexParse = () => {
    const fallbackDate = currentFallbackDate();
    const results = parseVkReportMulti(text, { revenueChannels: settings.revenueChannels || [], employees, expenseCategories: settings.expenseCategories || [], fallbackDate });
    return results;
  };

  const parseText = () => {
    setLoadError(''); setLoadWarning('');
    if (!text.trim()) { setLoadError('Вставьте сообщение из ВК.'); return; }
    const results = runRegexParse();
    if (results.length === 0) { setLoadError('Не удалось найти отчёт в тексте.'); setParsedList([]); return; }
    setResultMeta({ usedAi: false, usedFallback: false });
    setParsedList(results.map((p, i) => ({ parsed: p, key: `regex-${i}-${Date.now()}` })));
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const callAiOnce = async (fallbackDate) => {
    const resp = await fetch('/api/parse-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
      },
      body: JSON.stringify({
        text,
        revenueChannels: settings.revenueChannels || [],
        employees,
        expenseCategories: settings.expenseCategories || [],
        fallbackDate,
        glossary: settings.reportGlossary || ''
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(data?.error || `Ошибка сервера (${resp.status})`);
      err.status = resp.status;
      throw err;
    }
    return data;
  };

  const parseTextAi = async () => {
    setLoadError(''); setLoadWarning('');
    if (!text.trim()) { setLoadError('Вставьте сообщение из ВК.'); return; }
    if (text.length > 20000) { setLoadError('Текст слишком длинный (максимум 20000 символов). Разбейте на несколько вставок.'); return; }
    const fallbackDate = currentFallbackDate();
    setAiLoading(true);
    try {
      let data;
      let lastErr = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          data = await callAiOnce(fallbackDate);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          const retryable = !e.status || e.status >= 500;
          if (attempt === 0 && retryable) { await sleep(1200); continue; }
          break;
        }
      }

      if (lastErr) {
        const results = runRegexParse();
        setResultMeta({ usedAi: false, usedFallback: true });
        setParsedList(results.map((p, i) => ({ parsed: p, key: `fallback-${i}-${Date.now()}` })));
        setLoadWarning(`⚠️ ИИ-разбор недоступен (${lastErr.message}). Использован обычный разбор — внимательно проверьте цифры перед применением.`);
        if (results.length === 0) setLoadError('Автоматический разбор тоже не смог найти отчёт в тексте. Проверьте формат или попробуйте позже.');
        return;
      }

      const reports = data.reports || [];
      if (reports.length === 0) {
        setLoadError('ИИ не нашёл ни одного отчёта в этом тексте.');
        setParsedList([]);
        return;
      }
      setResultMeta({ usedAi: true, usedFallback: false });
      setParsedList(reports.map((p, i) => ({ parsed: p, key: `ai-${i}-${Date.now()}` })));
      const noDate = reports.filter(r => !r.date).length;
      if (noDate > 0) setLoadWarning(`ИИ не смог определить дату для ${noDate} из ${reports.length} отчётов — укажите вручную ниже.`);
    } finally {
      setAiLoading(false);
    }
  };

  const applyParsed = async (key, edited) => {
    if (!edited?.date) { setLoadError('Укажите дату отчёта.'); return; }
    setSaving(true); setLoadError('');
    try {
      const dateKey = edited.date;
      const mk = dateKey.slice(0, 7);
      setMonths(prev => {
        const existing = prev[mk] || emptyMonth(settings, null);
        const day = { ...getDay(existing, dateKey) };
        if (Object.keys(edited.revenue || {}).length) day.revenue = { ...day.revenue, ...Object.fromEntries(Object.entries(edited.revenue).filter(([,v]) => v !== '' && v != null).map(([k,v]) => [k, Number(v)])) };
        const courierPatch = {};
        ['pay','km','deliveries'].forEach(f => { if (edited.courier?.[f] !== '' && edited.courier?.[f] != null) courierPatch[f] = Number(edited.courier[f]); });
        if (Object.keys(courierPatch).length) day.courier = { ...day.courier, ...courierPatch };
        if (edited.promo?.pay !== '' && edited.promo?.pay != null) day.promo = { ...day.promo, pay: Number(edited.promo.pay) };
        const kitchen = (edited.kitchenExpenses || []).filter(e => e.include && Number(e.amount) > 0).map(e => ({ id: uid(), category: e.category || 'Покупки', amount: Number(e.amount), comment: 'Из ВК — вставка', method: 'cash' }));
        if (kitchen.length) day.kitchenExpenses = [...(day.kitchenExpenses || []), ...kitchen];
        const other = (edited.otherExpenses || []).filter(e => e.include && Number(e.amount) > 0).map(e => ({ id: uid(), category: e.category || 'Прочее', amount: Number(e.amount), comment: 'Из ВК — вставка', method: 'cash' }));
        if (other.length) day.otherExpenses = [...(day.otherExpenses || []), ...other];
        const nextMonth = { ...existing, days: { ...existing.days, [dateKey]: day } };
        const half = dayOfMonthFromDateStr(dateKey) <= 15 ? 1 : 2;
        const advances = (edited.advances || []).filter(a => a.include && a.employeeId && Number(a.amount) > 0).map(a => ({ id: uid(), employeeId: a.employeeId, type: 'advance', half, amount: Number(a.amount), comment: 'Из ВК — вставка', date: dateKey }));
        if (advances.length) nextMonth.adjustments = [...(nextMonth.adjustments || []), ...advances];
        const shifts = { ...(nextMonth.shifts || {}) };
        (edited.roster || []).filter(r => r.include && r.employeeId).forEach(r => { const emp = employees.find(e => e.id === r.employeeId); shifts[r.employeeId] = { ...(shifts[r.employeeId] || {}), [dateKey]: emp?.standardShift || settings.standardShiftHours }; });
        nextMonth.shifts = shifts;
        return { ...prev, [mk]: nextMonth };
      });
      logAudit({ what: 'Импорт отчёта из ВК', date: dateKey });
      setParsedList(list => {
        const next = list.filter(item => item.key !== key);
        if (next.length === 0) setText('');
        return next;
      });
      setLoadError(`Отчёт за ${dateKey} применён в P&L.`);
    } catch (e) {
      setLoadError(e?.message || 'Не удалось применить отчёт');
    } finally { setSaving(false); }
  };

  return (
    <div className="rp-page">
      <div className="rp-page-head">
        <h1>Входящие отчёты</h1>
        <div className="rp-page-sub">Вставьте одно сообщение или целиком кусок чата «СиоСан отчеты» за несколько дней — ИИ сам найдёт отчёты и разложит по датам.</div>
      </div>

      <Card>
        <div className="rp-card-title-row"><div><div className="rp-card-title">Вставить из ВК</div><div className="rp-muted">Можно вставлять весь отчёт целиком — с переносами строк, можно сразу за несколько дней.</div></div></div>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder={'Например:\nОтчёт за 26.08\nНаличные 4498\nКарты 32994,25\nНетМонет 37492,25\nИтого выручка 74984,50\n\nАвансы:\nЛеша 500\n\nПокупки 5129\n11 доставок\n300 курьер\n75 км'} style={{ width:'100%', minHeight:190, resize:'vertical', padding:14, border:'1px solid '+COLORS.line, borderRadius:10, fontFamily:'inherit', fontSize:13, boxSizing:'border-box' }} />
        <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
          <button className="rp-btn" onClick={parseTextAi} disabled={aiLoading}>{aiLoading ? 'Разбираю с ИИ…' : '✨ Разобрать с ИИ'}</button>
          <button className="rp-btn rp-btn-ghost" onClick={parseText} disabled={aiLoading}>Разобрать без ИИ</button>
          <button className="rp-btn rp-btn-ghost" onClick={() => { setText(''); setParsedList([]); setLoadError(''); setLoadWarning(''); setResultMeta({usedAi:false,usedFallback:false}); }} disabled={aiLoading}>Очистить</button>
        </div>
        {loadWarning && <div className="rp-alert rp-alert-warn" style={{marginTop:12}}><AlertTriangle size={16}/>{loadWarning}</div>}
        {loadError && <div className="rp-alert" style={{marginTop:12}}><AlertTriangle size={16}/>{loadError}</div>}
      </Card>

      {parsedList.length > 1 && <div className="rp-muted" style={{marginTop:14}}>Найдено отчётов: {parsedList.length}. Проверьте каждый и примените по отдельности.</div>}

      {parsedList.map(({ parsed, key }) => (
        <div key={key} style={{marginTop:14}}>
          <ManualParsedReport parsed={parsed} settings={settings} employees={employees} months={months} onApply={(edited) => applyParsed(key, edited)} aiPowered={resultMeta.usedAi} />
        </div>
      ))}

      {drafts.length > 0 && <>
        <div className="rp-section-title" style={{marginTop:20}}>Сохранённые черновики</div>
        {drafts.map(d => <DraftCard key={d.id} draft={d} settings={settings} employees={employees} months={months} onApply={async edited => { await applyParsed(null, edited); await supabase.from('vk_report_drafts').update({status:'applied', applied_at:new Date().toISOString()}).eq('id',d.id); await loadDrafts(); refreshPendingReportsCount?.(); }} onDismiss={async () => { await supabase.from('vk_report_drafts').update({status:'dismissed'}).eq('id',d.id); await loadDrafts(); refreshPendingReportsCount?.(); }} />)}
      </>}
    </div>
  );
}

function ManualParsedReport({ parsed, settings, employees, months, onApply, aiPowered }) {
  const [date, setDate] = useState(parsed.date || '');
  const [revenue, setRevenue] = useState({ ...(parsed.revenue || {}) });
  const [courier, setCourier] = useState({ ...(parsed.courier || {}) });
  const [promo, setPromo] = useState({ ...(parsed.promo || {}) });
  const [kitchenExpenses, setKitchenExpenses] = useState((parsed.kitchenExpenses || []).map(e => ({...e, include:true})));
  const [otherExpenses, setOtherExpenses] = useState((parsed.otherExpenses || []).map(e => ({...e, include:true})));
  const [advances, setAdvances] = useState((parsed.advances || []).map(a => ({...a, include:!!a.employeeId})));
  const [roster, setRoster] = useState((parsed.rosterMatches || []).map(r => ({...r, include:!!r.employeeId})));
  const sumRevenue = Object.values(revenue).reduce((s,v) => s + (Number(v)||0), 0);
  const balanced = parsed.totalHint == null ? null : Math.abs(sumRevenue - Number(parsed.totalHint)) < 0.01;
  const [busy,setBusy]=useState(false);
  const apply=async()=>{ if (!date) return; setBusy(true); await onApply({date,revenue,courier,promo,kitchenExpenses,otherExpenses,advances,roster}); setBusy(false); };
  return <Card>
    <div className="rp-card-title-row"><div><div className="rp-card-title">Проверка отчёта {aiPowered && <span className="rp-ai-badge" title="Разобрано с помощью ИИ">✨ ИИ</span>}</div>{parsed.totalHint != null && (balanced ? <div className="rp-draft-balance ok"><Check size={12}/> Выручка сходится с «Итого»</div> : <div className="rp-draft-balance bad"><AlertTriangle size={12}/> Не сходится: {fmtRub(sumRevenue)} против {fmtRub(parsed.totalHint)}</div>)}</div><button className="rp-btn" onClick={apply} disabled={busy || !date || balanced === false}>{busy?'Применяю…':'Применить в P&L'}</button></div>
    <Field label="Дата отчёта"><input type="date" value={date} onChange={e=>setDate(e.target.value)} /></Field>
    {Object.keys(revenue).length>0 && <><div className="rp-draft-section">Выручка</div><div className="rp-form-grid">{settings.revenueChannels.filter(c=>c.id in revenue).map(c=><Field key={c.id} label={c.name}><input type="number" step="0.01" value={revenue[c.id] ?? ''} onChange={e=>setRevenue(r=>({...r,[c.id]:e.target.value}))}/></Field>)}</div></>}
    {parsed.totalHint != null && !balanced && <div className="rp-inline-warn" style={{marginTop:10}}><AlertTriangle size={13}/> Исправьте суммы или «Итого» в исходном сообщении и разберите его заново.</div>}
    {(courier.pay!=null||courier.km!=null||courier.deliveries!=null) && <><div className="rp-draft-section">Курьер</div><div className="rp-form-grid"><Field label="Ставка"><input type="number" value={courier.pay??''} onChange={e=>setCourier(c=>({...c,pay:e.target.value}))}/></Field><Field label="Км"><input type="number" value={courier.km??''} onChange={e=>setCourier(c=>({...c,km:e.target.value}))}/></Field><Field label="Доставок"><input type="number" value={courier.deliveries??''} onChange={e=>setCourier(c=>({...c,deliveries:e.target.value}))}/></Field></div></>}
    {kitchenExpenses.length>0 && <ExpenseEditor title="Покупки" items={kitchenExpenses} setItems={setKitchenExpenses}/>} 
    {otherExpenses.length>0 && <ExpenseEditor title="Другие расходы" items={otherExpenses} setItems={setOtherExpenses}/>} 
    {advances.length>0 && <><div className="rp-draft-section">Авансы</div><div className="rp-list">{advances.map((a,i)=><div className="rp-list-row" key={i}><input type="checkbox" checked={a.include} disabled={!a.employeeId} onChange={e=>setAdvances(x=>x.map((z,j)=>j===i?{...z,include:e.target.checked}:z))}/><div className="rp-list-main"><div className="rp-list-cat">{a.matchedName || `«${a.name}» — сотрудник не найден`}</div></div><div className="rp-list-amount">{fmtRub(a.amount)}</div></div>)}</div></>}
    {roster.length>0 && <><div className="rp-draft-section">Кто работал</div><div className="rp-checklist">{roster.map((r,i)=><label key={i}><input type="checkbox" checked={r.include} disabled={!r.employeeId} onChange={e=>setRoster(x=>x.map((z,j)=>j===i?{...z,include:e.target.checked}:z))}/>{r.matchedName||`«${r.raw}» — не найден`}</label>)}</div></>}
    {parsed.registerCheck != null && <div className="rp-cash-check" style={{marginTop:10}}><Info size={13}/> Касса фактически (сверка): <b>{fmtRub(parsed.registerCheck)}</b> — справочно, в P&L не входит.</div>}
    {parsed.unmatchedLines?.length>0 && <div className="rp-inline-warn" style={{marginTop:10}}><AlertTriangle size={13}/> Не распознано: «{parsed.unmatchedLines.join('», «')}»</div>}
  </Card>;
}

function ExpenseEditor({title,items,setItems}) { return <><div className="rp-draft-section">{title}</div><div className="rp-list">{items.map((e,i)=><div className="rp-list-row" key={i}><input type="checkbox" checked={e.include} onChange={ev=>setItems(x=>x.map((z,j)=>j===i?{...z,include:ev.target.checked}:z))}/><input className="rp-inline-input" value={e.category} onChange={ev=>setItems(x=>x.map((z,j)=>j===i?{...z,category:ev.target.value}:z))}/><input className="rp-inline-input rp-num" type="number" step="0.01" value={e.amount} onChange={ev=>setItems(x=>x.map((z,j)=>j===i?{...z,amount:ev.target.value}:z))}/></div>)}</div></> }

function DraftCard({ draft, settings, employees, months, onApply, onDismiss }) {
  const p = draft.parsed || {};
  const [date, setDate] = useState(p.date || draft.message_date || '');
  const [revenue, setRevenue] = useState({ ...(p.revenue || {}) });
  const [courier, setCourier] = useState({ ...(p.courier || {}) });
  const [promo, setPromo] = useState({ ...(p.promo || {}) });
  const [kitchenExpenses, setKitchenExpenses] = useState((p.kitchenExpenses || []).map(e => ({...e,include:true})));
  const [otherExpenses, setOtherExpenses] = useState((p.otherExpenses || []).map(e => ({...e,include:true})));
  const [advances, setAdvances] = useState((p.advances || []).map(a => ({...a,include:!!a.employeeId})));
  const [roster, setRoster] = useState((p.rosterMatches || []).map(r => ({...r,include:!!r.employeeId})));
  const sumRevenue=Object.values(revenue).reduce((s,v)=>s+(Number(v)||0),0); const balanced=p.totalHint==null?null:Math.abs(sumRevenue-Number(p.totalHint))<.01;
  const doApply=async()=>{if(balanced===false)return; await onApply({date,revenue,courier,promo,kitchenExpenses,otherExpenses,advances,roster});};
  return <Card><div className="rp-card-title-row"><div><div className="rp-card-title">{draft.sender_name||'Без имени'} <span className="rp-muted">· {draft.message_date}</span></div>{p.totalHint!=null&&(balanced?<div className="rp-draft-balance ok"><Check size={12}/> Сумма сходится</div>:<div className="rp-draft-balance bad"><AlertTriangle size={12}/> Не сходится: {fmtRub(sumRevenue)} против {fmtRub(p.totalHint)}</div>)}</div><div style={{display:'flex',gap:8}}><button className="rp-btn rp-btn-ghost rp-btn-sm" onClick={onDismiss}>Отклонить</button><button className="rp-btn rp-btn-sm" onClick={doApply} disabled={balanced===false}>Применить</button></div></div><Field label="Дата отчёта"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field>{Object.keys(revenue).length>0&&<><div className="rp-draft-section">Выручка</div><div className="rp-form-grid">{settings.revenueChannels.filter(c=>c.id in revenue).map(c=><Field key={c.id} label={c.name}><input type="number" step="0.01" value={revenue[c.id]??''} onChange={e=>setRevenue(r=>({...r,[c.id]:e.target.value}))}/></Field>)}</div></>}{(courier.pay!=null||courier.km!=null||courier.deliveries!=null)&&<><div className="rp-draft-section">Курьер</div><div className="rp-form-grid"><Field label="Ставка"><input type="number" value={courier.pay??''} onChange={e=>setCourier(c=>({...c,pay:e.target.value}))}/></Field><Field label="Км"><input type="number" value={courier.km??''} onChange={e=>setCourier(c=>({...c,km:e.target.value}))}/></Field><Field label="Доставок"><input type="number" value={courier.deliveries??''} onChange={e=>setCourier(c=>({...c,deliveries:e.target.value}))}/></Field></div></>}{kitchenExpenses.length>0&&<ExpenseEditor title="Покупки" items={kitchenExpenses} setItems={setKitchenExpenses}/>} {otherExpenses.length>0&&<ExpenseEditor title="Другие расходы" items={otherExpenses} setItems={setOtherExpenses}/>} {advances.length>0&&<><div className="rp-draft-section">Авансы</div><div className="rp-list">{advances.map((a,i)=><div className="rp-list-row" key={i}><input type="checkbox" checked={a.include} disabled={!a.employeeId} onChange={e=>setAdvances(x=>x.map((z,j)=>j===i?{...z,include:e.target.checked}:z))}/><div className="rp-list-main"><div className="rp-list-cat">{a.matchedName||`«${a.name}» — сотрудник не найден`}</div></div><div className="rp-list-amount">{fmtRub(a.amount)}</div></div>)}</div></>}{(p.unmatchedLines||[]).length>0&&<div className="rp-inline-warn" style={{marginTop:10}}><AlertTriangle size={13}/> Не распознано: «{p.unmatchedLines.join('», «')}»</div>}</Card>;
}

/* ============================== EXPORT ============================== */

const PAYTYPE_LABEL = { shift: 'руб/смена', hour: 'руб/час', oklad: 'оклад' };
const PAYTYPE_FROM_LABEL = { 'руб/смена': 'shift', 'руб/час': 'hour', 'оклад': 'oklad' };
const ADJTYPE_LABEL = { bonus: 'Бонус', motivation: 'Мотивация', penalty: 'Штраф/удержание', advance: 'Аванс', manual: 'Ручная корректировка' };
const ADJTYPE_FROM_LABEL = Object.fromEntries(Object.entries(ADJTYPE_LABEL).map(([k, v]) => [v, k]));

function normalizeSyncDate(v) {
  if (!v && v !== 0) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 20000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const dt = new Date(epoch.getTime() + Number(s) * 86400000);
    return dt.toISOString().slice(0, 10);
  }
  return s.slice(0, 10);
}

function buildSyncWorkbook(ctx) {
  const { settings, employees, suppliers, month, year, monthIdx } = ctx;
  const nd = daysInMonth(year, monthIdx);
  const wb = XLSX.utils.book_new();

  const revHeader = ['Дата', ...settings.revenueChannels.map((c) => c.name)];
  const revRows = [revHeader];
  for (let d = 1; d <= nd; d++) {
    const ds = dateStr(year, monthIdx, d);
    const day = getDay(month, ds);
    revRows.push([ds, ...settings.revenueChannels.map((c) => Number(day.revenue?.[c.id]) || 0)]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(revRows), 'Выручка');

  const kitchenRows = [['ID', 'Дата', 'Категория', 'Сумма', 'Комментарий']];
  for (let d = 1; d <= nd; d++) {
    const ds = dateStr(year, monthIdx, d);
    (getDay(month, ds).kitchenExpenses || []).forEach((e) => kitchenRows.push([e.id, ds, e.category || '', Number(e.amount) || 0, e.comment || '']));
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kitchenRows), 'Расходы_кухня');

  const otherRows = [['ID', 'Дата', 'Категория', 'Сумма', 'Способ', 'Комментарий']];
  for (let d = 1; d <= nd; d++) {
    const ds = dateStr(year, monthIdx, d);
    (getDay(month, ds).otherExpenses || []).forEach((e) => otherRows.push([e.id, ds, e.category || '', Number(e.amount) || 0, e.method === 'cashless' ? 'Безналичные' : 'Наличные', e.comment || '']));
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(otherRows), 'Расходы_прочие');

  const cpRows = [['Дата', 'Доставок', 'СтавкаКурьера', 'КмКурьера', 'Промо', 'КоммКурьера', 'КоммПромо']];
  for (let d = 1; d <= nd; d++) {
    const ds = dateStr(year, monthIdx, d);
    const day = getDay(month, ds);
    cpRows.push([ds, Number(day.courier?.deliveries) || 0, Number(day.courier?.pay) || 0, Number(day.courier?.km) || 0, Number(day.promo?.pay) || 0, day.courier?.comment || '', day.promo?.comment || '']);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cpRows), 'Курьер_и_промо');

  const shiftRows = [['Дата', 'Сотрудник', 'Часы']];
  Object.entries(month.shifts || {}).forEach(([empId, byDate]) => {
    const emp = employees.find((e) => e.id === empId);
    Object.entries(byDate || {}).forEach(([ds, hours]) => {
      if (Number(hours) > 0) shiftRows.push([ds, emp?.name || empId, Number(hours)]);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(shiftRows), 'Смены');

  const adjRows = [['ID', 'Дата', 'Сотрудник', 'Тип', 'Половина', 'Сумма', 'Комментарий']];
  (month.adjustments || []).forEach((a) => {
    const emp = employees.find((e) => e.id === a.employeeId);
    adjRows.push([a.id, a.date || '', emp?.name || a.employeeId, ADJTYPE_LABEL[a.type] || a.type, a.half, Number(a.amount) || 0, a.comment || '']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(adjRows), 'Корректировки');

  const ordRows = [['ID', 'Дата', 'Поставщик', 'Сумма', 'Накладная', 'Комментарий']];
  (month.supplierOrders || []).forEach((o) => {
    const sup = suppliers.find((s) => s.id === o.supplierId);
    ordRows.push([o.id, o.date || '', sup?.name || o.supplierId, Number(o.amount) || 0, o.invoice || '', o.comment || '']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ordRows), 'Поставки');

  const payRows = [['ID', 'Дата', 'Поставщик', 'Сумма', 'Способ', 'Комментарий']];
  (month.supplierPayments || []).forEach((p) => {
    const sup = suppliers.find((s) => s.id === p.supplierId);
    payRows.push([p.id, p.date || '', sup?.name || p.supplierId, Number(p.amount) || 0, p.method === 'cash' ? 'Наличные' : 'Безналичные', p.comment || '']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(payRows), 'Оплаты_поставщикам');

  const empRows = [['ID', 'ФИО', 'Должность', 'ТипОплаты', 'Ставка', 'Статус', 'СтандартнаяСмена', 'ДатаНачала', 'ДатаУвольнения', 'Комментарий']];
  employees.forEach((e) => empRows.push([e.id, e.name, e.position || '', PAYTYPE_LABEL[e.payType] || e.payType, Number(e.rate) || 0, e.status === 'active' ? 'активен' : 'уволен', e.standardShift ?? '', e.startDate || '', e.endDate || '', e.comment || '']));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(empRows), 'Сотрудники');

  const supRows = [['ID', 'Название', 'Архив']];
  suppliers.forEach((s) => supRows.push([s.id, s.name, s.archived ? 'да' : 'нет']));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(supRows), 'Поставщики');

  const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
  const url = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
  const filename = `SIOSAN_данные_${MONTHS_RU[monthIdx]}_${year}.xlsx`;
  return { url, filename };
}

function parseSyncWorkbook(arrayBuffer, ctx) {
  const { settings, employees, suppliers, month, year, monthIdx } = ctx;
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = (name) => {
    const ws = wb.Sheets[name];
    return ws ? XLSX.utils.sheet_to_json(ws, { defval: '' }) : [];
  };

  const empByName = new Map(employees.map((e) => [e.name.trim().toLowerCase(), e]));
  const supByName = new Map(suppliers.map((s) => [s.name.trim().toLowerCase(), s]));
  const nd = daysInMonth(year, monthIdx);
  const monthPrefix = monthKeyOf(year, monthIdx);
  const inThisMonth = (ds) => typeof ds === 'string' && ds.startsWith(monthPrefix);

  const newDaysRevenue = {};
  sheet('Выручка').forEach((row) => {
    const ds = normalizeSyncDate(row['Дата']);
    if (!inThisMonth(ds)) return;
    const rev = {};
    settings.revenueChannels.forEach((c) => { rev[c.id] = Number(row[c.name]) || 0; });
    newDaysRevenue[ds] = rev;
  });

  function parseExpenseSheet(name, showMethod) {
    const byDate = {};
    sheet(name).forEach((row) => {
      const ds = normalizeSyncDate(row['Дата']);
      if (!inThisMonth(ds)) return;
      const amount = Number(row['Сумма']) || 0;
      if (!amount && !row['Категория']) return;
      const id = row['ID'] ? String(row['ID']) : uid();
      const item = { id, category: row['Категория'] || '', amount, comment: row['Комментарий'] || '' };
      if (showMethod) item.method = row['Способ'] === 'Безналичные' ? 'cashless' : 'cash';
      byDate[ds] = byDate[ds] || [];
      byDate[ds].push(item);
    });
    return byDate;
  }
  const kitchenByDate = parseExpenseSheet('Расходы_кухня', false);
  const otherByDate = parseExpenseSheet('Расходы_прочие', true);

  const newCourierPromo = {};
  sheet('Курьер_и_промо').forEach((row) => {
    const ds = normalizeSyncDate(row['Дата']);
    if (!inThisMonth(ds)) return;
    newCourierPromo[ds] = {
      courier: { deliveries: Number(row['Доставок']) || 0, pay: Number(row['СтавкаКурьера']) || 0, km: Number(row['КмКурьера']) || 0, comment: row['КоммКурьера'] || '' },
      promo: { pay: Number(row['Промо']) || 0, comment: row['КоммПромо'] || '' },
    };
  });

  const newShifts = {};
  const unmatchedShiftNames = new Set();
  sheet('Смены').forEach((row) => {
    const ds = normalizeSyncDate(row['Дата']);
    if (!inThisMonth(ds)) return;
    const name = String(row['Сотрудник'] || '').trim();
    const emp = empByName.get(name.toLowerCase());
    const hours = Number(row['Часы']) || 0;
    if (!emp) { if (name) unmatchedShiftNames.add(name); return; }
    if (hours <= 0) return;
    newShifts[emp.id] = newShifts[emp.id] || {};
    newShifts[emp.id][ds] = hours;
  });

  const newAdjustments = [];
  const unmatchedAdjNames = new Set();
  sheet('Корректировки').forEach((row) => {
    const ds = normalizeSyncDate(row['Дата']);
    const name = String(row['Сотрудник'] || '').trim();
    const amount = Number(row['Сумма']) || 0;
    if (!name && !amount) return;
    const emp = empByName.get(name.toLowerCase());
    if (!emp) { if (name) unmatchedAdjNames.add(name); return; }
    const type = ADJTYPE_FROM_LABEL[row['Тип']] || 'manual';
    const half = Number(row['Половина']) === 2 ? 2 : 1;
    const id = row['ID'] ? String(row['ID']) : uid();
    newAdjustments.push({ id, employeeId: emp.id, type, half, amount, comment: row['Комментарий'] || '', date: ds || dateStr(year, monthIdx, half === 1 ? 1 : 16) });
  });

  function parseSupplierOpSheet(name, isPayment) {
    const out = [];
    const unmatched = new Set();
    sheet(name).forEach((row) => {
      const ds = normalizeSyncDate(row['Дата']);
      const supName = String(row['Поставщик'] || '').trim();
      const amount = Number(row['Сумма']) || 0;
      if (!supName && !amount) return;
      const sup = supByName.get(supName.toLowerCase());
      if (!sup) { if (supName) unmatched.add(supName); return; }
      const id = row['ID'] ? String(row['ID']) : uid();
      const item = { id, supplierId: sup.id, date: ds, amount, comment: row['Комментарий'] || '' };
      if (isPayment) item.method = row['Способ'] === 'Наличные' ? 'cash' : 'cashless'; else item.invoice = row['Накладная'] || '';
      out.push(item);
    });
    return { out, unmatched };
  }
  const ordersParsed = parseSupplierOpSheet('Поставки', false);
  const paymentsParsed = parseSupplierOpSheet('Оплаты_поставщикам', true);

  const employeeUpserts = [];
  sheet('Сотрудники').forEach((row) => {
    const name = String(row['ФИО'] || '').trim();
    if (!name) return;
    const id = row['ID'] ? String(row['ID']) : uid();
    employeeUpserts.push({
      id, name, position: row['Должность'] || '',
      payType: PAYTYPE_FROM_LABEL[row['ТипОплаты']] || 'shift',
      rate: Number(row['Ставка']) || 0,
      status: row['Статус'] === 'уволен' ? 'fired' : 'active',
      standardShift: row['СтандартнаяСмена'] === '' ? null : Number(row['СтандартнаяСмена']),
      startDate: row['ДатаНачала'] || '', endDate: row['ДатаУвольнения'] || '', comment: row['Комментарий'] || '',
    });
  });

  const supplierUpserts = [];
  sheet('Поставщики').forEach((row) => {
    const name = String(row['Название'] || '').trim();
    if (!name) return;
    const id = row['ID'] ? String(row['ID']) : uid();
    supplierUpserts.push({ id, name, archived: row['Архив'] === 'да' });
  });

  const newMonth = {
    ...month,
    days: {},
    shifts: newShifts,
    adjustments: newAdjustments,
    supplierOrders: ordersParsed.out,
    supplierPayments: paymentsParsed.out,
  };
  for (let d = 1; d <= nd; d++) {
    const ds = dateStr(year, monthIdx, d);
    const oldDay = getDay(month, ds);
    const cp = newCourierPromo[ds] || { courier: oldDay.courier, promo: oldDay.promo };
    newMonth.days[ds] = {
      closed: oldDay.closed,
      revenue: newDaysRevenue[ds] || {},
      kitchenExpenses: kitchenByDate[ds] || [],
      otherExpenses: otherByDate[ds] || [],
      courier: cp.courier,
      promo: cp.promo,
    };
  }

  const diff = computeSyncDiff(month, newMonth, employees, employeeUpserts, suppliers, supplierUpserts, settings.revenueChannels);

  return {
    newMonth, employeeUpserts, supplierUpserts, diff,
    warnings: {
      unmatchedShiftNames: [...unmatchedShiftNames],
      unmatchedAdjNames: [...unmatchedAdjNames],
      unmatchedOrderSuppliers: [...ordersParsed.unmatched],
      unmatchedPaymentSuppliers: [...paymentsParsed.unmatched],
    },
  };
}

function computeSyncDiff(oldMonth, newMonth, employees, employeeUpserts, suppliers, supplierUpserts, revenueChannels) {
  const channelIds = revenueChannels.map((c) => c.id);
  const canon = (obj, fields) => JSON.stringify(fields.map((f) => obj?.[f] ?? null));

  let revenueDaysChanged = 0;
  Object.keys(newMonth.days).forEach((ds) => {
    const oldRev = getDay(oldMonth, ds).revenue || {};
    const newRev = newMonth.days[ds].revenue || {};
    const same = channelIds.every((cid) => (Number(oldRev[cid]) || 0) === (Number(newRev[cid]) || 0));
    if (!same) revenueDaysChanged++;
  });

  let courierPromoDaysChanged = 0;
  const cpFields = ['deliveries', 'pay', 'km', 'comment'];
  const promoFields = ['pay', 'comment'];
  Object.keys(newMonth.days).forEach((ds) => {
    const a = getDay(oldMonth, ds), b = newMonth.days[ds];
    if (canon(a.courier, cpFields) !== canon(b.courier, cpFields) || canon(a.promo, promoFields) !== canon(b.promo, promoFields)) courierPromoDaysChanged++;
  });

  const diffList = (oldList, newList, fields) => {
    const oldIds = new Set(oldList.map((x) => x.id));
    const added = newList.filter((x) => !oldIds.has(x.id)).length;
    const newIds = new Set(newList.map((x) => x.id));
    const removed = oldList.filter((x) => !newIds.has(x.id)).length;
    let changed = 0;
    newList.forEach((n) => {
      const o = oldList.find((x) => x.id === n.id);
      if (o && canon(o, fields) !== canon(n, fields)) changed++;
    });
    return { added, removed, changed };
  };

  const flattenExp = (monthObj, key) => Object.entries(monthObj.days || {}).flatMap(([ds, d]) => (d[key] || []).map((x) => ({ ...x, date: ds })));

  return {
    revenueDaysChanged,
    courierPromoDaysChanged,
    kitchen: diffList(flattenExp(oldMonth, 'kitchenExpenses'), flattenExp(newMonth, 'kitchenExpenses'), ['category', 'amount', 'comment', 'date']),
    other: diffList(flattenExp(oldMonth, 'otherExpenses'), flattenExp(newMonth, 'otherExpenses'), ['category', 'amount', 'comment', 'method', 'date']),
    adjustments: diffList(oldMonth.adjustments || [], newMonth.adjustments || [], ['employeeId', 'type', 'half', 'amount', 'comment', 'date']),
    orders: diffList(oldMonth.supplierOrders || [], newMonth.supplierOrders || [], ['supplierId', 'amount', 'invoice', 'comment', 'date']),
    payments: diffList(oldMonth.supplierPayments || [], newMonth.supplierPayments || [], ['supplierId', 'amount', 'method', 'comment', 'date']),
    newEmployees: employeeUpserts.filter((e) => !employees.some((x) => x.id === e.id)).length,
    changedEmployees: employeeUpserts.filter((e) => { const o = employees.find((x) => x.id === e.id); return o && JSON.stringify(o) !== JSON.stringify({ ...o, ...e }); }).length,
    newSuppliers: supplierUpserts.filter((s) => !suppliers.some((x) => x.id === s.id)).length,
    changedSuppliers: supplierUpserts.filter((s) => { const o = suppliers.find((x) => x.id === s.id); return o && JSON.stringify(o) !== JSON.stringify({ ...o, ...s }); }).length,
  };
}

function SyncModal({ ctx, onClose }) {
  const { settings, employees, suppliers, month, year, monthIdx, monthKey, setMonths, setEmployees, setSuppliers, logAudit } = ctx;
  const fileInputRef = useRef(null);
  const [error, setError] = useState('');
  const [exportFile, setExportFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [applied, setApplied] = useState(false);

  const handleExport = () => {
    setError('');
    try {
      const result = buildSyncWorkbook(ctx);
      setExportFile(result);
      try {
        const a = document.createElement('a');
        a.href = result.url; a.download = result.filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      } catch (e) {}
    } catch (e) {
      setError('Не удалось сформировать файл: ' + (e?.message || 'неизвестная ошибка'));
    }
  };

  const onFilePicked = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setApplied(false);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = parseSyncWorkbook(reader.result, ctx);
        setParsed(result);
      } catch (err) {
        setError('Не удалось прочитать файл. Убедитесь, что это файл, скачанный из этой же синхронизации, и что вы не меняли названия листов.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const applyImport = () => {
    if (!parsed) return;
    setMonths((prev) => ({ ...prev, [monthKey]: parsed.newMonth }));
    if (parsed.employeeUpserts.length) {
      setEmployees((prev) => {
        const byId = new Map(prev.map((x) => [x.id, x]));
        parsed.employeeUpserts.forEach((u) => byId.set(u.id, { ...(byId.get(u.id) || {}), ...u }));
        return Array.from(byId.values());
      });
    }
    if (parsed.supplierUpserts.length) {
      setSuppliers((prev) => {
        const byId = new Map(prev.map((x) => [x.id, x]));
        parsed.supplierUpserts.forEach((u) => byId.set(u.id, { ...(byId.get(u.id) || {}), ...u }));
        return Array.from(byId.values());
      });
    }
    logAudit({ what: 'Импорт из Excel применён', month: monthKey });
    setApplied(true);
    setParsed(null);
  };

  const d = parsed?.diff;
  const totalChanges = d ? d.revenueDaysChanged + d.courierPromoDaysChanged + d.kitchen.added + d.kitchen.changed + d.kitchen.removed
    + d.other.added + d.other.changed + d.other.removed + d.adjustments.added + d.adjustments.changed + d.adjustments.removed
    + d.orders.added + d.orders.changed + d.orders.removed + d.payments.added + d.payments.changed + d.payments.removed
    + d.newEmployees + d.changedEmployees + d.newSuppliers + d.changedSuppliers : 0;
  const hasWarnings = parsed && Object.values(parsed.warnings).some((arr) => arr.length > 0);

  return (
    <Modal title="Синхронизация с Excel" onClose={onClose} wide>
      <p className="rp-muted" style={{ marginTop: 0 }}>
        Файл — это все первичные данные {MONTHS_RU[monthIdx].toLowerCase()} {year} (не итоговый отчёт, а именно то, что можно
        редактировать): выручка по дням, расходы, курьер, промо, смены, корректировки, поставки и справочники сотрудников/поставщиков.
        Автоматической живой синхронизации файла на диске браузер не позволяет — рабочий цикл: скачали → отредактировали
        в Excel → загрузили обратно тем же файлом → приложение покажет, что изменилось, и применит только после вашего подтверждения.
      </p>

      <div className="rp-sync-actions">
        <button className="rp-btn" onClick={handleExport}><FileSpreadsheet size={15} /> Скачать файл для редактирования</button>
        <button className="rp-btn rp-btn-ghost" onClick={() => fileInputRef.current?.click()}><UploadCloud size={15} /> Загрузить изменённый файл</button>
        <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={onFilePicked} />
      </div>

      {exportFile && (
        <a className="rp-export-fallback rp-export-fallback-primary" href={exportFile.url} download={exportFile.filename}>
          <Download size={12} /> Скачать «{exportFile.filename}» (если не началось само)
        </a>
      )}
      {error && <div className="rp-export-error">{error}</div>}
      {applied && !parsed && <div className="rp-sync-applied"><Check size={14} /> Изменения применены.</div>}

      {parsed && (
        <div className="rp-sync-diff">
          <div className="rp-card-title">Что изменится ({totalChanges} {totalChanges === 1 ? 'изменение' : 'изменений'})</div>
          {totalChanges === 0 ? (
            <p className="rp-muted">Отличий от текущих данных приложения не найдено.</p>
          ) : (
            <ul className="rp-sync-diff-list">
              {d.revenueDaysChanged > 0 && <li>Выручка: изменено дней — {d.revenueDaysChanged}</li>}
              {d.courierPromoDaysChanged > 0 && <li>Курьер/промо: изменено дней — {d.courierPromoDaysChanged}</li>}
              {(d.kitchen.added || d.kitchen.changed || d.kitchen.removed) > 0 && <li>Расходы кухня/бар: +{d.kitchen.added} / изменено {d.kitchen.changed} / удалено {d.kitchen.removed}</li>}
              {(d.other.added || d.other.changed || d.other.removed) > 0 && <li>Прочие расходы: +{d.other.added} / изменено {d.other.changed} / удалено {d.other.removed}</li>}
              {(d.adjustments.added || d.adjustments.changed || d.adjustments.removed) > 0 && <li>Корректировки сотрудников: +{d.adjustments.added} / изменено {d.adjustments.changed} / удалено {d.adjustments.removed}</li>}
              {(d.orders.added || d.orders.changed || d.orders.removed) > 0 && <li>Поставки: +{d.orders.added} / изменено {d.orders.changed} / удалено {d.orders.removed}</li>}
              {(d.payments.added || d.payments.changed || d.payments.removed) > 0 && <li>Оплаты поставщикам: +{d.payments.added} / изменено {d.payments.changed} / удалено {d.payments.removed}</li>}
              {d.newEmployees > 0 && <li>Новых сотрудников: {d.newEmployees}</li>}
              {d.changedEmployees > 0 && <li>Изменённых карточек сотрудников: {d.changedEmployees}</li>}
              {d.newSuppliers > 0 && <li>Новых поставщиков: {d.newSuppliers}</li>}
              {d.changedSuppliers > 0 && <li>Изменённых поставщиков: {d.changedSuppliers}</li>}
            </ul>
          )}
          {hasWarnings && (
            <div className="rp-inline-warn" style={{ marginTop: 8 }}>
              <AlertTriangle size={13} />
              <span>
                Не удалось сопоставить по имени, строки пропущены:
                {[...parsed.warnings.unmatchedShiftNames, ...parsed.warnings.unmatchedAdjNames, ...parsed.warnings.unmatchedOrderSuppliers, ...parsed.warnings.unmatchedPaymentSuppliers]
                  .filter((v, i, arr) => arr.indexOf(v) === i).join(', ')} — проверьте точное написание имени/названия на листе «Сотрудники»/«Поставщики».
              </span>
            </div>
          )}
          <div className="rp-modal-actions">
            <button className="rp-btn rp-btn-ghost" onClick={() => setParsed(null)}>Отмена</button>
            <button className="rp-btn" disabled={totalChanges === 0} onClick={applyImport}>Применить изменения</button>
          </div>
          <p className="rp-muted" style={{ fontSize: 11 }}>Справочники сотрудников и поставщиков обновляются только добавлением/правкой — пропавшая из файла строка сотрудника или поставщика не удаляет его из приложения.</p>
        </div>
      )}
    </Modal>
  );
}

function ExportMenu({ ctx }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const handleExcel = () => {
    setError('');
    try {
      const result = buildExcelFile(ctx);
      setFile(result);
      try {
        const a = document.createElement('a');
        a.href = result.url; a.download = result.filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      } catch (clickErr) {}
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

  const payHeader = ['Сотрудник', 'Должность', 'Тип оплаты', 'Ставка', 'Часы 1-я пол.', 'Часы 2-я пол.', 'Начислено', 'Бонус', 'Удержано', 'Аванс', 'К выплате'];
  const payRows = [payHeader, ...pnl.payroll.rows.map((r) => [r.name, r.position, r.payType, r.rate, r.h1, r.h2, r.base, r.bonus, r.deduct, r.advance, r.payout])];
  const wsPay = XLSX.utils.aoa_to_sheet(payRows);
  XLSX.utils.book_append_sheet(wb, wsPay, 'ФОТ');

  const courHeader = ['Дата', 'Доставок', 'Ставка', 'Км', 'Бензин', 'Итого'];
  const courRows = [courHeader, ...pnl.courier.items.map((c) => [c.date, c.deliveries, c.pay, c.km, c.fuel, c.pay + c.fuel])];
  const wsCour = XLSX.utils.aoa_to_sheet(courRows);
  XLSX.utils.book_append_sheet(wb, wsCour, 'Курьеры');

  const ledger = supplierLedger(ctx.months, suppliers, year, monthIdx);
  const supHeader = ['Поставщик', 'Поставлено (всего)', 'Оплачено (всего)', 'Долг'];
  const supRows = [supHeader, ...suppliers.filter((s) => !s.archived).map((s) => { const l = ledger[s.id] || { ordered: 0, paid: 0 }; return [s.name, l.ordered, l.paid, l.ordered - l.paid]; })];
  const wsSup = XLSX.utils.aoa_to_sheet(supRows);
  XLSX.utils.book_append_sheet(wb, wsSup, 'Поставщики');

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
