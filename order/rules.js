export const RESTAURANT = {
  name: "1 Stop Meat & Tandoori Hut",
  phone: "+15196686064",
  phoneDisplay: "(519) 668-6064",
  address: "1070 Wellington Rd, Unit 14, London, ON N6E 1M2",
  timeZone: "America/Toronto",
};

export const HOURS = { 0: [11, 21], 1: [11, 21], 2: [11, 21], 3: [11, 21], 4: [11, 21], 5: [11, 23], 6: [11, 23] };
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DIRECT_DISCOUNT_PCT = 10;
export const HST_PCT = 13;
export const TIP_OPTIONS = [0, 10, 15, 18];
export const MAX_QTY = 50;
export const LEAD_MINUTES = 20;
export const LAST_ORDER_MINUTES = 15;
export const SLOT_MINUTES = 15;
export const SCHEDULE_DAYS = 2;

export const DELIVERY = {
  enabled: false,
  feeCents: 499,
  minimumCents: 2500,
  postalPrefixes: ["N6C", "N6E", "N6J", "N6K", "N6L", "N6M", "N6N", "N5W", "N5Z"],
};

export const WAREHOUSE_DELIVERY = {
  enabled: true,
  dropoffMax: 200,
};

export const FULFILMENT_LABELS = {
  pickup: "Pickup",
  delivery: "Delivery",
  amazon: "Amazon warehouse delivery",
};

export const STATUS_LABELS = {
  received: "Received",
  accepted: "Accepted",
  preparing: "Being prepared",
  ready: "Ready for pickup",
  out_for_delivery: "Out for delivery",
  completed: "Completed",
  cancelled: "Cancelled",
};

const TRANSITIONS = {
  received: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "out_for_delivery", "cancelled"],
  ready: ["completed"],
  out_for_delivery: ["completed"],
  completed: [],
  cancelled: [],
};

export function nextStatuses(order) {
  return (TRANSITIONS[order.status] || []).filter((s) => {
    if (s === "ready") return order.fulfilment.type === "pickup";
    if (s === "out_for_delivery") return order.fulfilment.type !== "pickup";
    return true;
  });
}

export function isActiveStatus(status) {
  return status !== "completed" && status !== "cancelled";
}

export const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
export const formatCents = (cents) => money.format(cents / 100);
const toCents = (dollars) => Math.round(dollars * 100);

export function torontoNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RESTAURANT.timeZone, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function formatHour(h) {
  if (h === 12) return "noon";
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

export function formatTime(date) {
  const { minutes } = torontoNow(date);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!m) return h ? formatHour(h) : "12 am";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

function inOrderingWindow(date) {
  const { day, minutes } = torontoNow(date);
  const [open, close] = HOURS[day];
  return minutes >= open * 60 && minutes <= close * 60 - LAST_ORDER_MINUTES;
}

export function asapAvailable(now = new Date()) {
  return inOrderingWindow(now) && inOrderingWindow(new Date(now.getTime() + LEAD_MINUTES * 60000));
}

const slotStep = SLOT_MINUTES * 60000;

export function orderSlots(now = new Date()) {
  const earliest = now.getTime() + LEAD_MINUTES * 60000;
  const end = now.getTime() + SCHEDULE_DAYS * 86400000;
  const slots = [];
  for (let t = Math.ceil(earliest / slotStep) * slotStep; t <= end; t += slotStep) {
    const d = new Date(t);
    if (inOrderingWindow(d)) slots.push(d);
  }
  return slots;
}

export function isValidSlot(iso, now = new Date()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t) || t % slotStep !== 0) return false;
  return orderSlots(now).some((d) => d.getTime() === t);
}

export function slotLabel(date, now = new Date()) {
  const dayKey = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: RESTAURANT.timeZone }).format(d);
  const time = formatTime(date);
  if (dayKey(date) === dayKey(now)) return `Today, ${time}`;
  if (dayKey(date) === dayKey(new Date(now.getTime() + 86400000))) return `Tomorrow, ${time}`;
  const weekday = new Intl.DateTimeFormat("en-CA", { timeZone: RESTAURANT.timeZone, weekday: "long" }).format(date);
  return `${weekday}, ${time}`;
}

