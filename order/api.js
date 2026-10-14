import { API_BASE, DEMO_NUMBERS } from "./config.js?v=6e65618168";
import {
  priceOrder, indexMenu, normalizePhone, normalizePostal, inDeliveryZone, asapAvailable, isValidSlot,
  nextStatuses, isActiveStatus, formatCents, STATUS_LABELS,
} from "./rules.js?v=6e65618168";

export const isDemo = !API_BASE;

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const SESSION_KEY = document.documentElement.dataset.session === "staff" ? "th.staff-session" : "th.session";
const memory = new Map();
const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return memory.get(key) ?? null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { memory.set(key, value); }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { memory.delete(key); }
  },
};

export const session = {
  get token() { return storage.get(SESSION_KEY); },
  set(token) { storage.set(SESSION_KEY, token); },
  clear() { storage.remove(SESSION_KEY); },
};

let menuPromise;
export function loadMenu() {
  menuPromise ??= fetch("data/menu.json?v=6e65618168").then((res) => {
    if (!res.ok) throw new ApiError("The menu didn't load. Refresh the page.", res.status);
    return res.json();
  });
  return menuPromise;
}

function httpApi(base) {
  async function call(method, path, body) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (session.token) headers.Authorization = `Bearer ${session.token}`;
    let res;
    try {
      res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError("We couldn't reach the ordering service. Check your connection and try again.", 0);
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) session.clear();
    if (!res.ok) throw new ApiError(data.error || "Something went wrong. Try again.", res.status, data);
    return data;
  }
  return {
    settings: () => call("GET", "/settings"),
    startOtp: (phone) => call("POST", "/auth/otp/start", { phone }),
    async verifyOtp(phone, code) {
      const data = await call("POST", "/auth/otp/verify", { phone, code });
      session.set(data.token);
      return data;
    },
    async signOut() {
      await call("POST", "/auth/signout").catch(() => {});
      session.clear();
    },
    me: () => call("GET", "/me"),
    updateMe: (patch) => call("PATCH", "/me", patch),
    async deleteMe() {
      await call("DELETE", "/me");
      session.clear();
    },
    createOrder: (payload) => call("POST", "/orders", payload),
    listOrders: () => call("GET", "/orders"),
    getOrder: (id) => call("GET", `/orders/${encodeURIComponent(id)}`),
    cancelOrder: (id) => call("POST", `/orders/${encodeURIComponent(id)}/cancel`),
    staffOrders: (scope) => call("GET", `/staff/orders?scope=${scope}`),
    staffSetStatus: (id, status) => call("POST", `/staff/orders/${encodeURIComponent(id)}/status`, { status }),
    staffMarkPaid: (id) => call("POST", `/staff/orders/${encodeURIComponent(id)}/paid`),
  };
}

const DEMO_KEY = "th.demo.v1";

