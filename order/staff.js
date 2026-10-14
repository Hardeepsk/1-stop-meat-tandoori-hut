import { api, isDemo, onDemoChange } from "./api.js?v=145c4863ef";
import { formatCents, formatPhone, nextStatuses } from "./rules.js?v=145c4863ef";
import { el, demoBanner, currentCustomer, mountSignIn, wireYear, describeWhen, describePayment, statusLabel, formatDateTime } from "./ui.js?v=145c4863ef";

const view = document.querySelector("[data-staff-view]");
const tools = document.querySelector("[data-staff-tools]");
const scopeButtons = [...document.querySelectorAll("[data-scope-value]")];
let scope = "active";
let poll;
let seen;
const loadError = el("p", { class: "form-error", role: "alert" });

const ACTION_LABELS = {
  accepted: "Accept",
  preparing: "Start preparing",
  ready: "Mark ready",
  out_for_delivery: "Out for delivery",
  completed: "Complete",
  cancelled: "Cancel",
};

const COLUMNS = [
  { title: "New", statuses: ["received"] },
  { title: "In the kitchen", statuses: ["accepted", "preparing"] },
  { title: "Ready or on the way", statuses: ["ready", "out_for_delivery"] },
  { title: "Done", statuses: ["completed", "cancelled"] },
];

function chime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {}
}

async function act(run, button) {
  button.disabled = true;
  try {
    await run();
    await load();
  } catch (err) {
    alert(err.message);
    await load();
  }
}

function card(order) {
  const actions = nextStatuses(order).map((status) => el("button", {
    type: "button",
    class: `btn btn-small ${status === "cancelled" ? "btn-ghost-dark btn-danger" : "btn-red"}`,
    text: ACTION_LABELS[status],
    onclick: (e) => {
      if (status === "cancelled" && !confirm(`Cancel order ${order.number}? The customer gets a text.`)) return;
      act(() => api.staffSetStatus(order.id, status), e.currentTarget);
    },
  }));
  if ((order.payment.status === "unpaid" || order.payment.status === "pending") && order.status !== "cancelled") {
    actions.push(el("button", {
      type: "button", class: "btn btn-small btn-ghost-dark", text: "Mark paid",
      onclick: (e) => act(() => api.staffMarkPaid(order.id), e.currentTarget),
    }));
  }
  const a = order.fulfilment.address;
  return el("article", { class: `ticket ticket-${order.status}`, "aria-label": `Order ${order.number}` }, [
    el("header", { class: "ticket-head" }, [
      el("strong", { class: "ticket-number", text: order.number }),
      el("span", { class: `status-pill status-${order.status}`, text: statusLabel(order) }),
    ]),
    el("p", { class: "ticket-when" }, [
      el("strong", { text: order.fulfilment.type === "delivery" ? "Delivery" : "Pickup" }),
      `, ${describeWhen(order)}`,
    ]),
    el("p", { class: "ticket-placed", text: `Placed ${formatDateTime(order.createdAt)}` }),
    el("p", { class: "ticket-customer" }, [
      el("span", { text: `${order.customerName}` }),
      order.customerPhone ? el("a", { href: `tel:${order.customerPhone}`, text: formatPhone(order.customerPhone) }) : null,
    ]),
    a ? el("p", { class: "ticket-address", text: [a.line1, a.line2, a.postal, a.instructions].filter(Boolean).join(", ") }) : null,
    el("ul", { class: "ticket-items" }, order.bill.lines.map((l) => el("li", {}, [el("b", { text: `${l.qty}×` }), ` ${l.name}`]))),
    order.note ? el("p", { class: "ticket-note", text: order.note }) : null,
    el("p", { class: "ticket-total" }, [el("strong", { text: formatCents(order.bill.totalCents) }), ` ${describePayment(order)}`]),
    actions.length ? el("div", { class: "ticket-actions" }, actions) : null,
  ]);
}

function render(orders) {
  const columns = scope === "active" ? COLUMNS.slice(0, 3) : COLUMNS;
  const newCount = orders.filter((o) => o.status === "received").length;
  document.title = `${newCount ? `(${newCount} new) ` : ""}Kitchen orders | 1 Stop Meat & Tandoori Hut`;
  view.replaceChildren(el("div", { class: "board" }, columns.map((col) => {
    const list = orders.filter((o) => col.statuses.includes(o.status)).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    return el("section", { class: "board-col", "aria-label": col.title }, [
      el("h2", { class: "board-title" }, [col.title, el("span", { class: "board-count", text: String(list.length) })]),
      ...(list.length ? list.map(card) : [el("p", { class: "board-empty", text: "Nothing here" })]),
    ]);
  })));
}

async function load() {
  try {
    const { orders } = await api.staffOrders(scope);
    const fresh = orders.filter((o) => o.status === "received" && seen && !seen.has(o.id));
    seen = new Set(orders.map((o) => o.id));
    if (fresh.length) chime();
    loadError.textContent = "";
    render(orders);
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      clearInterval(poll);
      if (err.status === 403) await api.signOut();
      return signIn(err.status === 403 ? err.message : "");
    }
    loadError.textContent = err.message;
    if (!loadError.isConnected) view.prepend(loadError);
  }
}

function signIn(message) {
  tools.hidden = true;
  const panel = el("section", { class: "panel page-narrow-inner" });
  view.replaceChildren(panel);
  mountSignIn(panel, {
    heading: "Staff sign in",
    intro: message || "Use a phone number on the staff list.",
    staff: true,
    onSignedIn: start,
  });
}

function start() {
  tools.hidden = false;
  seen = undefined;
  load();
  clearInterval(poll);
  poll = setInterval(load, isDemo ? 3000 : 10000);
}

function setScope(btn) {
  scope = btn.dataset.scopeValue;
  scopeButtons.forEach((b) => {
    b.setAttribute("aria-checked", String(b === btn));
    b.tabIndex = b === btn ? 0 : -1;
  });
  load();
}

scopeButtons.forEach((btn, i) => {
  btn.tabIndex = i === 0 ? 0 : -1;
  btn.addEventListener("click", () => setScope(btn));
  btn.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = scopeButtons[(i + step + scopeButtons.length) % scopeButtons.length];
    setScope(next);
    next.focus();
  });
});

document.querySelector("[data-staff-signout]").addEventListener("click", async () => {
  clearInterval(poll);
  await api.signOut();
  signIn();
});

wireYear();
const banner = demoBanner("The kitchen view reads orders placed in this browser. Sign in with the staff demo number.");
if (banner) document.querySelector("[data-demo]").replaceChildren(banner);
onDemoChange(() => { if (!tools.hidden) load(); });
currentCustomer().catch(() => null).then((customer) => {
  if (customer?.role === "staff") start();
  else signIn(customer ? "You're signed in with a customer number. Sign in with a staff number." : "");
});
