import { api, isDemo, loadMenu } from "./api.js?v=23660a1f26";
import { cart } from "./cart.js?v=23660a1f26";
import {
  indexMenu, priceOrder, formatCents, formatPhone, orderSlots, slotLabel, asapAvailable, normalizePostal,
  inDeliveryZone, DELIVERY, TIP_OPTIONS,
} from "./rules.js?v=23660a1f26";
import { el, renderBill, renderLines, demoBanner, currentCustomer, mountSignIn, wireAccountLink, wireYear } from "./ui.js?v=23660a1f26";

const $ = (sel) => document.querySelector(sel);
const form = $("[data-checkout-form]");
const placeBtn = $("[data-place]");
const placeError = $("[data-place-error]");
const accountPanel = $("[data-account-panel]");
let index;
let customer;
let lastBill;
let serverBill = null;

function value(name) {
  const field = form.elements[name];
  return field instanceof RadioNodeList ? field.value : field.value.trim();
}

function setPlaceError(message, focus = false) {
  placeError.textContent = message || "";
  if (message && focus) placeError.focus();
}

function clearFieldErrors() {
  form.querySelectorAll(".field-error").forEach((n) => n.remove());
  form.querySelectorAll("[aria-invalid]").forEach((n) => {
    n.removeAttribute("aria-invalid");
  });
}

function showFieldError(name, message) {
  const field = form.elements[name];
  const id = `error-${name}`;
  field.closest(".field").append(el("span", { class: "form-error field-error", id, text: message }));
  field.setAttribute("aria-invalid", "true");
  field.focus();
}

function currentBill() {
  return priceOrder(index, { lines: cart.lines, fulfilment: value("fulfilment"), tipPct: Number(value("tip")) });
}

function renderSummary() {
  const bill = serverBill || currentBill();
  lastBill = bill;
  $("[data-summary-lines]").replaceChildren(renderLines(bill));
  $("[data-summary-bill]").replaceChildren(renderBill(bill));
  if (!customer) {
    placeBtn.disabled = true;
    placeBtn.textContent = "Sign in to place your order";
    return;
  }
  placeBtn.disabled = false;
  placeBtn.textContent = `${isDemo ? "Place demo order" : "Place order"}, ${formatCents(bill.totalCents)}`;
  if (bill.errors?.length) setPlaceError(bill.errors[0]);
  else if (placeError.textContent && !placeError.dataset.sticky) setPlaceError();
}

function renderAccount() {
  accountPanel.replaceChildren(
    el("h2", { class: "panel-title", text: "Signed in", tabindex: "-1" }),
    el("p", { class: "signed-in" }, [
      el("span", { text: `${customer.name || "New customer"}, ${formatPhone(customer.phone)}` }),
      el("button", {
        class: "link-button", type: "button", text: "Not you? Sign out",
        onclick: async () => {
          await api.signOut();
          customer = null;
          form.hidden = true;
          startSignIn();
          renderSummary();
          wireAccountLink();
        },
      }),
    ]),
  );
}

function startSignIn() {
  mountSignIn(accountPanel, {
    heading: "Sign in with your phone",
    intro: "We'll text your order updates to this number.",
    onSignedIn(signedIn) {
      customer = signedIn;
      showForm();
      wireAccountLink();
      accountPanel.querySelector(".panel-title").focus();
    },
  });
}

function fillSavedAddresses() {
  const select = $("[data-saved-address]");
  const saved = customer.addresses || [];
  $("[data-saved-wrap]").hidden = saved.length === 0;
  select.replaceChildren(
    ...saved.map((a) => el("option", { value: a.id, text: `${a.label || a.line1}, ${a.postal}` })),
    el("option", { value: "", text: "Use a new address" }),
  );
  if (saved.length) applySaved(saved[0].id);
}

function applySaved(id) {
  const a = (customer.addresses || []).find((x) => x.id === id);
  ["line1", "line2", "postal", "instructions"].forEach((k) => { form.elements[k].value = a ? a[k] : ""; });
  form.elements.saveAddress.checked = !a;
  form.elements.saveAddress.closest(".check").hidden = Boolean(a);
  updateZone();
}

function showForm() {
  renderAccount();
  form.hidden = false;
  if (!form.elements.name.value) form.elements.name.value = customer.name || "";
  fillSavedAddresses();
  renderSummary();
}

function updateZone() {
  const hint = $("[data-zone-hint]");
  const postal = normalizePostal(form.elements.postal.value);
  if (!form.elements.postal.value.trim()) hint.textContent = `We deliver to postal codes starting with ${DELIVERY.postalPrefixes.join(", ")}.`;
  else if (!postal) hint.textContent = "Enter a postal code like N6E 1M2.";
  else hint.textContent = inDeliveryZone(postal) ? "Good news, we deliver there." : "That's outside our delivery area. Choose pickup, or call us to ask.";
}

function updateFulfilment() {
  const delivery = value("fulfilment") === "delivery";
  $("[data-address]").hidden = !delivery;
  $("[data-in-person-title]").textContent = delivery ? "Pay at the door" : "Pay at pickup";
  renderSummary();
}

function fillSlots() {
  const now = new Date();
  const asap = asapAvailable(now);
  const asapInput = form.querySelector('input[name="when"][value="asap"]');
  asapInput.disabled = !asap;
  $("[data-asap-choice]").classList.toggle("is-disabled", !asap);
  $("[data-asap-text]").textContent = asap ? "Ready in about 20 to 30 minutes" : "Not available right now. We're closed or about to close.";
  if (!asap) form.querySelector('input[name="when"][value="later"]').checked = true;
  const select = $("[data-slots]");
  const current = select.value;
  select.replaceChildren(...orderSlots(now).map((d) => el("option", { value: d.toISOString(), text: slotLabel(d, now) })));
  if ([...select.options].some((o) => o.value === current)) select.value = current;
  $("[data-slot-wrap]").hidden = value("when") !== "later";
}