function demoApi() {
  const read = () => {
    try {
      return JSON.parse(storage.get(DEMO_KEY)) || { customers: {}, sessions: {}, codes: {}, orders: [] };
    } catch {
      return { customers: {}, sessions: {}, codes: {}, orders: [] };
    }
  };
  const write = (db) => storage.set(DEMO_KEY, JSON.stringify(db));
  const fail = (message, status = 422, data) => { throw new ApiError(message, status, data); };
  const randomId = () => crypto.randomUUID();
  const delay = () => new Promise((r) => setTimeout(r, 250));

  function currentCustomer(db) {
    const phone = db.sessions[session.token];
    const customer = phone && db.customers[phone];
    if (!customer) {
      session.clear();
      fail("Sign in to continue.", 401);
    }
    return customer;
  }

  function requireStaff(db) {
    const customer = currentCustomer(db);
    if (customer.role !== "staff") fail("This number isn't on the staff list.", 403);
    return customer;
  }

  function cleanAddresses(list) {
    return (Array.isArray(list) ? list : []).slice(0, 5).map((a) => ({
      id: a.id || randomId(),
      label: String(a.label || "").slice(0, 40),
      line1: String(a.line1 || "").slice(0, 120),
      line2: String(a.line2 || "").slice(0, 60),
      postal: normalizePostal(a.postal) || "",
      instructions: String(a.instructions || "").slice(0, 200),
    }));
  }

  function findOrder(db, id, customer) {
    const order = db.orders.find((o) => o.id === id);
    if (!order || (customer.role !== "staff" && order.customerId !== customer.id)) fail("We couldn't find that order.", 404);
    return order;
  }

  function setStatus(order, status) {
    if (status === "cancelled" && order.payment.method === "online" && order.payment.status === "paid") order.payment.status = "refunded";
    order.status = status;
    order.history.push({ status, at: new Date().toISOString() });
  }

  return {
    async settings() {
      return { onlinePayments: true };
    },
    async startOtp(input) {
      await delay();
      const phone = normalizePhone(input);
      if (!phone) fail("Enter a 10-digit Canadian mobile number, like (519) 555-0123.", 400);
      const db = read();
      const fixed = phone === DEMO_NUMBERS.customer || phone === DEMO_NUMBERS.staff;
      const code = fixed ? DEMO_NUMBERS.code : String(Math.floor(100000 + Math.random() * 900000));
      db.codes[phone] = { code, expires: Date.now() + 300000, tries: 0 };
      write(db);
      return { phone, resendInSeconds: 30, devCode: code };
    },
    async verifyOtp(input, code) {
      await delay();
      const phone = normalizePhone(input);
      const db = read();
      const entry = phone && db.codes[phone];
      if (!entry || entry.expires < Date.now()) fail("That code has expired. Send a new one.", 400);
      if (entry.code !== String(code).trim()) {
        entry.tries += 1;
        if (entry.tries >= 5) delete db.codes[phone];
        write(db);
        fail(entry.tries >= 5 ? "Too many wrong tries. Send a new code." : "That code doesn't match. Check the text and try again.", 400);
      }
      delete db.codes[phone];
      db.customers[phone] ??= {
        id: randomId(), phone, name: "", email: "", marketing: false, addresses: [],
        role: phone === DEMO_NUMBERS.staff ? "staff" : "customer", createdAt: new Date().toISOString(),
      };
      const token = randomId();
      db.sessions[token] = phone;
      write(db);
      session.set(token);
      return { token, customer: db.customers[phone] };
    },
    async signOut() {
      const db = read();
      delete db.sessions[session.token];
      write(db);
      session.clear();
    },
    async me() {
      return { customer: currentCustomer(read()) };
    },
    async updateMe(patch) {
      await delay();
      const db = read();
      const customer = currentCustomer(db);
      if ("name" in patch) customer.name = String(patch.name).trim().slice(0, 80);
      if ("email" in patch) {
        const email = String(patch.email).trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter an email like name@example.com, or leave it blank.", 400);
        customer.email = email;
      }
      if ("marketing" in patch) customer.marketing = Boolean(patch.marketing);
      if ("addresses" in patch) customer.addresses = cleanAddresses(patch.addresses);
      write(db);
      return { customer };
    },
    async deleteMe() {
      const db = read();
      const customer = currentCustomer(db);
      db.orders.forEach((o) => {
        if (o.customerId === customer.id) {
          o.customerName = "Deleted customer";
          o.customerPhone = "";
        }
      });
      Object.keys(db.sessions).forEach((t) => { if (db.sessions[t] === customer.phone) delete db.sessions[t]; });
      delete db.customers[customer.phone];
      write(db);
      session.clear();
    },
    async createOrder(payload) {
      await delay();
      const menu = await loadMenu();
      const db = read();
      const customer = currentCustomer(db);
      if (payload.name) customer.name = String(payload.name).trim().slice(0, 80);
      if (!customer.name) fail("Add your name before ordering.");
      const type = payload.fulfilment?.type;
      const bill = priceOrder(indexMenu(menu), { lines: payload.lines, fulfilment: type, tipPct: payload.tipPct });
      if (bill.errors.length) fail(bill.errors[0]);
      let address;
      if (type === "delivery") {
        const a = payload.fulfilment.address || {};
        if (!String(a.line1 || "").trim()) fail("Add a street address for delivery.");
        if (!inDeliveryZone(a.postal)) fail("That postal code is outside our delivery area. Choose pickup instead.");
        address = cleanAddresses([a])[0];
        delete address.id;
        delete address.label;
      }
      const when = payload.when?.asap ? { asap: true } : { asap: false, at: payload.when?.at };
      if (when.asap && !asapAvailable()) fail("We're not taking ASAP orders right now. Pick a time.");
      if (!when.asap && !isValidSlot(when.at)) fail("That time isn't available. Pick another time.");
      const method = payload.payment?.method;
      if (method !== "online" && method !== "in_person") fail("Choose how you'd like to pay.");
      if (payload.expectedTotalCents !== bill.totalCents) {
        fail(`Your total changed to ${formatCents(bill.totalCents)}. Check it and place the order again.`, 409, { bill });
      }
      const now = new Date().toISOString();
      let number;
      do number = `TH-${Math.floor(1000 + Math.random() * 9000)}`; while (db.orders.some((o) => o.number === number));
      const order = {
        id: randomId(), number, customerId: customer.id, customerName: customer.name, customerPhone: customer.phone,
        status: "received", fulfilment: address ? { type, address } : { type }, when,
        payment: { method, status: method === "online" ? "paid" : "unpaid" },
        note: String(payload.note || "").slice(0, 300), bill, history: [{ status: "received", at: now }], createdAt: now,
      };
      db.orders.unshift(order);
      write(db);
      return { order };
    },
    async listOrders() {
      const db = read();
      const customer = currentCustomer(db);
      return { orders: db.orders.filter((o) => o.customerId === customer.id) };
    },
    async getOrder(id) {
      const db = read();
      return { order: findOrder(db, id, currentCustomer(db)) };
    },
    async cancelOrder(id) {
      const db = read();
      const order = findOrder(db, id, currentCustomer(db));
      if (order.status !== "received") fail(`This order is already ${STATUS_LABELS[order.status].toLowerCase()}. Call us to change it.`, 409);
      setStatus(order, "cancelled");
      write(db);
      return { order };
    },
    async staffOrders(scope) {
      const db = read();
      requireStaff(db);
      const today = new Date().toDateString();
      const orders = db.orders.filter((o) => {
        if (scope === "active") return isActiveStatus(o.status);
        if (scope === "today") return new Date(o.createdAt).toDateString() === today;
        return true;
      });
      return { orders };
    },
    async staffSetStatus(id, status) {
      const db = read();
      const order = findOrder(db, id, requireStaff(db));
      if (!nextStatuses(order).includes(status)) fail("That step isn't allowed for this order.", 409);
      setStatus(order, status);
      write(db);
      return { order };
    },
    async staffMarkPaid(id) {
      const db = read();
      const order = findOrder(db, id, requireStaff(db));
      order.payment = { method: "in_person", status: "paid" };
      write(db);
      return { order };
    },
  };
}

export const api = isDemo ? demoApi() : httpApi(API_BASE.replace(/\/$/, ""));

export function onDemoChange(callback) {
  if (!isDemo) return;
  window.addEventListener("storage", (e) => { if (e.key === DEMO_KEY) callback(); });
}
