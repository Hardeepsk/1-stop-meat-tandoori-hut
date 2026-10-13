import { api, isDemo, onDemoChange } from "./api.js";
import { cart } from "./cart.js";
import { RESTAURANT, isActiveStatus } from "./rules.js";
import {
  el, renderBill, renderLines, demoBanner, currentCustomer, mountSignIn, wireAccountLink, wireYear,
  describeWhen, describeFulfilment, describePayment, statusLabel, formatDateTime,
} from "./ui.js";

const view = document.querySelector("[data-order-view]");
const params = new URLSearchParams(location.search);
const id = params.get("id") || params.get("order");
let poll;

function steps(order) {
  const last = order.fulfilment.type === "delivery" ? "out_for_delivery" : "ready";
  return ["received", "accepted", "preparing", last, "completed"];
}

function renderProgress(order) {
  if (order.status === "cancelled") {
    return el("p", { class: "order-cancelled", text: "This order was cancelled. If you paid online, the refund goes back to your card." });
  }
  const list = steps(order);
  const at = list.indexOf(order.status);
  return el("ol", { class: "progress" }, list.map((status, i) => el("li", {
    class: i < at ? "is-done" : i === at ? "is-current" : "",
    "aria-current": i === at ? "step" : false,
  }, [el("span", { text: statusLabel({ status }) })])));
}

function render(order) {
  const notices = [];
  if (params.get("placed") === "1") {
    notices.push(el("div", { class: "notice notice-ok" }, [
      el("strong", { text: `Thanks${order.customerName ? `, ${order.customerName.split(" ")[0]}` : ""}. Your order is in.` }),
      el("span", { text: isDemo ? " In preview mode nothing is sent to the kitchen." : " We'll text you when it's ready." }),
    ]));
  }
  if (params.get("cancelled") === "1" && order.payment.status !== "paid") {
    notices.push(el("div", { class: "notice notice-warn" }, [
      el("strong", { text: "Your card payment wasn't finished. " }),
      el("span", { text: `Your order is saved. Pay when you pick it up, or call ${RESTAURANT.phoneDisplay}.` }),
    ]));
  }
  if (isDemo && isActiveStatus(order.status)) {
    notices.push(el("p", { class: "demo-hint" }, [
      el("strong", { text: "Demo: " }),
      "open the ",
      el("a", { href: "staff.html", target: "_blank", rel: "noopener", text: "kitchen view" }),
      " in another tab and sign in as staff to move this order along. This page updates by itself.",
    ]));
  }

  const actions = [];
  if (order.status === "received") {
    actions.push(el("button", {
      class: "btn btn-ghost-dark", type: "button", text: "Cancel order",
      onclick: async (e) => {
        if (!confirm(`Cancel order ${order.number}?`)) return;
        e.currentTarget.disabled = true;
        try {
          render((await api.cancelOrder(order.id)).order);
        } catch (err) {
          alert(err.message);
          load();
        }
      },
    }));
  }
  actions.push(el("button", {
    class: "btn btn-red", type: "button", text: "Order this again",
    onclick: () => {
      cart.replace(order.bill.lines);
      location.href = "checkout.html";
    },
  }));
  actions.push(el("a", { class: "btn btn-ghost-dark", href: `tel:${RESTAURANT.phone}`, text: `Call ${RESTAURANT.phoneDisplay}` }));

  view.replaceChildren(
    ...notices,
    el("div", { class: "order-head" }, [
      el("p", { class: "order-kicker", text: `Placed ${formatDateTime(order.createdAt)}` }),
      el("h1", { text: `Order ${order.number}` }),
      el("p", { class: `status-pill status-${order.status}`, text: statusLabel(order) }),
    ]),
    renderProgress(order),
    el("div", { class: "order-grid" }, [
      el("section", { class: "panel" }, [
        el("h2", { class: "panel-title", text: "Details" }),
        el("dl", { class: "facts" }, [
          ["When", describeWhen(order)],
          [order.fulfilment.type === "delivery" ? "Delivery" : "Pickup", describeFulfilment(order).replace(/^(Pickup at|Delivery to) /, "")],
          ["Payment", describePayment(order)],
          order.note ? ["Note", order.note] : null,
        ].filter(Boolean).map(([k, v]) => el("div", {}, [el("dt", { text: k }), el("dd", { text: v })]))),
      ]),
      el("section", { class: "panel" }, [
        el("h2", { class: "panel-title", text: "Bill" }),
        renderLines(order.bill),
        renderBill(order.bill),
      ]),
    ]),
    el("div", { class: "order-actions" }, actions),
  );
  if (!isActiveStatus(order.status)) clearInterval(poll);
}

async function load() {
  try {
    render((await api.getOrder(id)).order);
  } catch (err) {
    clearInterval(poll);
    if (err.status === 401) return signIn();
    view.replaceChildren(el("div", { class: "panel empty-state" }, [
      el("h1", { class: "panel-title", text: "We couldn't open this order" }),
      el("p", { text: err.message }),
      el("a", { class: "btn btn-red", href: "account.html", text: "See your orders" }),
    ]));
  }
}

function signIn() {
  const panel = el("section", { class: "panel" });
  view.replaceChildren(panel);
  mountSignIn(panel, {
    heading: "Sign in to see your order",
    intro: "Use the phone number you ordered with.",
    onSignedIn: start,
  });
}

function start() {
  load();
  clearInterval(poll);
  poll = setInterval(load, isDemo ? 4000 : 15000);
}

async function init() {
  wireYear();
  wireAccountLink();
  const banner = demoBanner();
  if (banner) document.querySelector("[data-demo]").replaceChildren(banner);
  if (!id) {
    location.replace("account.html");
    return;
  }
  const customer = await currentCustomer().catch(() => null);
  if (!customer) return signIn();
  onDemoChange(load);
  start();
}

init();
