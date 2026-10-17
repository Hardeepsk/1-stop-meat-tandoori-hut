import { api } from "./api.js?v=637464b1ea";
import { cart } from "./cart.js?v=637464b1ea";
import { formatCents, formatPhone, normalizePostal, isActiveStatus, DELIVERY } from "./rules.js?v=637464b1ea";
import { el, demoBanner, currentCustomer, mountSignIn, wireAccountLink, wireCartLink, wireYear, statusLabel, formatDateTime, fulfilmentLabel } from "./ui.js?v=637464b1ea";

const view = document.querySelector("[data-account-view]");
let customer;

function field(label, input) {
  return el("label", { class: "field" }, [el("span", {}, [label].flat()), input]);
}

function status(node, message, ok = true) {
  node.textContent = message;
  node.className = ok ? "form-ok" : "form-error";
}

function ordersPanel(orders) {
  const panel = el("section", { class: "panel", "aria-labelledby": "orders-title" }, [el("h2", { class: "panel-title", id: "orders-title", text: "Your orders" })]);
  if (!orders.length) {
    panel.append(el("p", { text: "No orders yet. Orders you place on this site show up here." }), el("a", { class: "btn btn-red", href: "./#menu", text: "Browse the menu" }));
    return panel;
  }
  panel.append(el("ul", { class: "order-list" }, orders.map((o) => el("li", { class: "order-row" }, [
    el("div", { class: "order-row-main" }, [
      el("a", { class: "order-row-number", href: `order.html?id=${encodeURIComponent(o.id)}`, text: o.number }),
      el("span", { class: `status-pill status-${o.status}`, text: statusLabel(o) }),
      el("span", { class: "order-row-meta", text: `${formatDateTime(o.createdAt)}, ${fulfilmentLabel(o)}, ${formatCents(o.bill.totalCents)}` }),
      el("span", { class: "order-row-items", text: o.bill.lines.map((l) => `${l.qty}× ${l.name}`).join(", ") }),
    ]),
    el("div", { class: "order-row-actions" }, [
      el("a", { class: `btn ${isActiveStatus(o.status) ? "btn-red" : "btn-ghost-dark"} btn-small`, href: `order.html?id=${encodeURIComponent(o.id)}`, text: isActiveStatus(o.status) ? "Track" : "View" }),
      el("button", {
        class: `btn ${isActiveStatus(o.status) ? "btn-ghost-dark" : "btn-red"} btn-small`, type: "button", text: "Order again",
        onclick: () => {
          cart.replace(o.bill.lines);
          location.href = "checkout.html";
        },
      }),
    ]),
  ]))));
  return panel;
}

function profilePanel() {
  const name = el("input", { name: "name", autocomplete: "name", maxlength: "80", value: customer.name });
  const email = el("input", { name: "email", type: "email", autocomplete: "email", maxlength: "120", value: customer.email });
  const marketing = el("input", { type: "checkbox", name: "marketing", checked: customer.marketing });
  const msg = el("p", { role: "status" });
  const form = el("form", { class: "stack", novalidate: true }, [
    el("p", { class: "field-static" }, [el("span", { text: "Mobile number" }), el("strong", { text: formatPhone(customer.phone) })]),
    field("Name", name),
    field(["Email ", el("span", { class: "optional", text: "optional, for receipts" })], email),
    el("label", { class: "check" }, [marketing, el("span", { text: "Text me deals and specials. You can stop any time by replying STOP." })]),
    el("button", { class: "btn btn-red", type: "submit", text: "Save profile" }),
    msg,
  ]);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      customer = (await api.updateMe({ name: name.value, email: email.value, marketing: marketing.checked })).customer;
      status(msg, "Profile saved.");
      wireAccountLink();
    } catch (err) {
      status(msg, err.message, false);
    }
  });
  return el("section", { class: "panel", "aria-labelledby": "profile-title" }, [el("h2", { class: "panel-title", id: "profile-title", text: "Profile" }), form]);
}