const CANADIAN_AREA_CODES = new Set([
  204, 226, 236, 249, 250, 257, 263, 289, 306, 343, 354, 365, 367, 368, 382, 387, 403, 416, 418, 428, 431, 437,
  438, 450, 460, 468, 474, 506, 514, 519, 548, 579, 581, 584, 587, 604, 613, 639, 647, 672, 683, 705, 709, 742,
  753, 778, 780, 782, 807, 819, 825, 867, 873, 879, 902, 905, 942,
].map(String));

export function normalizePhone(input) {
  let digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits) || !CANADIAN_AREA_CODES.has(digits.slice(0, 3))) return null;
  return `+1${digits}`;
}

export function formatPhone(e164) {
  const d = e164.slice(2);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function normalizePostal(input) {
  const s = String(input || "").toUpperCase().replace(/\s+/g, "");
  if (!/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/.test(s)) return null;
  return `${s.slice(0, 3)} ${s.slice(3)}`;
}

export function inDeliveryZone(postal) {
  const p = normalizePostal(postal);
  return Boolean(p) && DELIVERY.postalPrefixes.includes(p.slice(0, 3));
}

export function indexMenu(menu) {
  const index = new Map();
  menu.sections.forEach((section) => {
    section.items.forEach((item) => {
      index.set(item.id, { id: item.id, name: item.name, priceCents: toCents(item.price), raw: Boolean(section.raw), veg: item.veg });
    });
  });
  return index;
}

const pct = (cents, p) => Math.round((cents * p) / 100);

export function priceOrder(index, { lines, fulfilment = "pickup", tipPct = 0 }) {
  const errors = [];
  const priced = [];
  const merged = new Map();
  (Array.isArray(lines) ? lines : []).forEach((line) => {
    const item = index.get(line?.id);
    const qty = line?.qty;
    if (!item) errors.push(`Unknown item ${line?.id}.`);
    else if (!Number.isInteger(qty) || qty < 1) errors.push(`Quantity for ${item.name} must be between 1 and ${MAX_QTY}.`);
    else merged.set(item.id, (merged.get(item.id) || 0) + qty);
  });
  merged.forEach((qty, id) => {
    const item = index.get(id);
    if (qty > MAX_QTY) errors.push(`Quantity for ${item.name} must be between 1 and ${MAX_QTY}.`);
    else priced.push({ id, name: item.name, qty, unitCents: item.priceCents, totalCents: item.priceCents * qty, raw: item.raw });
  });
  if (!priced.length && !errors.length) errors.push("Your cart is empty.");
  if (!TIP_OPTIONS.includes(tipPct)) errors.push("Choose a tip from the options.");
  if (!Object.hasOwn(FULFILMENT_LABELS, fulfilment)) errors.push("Choose how you'd like to get your order.");
  if (fulfilment === "delivery" && !DELIVERY.enabled) errors.push("Delivery isn't available right now.");
  if (fulfilment === "amazon" && !WAREHOUSE_DELIVERY.enabled) errors.push("Amazon warehouse delivery isn't available right now.");

  const taxableCents = priced.filter((l) => !l.raw).reduce((n, l) => n + l.totalCents, 0);
  const zeroRatedCents = priced.filter((l) => l.raw).reduce((n, l) => n + l.totalCents, 0);
  const subtotalCents = taxableCents + zeroRatedCents;
  const taxableDiscount = pct(taxableCents, DIRECT_DISCOUNT_PCT);
  const discountCents = taxableDiscount + pct(zeroRatedCents, DIRECT_DISCOUNT_PCT);
  const deliveryFeeCents = fulfilment === "delivery" ? DELIVERY.feeCents : 0;
  if (fulfilment === "delivery" && priced.length && subtotalCents < DELIVERY.minimumCents) {
    errors.push(`Delivery orders start at ${formatCents(DELIVERY.minimumCents)} before the discount.`);
  }
  const taxCents = pct(taxableCents - taxableDiscount + deliveryFeeCents, HST_PCT);
  const tipCents = pct(subtotalCents - discountCents, tipPct);
  const totalCents = subtotalCents - discountCents + deliveryFeeCents + taxCents + tipCents;

  return {
    lines: priced, subtotalCents, discountCents, deliveryFeeCents, taxCents, tipPct, tipCents, totalCents,
    zeroRatedCents, errors,
  };
}
