import { api, isDemo, session } from "./api.js?v=6e65618168";
import { cart } from "./cart.js?v=6e65618168";
import { DEMO_NUMBERS } from "./config.js?v=6e65618168";
import { formatCents, formatPhone, formatTime, normalizePhone, slotLabel, DIRECT_DISCOUNT_PCT, HST_PCT, RESTAURANT, STATUS_LABELS } from "./rules.js?v=6e65618168";

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === false || v === undefined || v === null) return;
    if (k === "text") node.textContent = v;
    else if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  });
  children.forEach((c) => c !== null && c !== undefined && c !== false && node.append(c));
  return node;
}

export function describeWhen(order) {
  if (order.when.asap) return "As soon as possible, ready in about 20 to 30 minutes";
  return slotLabel(new Date(order.when.at));
}

export function describeFulfilment(order) {
  if (order.fulfilment.type === "pickup") return `Pickup at ${RESTAURANT.address}`;
  const a = order.fulfilment.address;
  return `Delivery to ${[a.line1, a.line2].filter(Boolean).join(", ")}, ${a.postal}`;
}

export function describePayment(order) {
  const { method, status } = order.payment;
  if (status === "paid") return method === "online" ? (isDemo ? "Paid online (demo, no card charged)" : "Paid online") : "Paid";
  if (status === "pending") return "Waiting for card payment";
  if (status === "refunded") return isDemo ? "Refunded to card (demo)" : "Refunded to your card";
  if (status === "refund_failed") return "Refund in progress. We'll be in touch.";
  return order.fulfilment.type === "delivery" ? "Pay at the door" : "Pay at pickup";
}

export const statusLabel = (order) => STATUS_LABELS[order.status];

export const formatDateTime = (iso) => `${new Intl.DateTimeFormat("en-CA", {
  timeZone: RESTAURANT.timeZone, month: "short", day: "numeric",
}).format(new Date(iso))}, ${formatTime(new Date(iso))}`;

export function renderBill(bill) {
  const items = bill.lines.reduce((n, l) => n + l.qty, 0);
  const row = (label, value, cls) => el("div", { class: `bill-row ${cls || ""}` }, [el("dt", { text: label }), el("dd", { text: value })]);
  const rows = [
    row(`Subtotal, ${items} ${items === 1 ? "item" : "items"}`, formatCents(bill.subtotalCents)),
    row(`Direct order discount, ${DIRECT_DISCOUNT_PCT}% off`, `−${formatCents(bill.discountCents)}`, "bill-save"),
    bill.deliveryFeeCents ? row("Delivery fee", formatCents(bill.deliveryFeeCents)) : null,
    row(`HST, ${HST_PCT}%`, formatCents(bill.taxCents)),
    bill.tipCents ? row(`Tip, ${bill.tipPct}%`, formatCents(bill.tipCents)) : null,
    row("Total", formatCents(bill.totalCents), "bill-total"),
  ];
  const list = el("dl", { class: "bill" }, rows);
  if (!bill.zeroRatedCents) return list;
  return el("div", {}, [list, el("p", { class: "bill-note", text: "Raw meat from the counter is a basic grocery, so no HST is charged on it." })]);
}

export function renderLines(bill) {
  return el("ul", { class: "line-list" }, bill.lines.map((l) => el("li", {}, [
    el("span", { class: "line-qty", text: `${l.qty}×` }),
    el("span", { class: "line-name", text: l.name }),
    el("span", { class: "line-price", text: formatCents(l.totalCents) }),
  ])));
}

export function demoBanner(text) {
  if (!isDemo) return null;
  return el("div", { class: "demo-banner", role: "note" }, [
    el("strong", { text: "Preview mode. " }),
    el("span", { text: text || `Orders placed here are not sent to the kitchen and no card is charged. To order for real, call ${RESTAURANT.phoneDisplay}.` }),
  ]);
}

export async function currentCustomer() {
  if (!session.token) return null;
  try {
    return (await api.me()).customer;
  } catch (err) {
    if (err.status === 401) return null;
    throw err;
  }
}

export async function wireAccountLink() {
  const link = document.querySelector("[data-account-link]");
  if (!link) return;
  const customer = await currentCustomer().catch(() => null);
  link.textContent = customer ? (customer.name ? `Hi, ${customer.name.split(" ")[0]}` : "Account") : "Sign in";
}