function addressesPanel() {
  const panel = el("section", { class: "panel", "aria-labelledby": "addr-title" });
  const msg = el("p", { role: "status" });

  async function save(addresses, done) {
    try {
      customer = (await api.updateMe({ addresses })).customer;
      status(msg, done);
      panel.replaceWith(addressesPanel());
    } catch (err) {
      status(msg, err.message, false);
    }
  }

  const list = customer.addresses.length
    ? el("ul", { class: "address-list" }, customer.addresses.map((a) => el("li", {}, [
      el("span", { text: [a.label, a.line1, a.line2, a.postal].filter(Boolean).join(", ") }),
      el("button", {
        class: "link-button", type: "button", text: "Remove", "aria-label": `Remove ${a.line1}`,
        onclick: () => save(customer.addresses.filter((x) => x.id !== a.id), "Address removed."),
      }),
    ])))
    : el("p", { text: "No saved addresses. Addresses you deliver to can be saved at checkout." });

  const label = el("input", { maxlength: "40", placeholder: "Home, Work" });
  const line1 = el("input", { autocomplete: "address-line1", maxlength: "120" });
  const line2 = el("input", { autocomplete: "address-line2", maxlength: "60" });
  const postal = el("input", { autocomplete: "postal-code", maxlength: "7", autocapitalize: "characters" });
  const instructions = el("input", { maxlength: "200", placeholder: "Side door, call on arrival" });
  const optional = (text) => [`${text} `, el("span", { class: "optional", text: "optional" })];
  const add = el("form", { class: "stack add-address", novalidate: true, hidden: customer.addresses.length >= 5 }, [
    el("h3", { class: "sub-title", text: "Add an address" }),
    field(optional("Label"), label),
    field("Street address", line1),
    el("div", { class: "field-row" }, [field(optional("Unit or buzzer"), line2), field("Postal code", postal)]),
    field(optional("Instructions for the driver"), instructions),
    el("button", { class: "btn btn-red", type: "submit", text: "Save address" }),
  ]);
  add.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!line1.value.trim()) return status(msg, "Add a street address for delivery.", false);
    if (!normalizePostal(postal.value)) return status(msg, "Enter a postal code like N6E 1M2.", false);
    save([...customer.addresses, { label: label.value, line1: line1.value, line2: line2.value, postal: normalizePostal(postal.value), instructions: instructions.value }], "Address saved.");
  });

  panel.append(el("h2", { class: "panel-title", id: "addr-title", text: "Saved addresses" }), list, add, msg);
  return panel;
}

function sessionPanel() {
  return el("section", { class: "panel", "aria-labelledby": "session-title" }, [
    el("h2", { class: "panel-title", id: "session-title", text: "Sign out or delete" }),
    el("div", { class: "order-actions" }, [
      el("button", {
        class: "btn btn-ghost-dark", type: "button", text: "Sign out",
        onclick: async () => {
          await api.signOut();
          start();
        },
      }),
      el("button", {
        class: "btn btn-ghost-dark btn-danger", type: "button", text: "Delete my account",
        onclick: async () => {
          if (!confirm("Delete your account? Your profile and saved addresses are removed. Past orders stay on file for tax records without your name or number.")) return;
          try {
            await api.deleteMe();
            start();
          } catch (err) {
            alert(err.message);
          }
        },
      }),
    ]),
  ]);
}

async function render() {
  const { orders } = await api.listOrders();
  view.replaceChildren(
    el("p", { class: "signed-in-as", text: `Signed in as ${customer.name || "a new customer"}, ${formatPhone(customer.phone)}` }),
    ordersPanel(orders),
    el("div", { class: "account-grid" }, [profilePanel(), DELIVERY.enabled && addressesPanel()]),
    sessionPanel(),
  );
}

async function start() {
  wireAccountLink();
  customer = await currentCustomer().catch(() => null);
  if (customer) return render();
  const panel = el("section", { class: "panel" });
  view.replaceChildren(panel);
  mountSignIn(panel, {
    heading: "Sign in with your phone",
    intro: `See your orders and reorder favourites${DELIVERY.enabled ? ", and save delivery addresses" : ""}. New here? Signing in creates your account.`,
    async onSignedIn(signedIn) {
      customer = signedIn;
      await render();
      wireAccountLink();
    },
  });
}

wireYear();
wireCartLink();
const banner = demoBanner("Accounts and orders here are stored only in this browser for the demo.");
if (banner) document.querySelector("[data-demo]").replaceChildren(banner);
start();