function fillTips() {
  $("[data-tips]").replaceChildren(...TIP_OPTIONS.map((p, i) => el("label", { class: "tip" }, [
    el("input", { type: "radio", name: "tip", value: String(p), checked: i === 0 }),
    el("span", { text: p ? `${p}%` : "No tip" }),
  ])));
}

function validate() {
  if (!value("name")) return ["Add your name so we know whose order it is.", "name"];
  if (value("fulfilment") === "delivery") {
    if (!value("line1")) return ["Add a street address for delivery.", "line1"];
    if (!normalizePostal(value("postal"))) return ["Enter a postal code like N6E 1M2.", "postal"];
    if (!inDeliveryZone(value("postal"))) return ["That postal code is outside our delivery area. Choose pickup instead.", "postal"];
  }
  if (value("when") === "later" && !value("slot")) return ["Pick a time for your order.", "slot"];
  const bill = currentBill();
  if (bill.errors.length) return [bill.errors[0]];
  return null;
}

async function saveAddressIfAsked() {
  if (value("fulfilment") !== "delivery" || !form.elements.saveAddress.checked || value("savedAddress")) return;
  const address = { label: "", line1: value("line1"), line2: value("line2"), postal: normalizePostal(value("postal")), instructions: value("instructions") };
  await api.updateMe({ addresses: [...(customer.addresses || []), address].slice(-5) }).catch(() => {});
}

async function placeOrder(e) {
  e.preventDefault();
  delete placeError.dataset.sticky;
  clearFieldErrors();
  const problem = validate();
  if (problem) {
    setPlaceError();
    if (problem[1]) showFieldError(problem[1], problem[0]);
    else setPlaceError(problem[0], true);
    return;
  }
  const delivery = value("fulfilment") === "delivery";
  const payload = {
    name: value("name"),
    lines: cart.lines,
    fulfilment: delivery
      ? { type: "delivery", address: { line1: value("line1"), line2: value("line2"), postal: normalizePostal(value("postal")), instructions: value("instructions") } }
      : { type: "pickup" },
    when: value("when") === "asap" ? { asap: true } : { asap: false, at: value("slot") },
    payment: { method: value("payment") },
    tipPct: Number(value("tip")),
    note: value("note"),
    expectedTotalCents: lastBill.totalCents,
    returnUrl: new URL("order.html", location.href).href,
  };
  placeBtn.disabled = true;
  placeBtn.textContent = "Placing your order";
  setPlaceError();
  try {
    const { order, checkoutUrl } = await api.createOrder(payload);
    await saveAddressIfAsked();
    cart.clear();
    location.href = checkoutUrl || `order.html?id=${encodeURIComponent(order.id)}&placed=1`;
  } catch (err) {
    if (err.status === 401) {
      customer = null;
      form.hidden = true;
      startSignIn();
    }
    if (err.status === 409 || err.status === 422) fillSlots();
    serverBill = err.status === 409 && err.data?.bill ? err.data.bill : null;
    renderSummary();
    placeError.dataset.sticky = "1";
    setPlaceError(err.message, true);
  }
}

async function init() {
  wireYear();
  wireAccountLink();
  const banner = demoBanner();
  if (banner) $("[data-demo]").replaceChildren(banner);
  try {
    index = indexMenu(await loadMenu());
  } catch (err) {
    $("[data-empty]").hidden = false;
    $("[data-empty] h2").textContent = "The menu didn't load";
    $("[data-empty] p").textContent = err.message;
    $("[data-empty] a").hidden = true;
    return;
  }
  cart.prune(index);
  if (!cart.count()) {
    $("[data-empty]").hidden = false;
    return;
  }
  $("[data-checkout]").hidden = false;
  $("[data-delivery-terms]").textContent = `${formatCents(DELIVERY.feeCents)} fee, ${formatCents(DELIVERY.minimumCents)} minimum, south and central London`;
  $("[data-online-text]").textContent = isDemo ? "Preview mode, no card is charged" : "Secure checkout with Stripe";
  const { onlinePayments } = await api.settings().catch(() => ({ onlinePayments: false }));
  if (!onlinePayments) {
    form.querySelector('input[name="payment"][value="online"]').closest(".choice").hidden = true;
    form.querySelector('input[name="payment"][value="in_person"]').checked = true;
  }
  fillTips();
  fillSlots();
  setInterval(fillSlots, 60000);

  form.addEventListener("input", clearFieldErrors);
  form.addEventListener("change", (e) => {
    serverBill = null;
    if (e.target.name === "fulfilment") updateFulfilment();
    else if (e.target.name === "when") $("[data-slot-wrap]").hidden = value("when") !== "later";
    else if (e.target.name === "savedAddress") applySaved(e.target.value);
    else renderSummary();
  });
  form.elements.postal.addEventListener("input", updateZone);
  form.addEventListener("submit", placeOrder);
  cart.subscribe(() => {
    serverBill = null;
    if (!cart.count()) location.reload();
    else renderSummary();
  });

  customer = await currentCustomer().catch(() => null);
  if (customer) showForm();
  else startSignIn();
  updateFulfilment();
  updateZone();
}

init();