export function wireCartLink() {
  const link = document.querySelector("[data-cart-link]");
  if (!link) return;
  const update = () => {
    const count = cart.count();
    link.querySelector("[data-cart-count]").textContent = count;
    link.classList.toggle("has-items", count > 0);
  };
  update();
  cart.subscribe(update);
}

export function mountSignIn(container, { heading, intro, onSignedIn, staff = false }) {
  const error = el("p", { class: "form-error", role: "alert" });
  const title = el("h2", { class: "panel-title", text: heading, tabindex: "-1" });
  const body = el("div");
  container.replaceChildren(title, intro ? el("p", { class: "panel-intro", text: intro }) : null, body, error);

  let phone = "";
  let timer;

  function showError(message) {
    error.textContent = message || "";
  }

  function phoneStep() {
    clearInterval(timer);
    showError();
    const input = el("input", {
      id: "signin-phone", type: "tel", inputmode: "tel", autocomplete: "tel-national", required: true,
      placeholder: "(519) 555-0123", value: phone ? formatPhone(phone) : "",
    });
    const submit = el("button", { class: "btn btn-red", type: "submit", text: "Text me a code" });
    const form = el("form", { class: "signin", novalidate: true }, [
      el("label", { class: "field" }, [el("span", { text: "Mobile number" }), input]),
      el("p", { class: "field-hint", text: "We'll text you a 6-digit code. No password needed. Message and data rates may apply." }),
      isDemo ? el("p", { class: "demo-hint" }, [
        el("strong", { text: "Demo number: " }),
        `${formatPhone(staff ? DEMO_NUMBERS.staff : DEMO_NUMBERS.customer)} with code ${DEMO_NUMBERS.code}.`,
      ]) : null,
      submit,
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const normalized = normalizePhone(input.value);
      if (!normalized) {
        showError("Enter a 10-digit Canadian mobile number, like (519) 555-0123.");
        input.focus();
        return;
      }
      submit.disabled = true;
      showError();
      try {
        const res = await api.startOtp(normalized);
        phone = res.phone;
        codeStep(res);
      } catch (err) {
        showError(err.message);
        submit.disabled = false;
      }
    });
    body.replaceChildren(form);
    input.focus();
  }

  function codeStep(res) {
    showError();
    const input = el("input", {
      id: "signin-code", type: "text", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6",
      pattern: "[0-9]{6}", required: true, class: "code-input",
    });
    const submit = el("button", { class: "btn btn-red", type: "submit", text: "Verify and continue" });
    const resend = el("button", { class: "link-button", type: "button" });
    const change = el("button", { class: "link-button", type: "button", text: "Use a different number", onclick: phoneStep });
    let wait = res.resendInSeconds ?? 30;
    const tick = () => {
      resend.disabled = wait > 0;
      resend.textContent = wait > 0 ? `Resend code in ${wait}s` : "Resend code";
      wait -= 1;
      if (wait < -1) clearInterval(timer);
    };
    clearInterval(timer);
    tick();
    timer = setInterval(tick, 1000);
    resend.addEventListener("click", async () => {
      resend.disabled = true;
      try {
        codeStep(await api.startOtp(phone));
      } catch (err) {
        showError(err.message);
        resend.disabled = false;
      }
    });

    const form = el("form", { class: "signin", novalidate: true }, [
      el("p", { class: "field-hint", text: `Enter the code we texted to ${formatPhone(phone)}.` }),
      res.devCode ? el("p", { class: "demo-hint" }, [el("strong", { text: "Preview mode: " }), `no text is sent. Your code is ${res.devCode}.`]) : null,
      el("label", { class: "field" }, [el("span", { text: "6-digit code" }), input]),
      submit,
      el("div", { class: "signin-links" }, [resend, change]),
    ]);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const code = input.value.replace(/\D/g, "");
      if (code.length !== 6) {
        showError("Enter all 6 digits of the code.");
        input.focus();
        return;
      }
      submit.disabled = true;
      showError();
      try {
        const { customer } = await api.verifyOtp(phone, code);
        clearInterval(timer);
        onSignedIn(customer);
      } catch (err) {
        showError(err.message);
        submit.disabled = false;
        input.select();
      }
    });
    input.addEventListener("input", () => {
      if (input.value.replace(/\D/g, "").length === 6) form.requestSubmit();
    });
    body.replaceChildren(form);
    input.focus();
  }

  phoneStep();
}

export function wireYear() {
  const year = document.querySelector("[data-year]");
  if (year) year.textContent = new Date().getFullYear();
}
