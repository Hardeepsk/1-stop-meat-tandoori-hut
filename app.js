import { HOURS, DAY_NAMES, torontoNow, formatHour, money, indexMenu, priceOrder, formatCents, DIRECT_DISCOUNT_PCT, RESTAURANT } from "./order/rules.js?v=145c4863ef";
import { cart } from "./order/cart.js?v=145c4863ef";
import { loadMenu as fetchMenu } from "./order/api.js?v=145c4863ef";
import { el, wireAccountLink } from "./order/ui.js?v=145c4863ef";

function renderStatus() {
  const badge = document.querySelector("[data-status]");
  const { day, minutes } = torontoNow();
  const [open, close] = HOURS[day];
  const isOpen = minutes >= open * 60 && minutes < close * 60;
  badge.classList.toggle("is-open", isOpen);
  badge.classList.toggle("is-closed", !isOpen);
  if (isOpen) {
    badge.textContent = `Open now, until ${formatHour(close)}`;
  } else if (minutes < open * 60) {
    badge.textContent = `Closed now, opens at ${formatHour(open)} today`;
  } else {
    const next = (day + 1) % 7;
    badge.textContent = `Closed now, opens ${DAY_NAMES[next]} at ${formatHour(HOURS[next][0])}`;
  }
  document.querySelectorAll("[data-hours] tr").forEach((row) => {
    row.classList.toggle("is-today", Number(row.dataset.day) === day);
  });
}

function dietMark(veg) {
  return el("i", { class: `mark ${veg ? "mark-veg" : "mark-nonveg"}`, role: "img", "aria-label": veg ? "Vegetarian" : "Non-vegetarian" });
}

function renderMenu(data) {
  const body = document.querySelector("[data-menu]");
  const chips = document.querySelector("[data-chips]");
  body.replaceChildren();
  chips.replaceChildren();

  data.sections.forEach((section, i) => {
    const banner = el("div", { class: "menu-banner" }, [
      el("img", { loading: "lazy", alt: "", width: "1200", height: "420", "data-src": `img/menu/${section.id}.webp` }),
      el("h3", { id: `sec-${section.id}`, text: section.name }),
    ]);

    const list = el("div", { class: "menu-items" }, section.items.map((item) => {
      const row = el("div", { class: "menu-item", "data-veg": String(item.veg), "data-text": `${item.name} ${item.desc}`.toLowerCase() }, [
        dietMark(item.veg),
        el("span", { class: "menu-item-name", text: item.name }),
        el("span", { class: "menu-item-price", text: money.format(item.price) }),
        el("span", { class: "qty", "data-add": item.id, "data-name": item.name }),
      ]);
      if (item.desc) row.append(el("span", { class: "menu-item-desc", text: item.desc }));
      return row;
    }));

    const panel = el("section", {
      class: "menu-section", id: `panel-${section.id}`, role: "tabpanel", "aria-labelledby": `tab-${section.id}`, "data-section": section.id,
    }, [banner, list]);
    panel.hidden = i !== 0;
    body.append(panel);
    chips.append(el("button", {
      type: "button", role: "tab", id: `tab-${section.id}`, "aria-controls": `panel-${section.id}`,
      "aria-selected": String(i === 0), tabindex: i === 0 ? "0" : "-1", "data-chip": section.id,
      text: section.name,
    }));
  });

  const empty = el("div", { class: "menu-empty", hidden: "" }, [
    el("p", { "data-empty-text": "" }),
    el("button", { type: "button", class: "btn btn-ghost-dark", "data-clear": "", text: "Clear search and filters" }),
  ]);
  body.append(empty);

  renderButcher(data);
  wireFilters(data);
}

function renderButcher(data) {
  const list = document.querySelector("[data-butcher]");
  data.sections.filter((s) => s.raw).forEach((s) => {
    s.items.forEach((item) => {
      const perLb = /\(1 lb(, raw)?\)/.test(item.name);
      const name = item.name.replace(/\s*\((raw|1 lb|1 lb, raw)\)/, "");
      list.append(el("li", {}, [el("span", { text: name }), el("b", { text: `${money.format(item.price)}${perLb ? "/lb" : ""}` })]));
    });
  });
}

function wireFilters(data) {
  const menu = document.querySelector("#menu");
  const head = document.querySelector("[data-menu-head]");
  const search = document.querySelector("[data-search]");
  const dietButtons = document.querySelectorAll("[data-diet]");
  const tabs = [...document.querySelectorAll("[data-chip]")];
  const panels = [...document.querySelectorAll("[data-section]")];
  const count = document.querySelector("[data-count]");
  const empty = document.querySelector(".menu-empty");
  const total = data.sections.reduce((n, s) => n + s.items.length, 0);
  let diet = "all";
  let active = tabs[0].dataset.chip;

  function matches(row, q) {
    const veg = row.dataset.veg === "true";
    return (!q || row.dataset.text.includes(q)) && (diet === "all" || (diet === "veg") === veg);
  }

  function apply() {
    const q = search.value.trim().toLowerCase();
    const searching = q.length > 0;
    menu.classList.toggle("is-searching", searching);
    let shown = 0;
    const visibleIds = [];
    panels.forEach((panel) => {
      let visible = 0;
      panel.querySelectorAll(".menu-item").forEach((row) => {
        const ok = matches(row, q);
        row.hidden = !ok;
        if (ok) visible++;
      });
      if (visible) visibleIds.push(panel.dataset.section);
      panel.dataset.matches = visible;
      shown += visible;
    });
    tabs.forEach((tab) => { tab.hidden = !visibleIds.includes(tab.dataset.chip); });
    if (!visibleIds.includes(active) && visibleIds.length) active = visibleIds[0];
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.matches === "0" || (!searching && panel.dataset.section !== active);
      const img = panel.querySelector("img[data-src]");
      if (!panel.hidden && img) {
        img.src = img.dataset.src;
        img.removeAttribute("data-src");
      }
    });
    tabs.forEach((tab) => {
      const sel = !searching && tab.dataset.chip === active;
      tab.setAttribute("aria-selected", String(sel));
      tab.tabIndex = tab.dataset.chip === active ? 0 : -1;
    });

    if (searching) count.textContent = `${shown} of ${total} dishes match "${search.value.trim()}"`;
    else if (diet !== "all") count.textContent = `${shown} ${diet === "veg" ? "vegetarian" : "non-vegetarian"} dishes`;
    else count.textContent = `${total} dishes, ${data.sections.length} categories`;

    empty.hidden = shown !== 0;
    if (shown === 0) {
      empty.querySelector("[data-empty-text]").textContent = searching
        ? `No dishes match "${search.value.trim()}". Try another word, like chicken, paneer or naan.`
        : "No dishes match this filter.";
    }
  }

  function select(id, focus) {
    active = id;
    search.value = "";
    apply();
    const tab = tabs.find((t) => t.dataset.chip === id);
    if (focus) tab.focus();
    tab.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    const top = menu.querySelector(".menu-body").getBoundingClientRect().top;
    const offset = document.querySelector(".topbar").offsetHeight + head.offsetHeight;
    if (top < offset) window.scrollTo({ top: window.scrollY + top - offset - 8, behavior: "smooth" });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => select(tab.dataset.chip, false));
    tab.addEventListener("keydown", (e) => {
      const visible = tabs.filter((t) => !t.hidden);
      const i = visible.indexOf(tab);
      let next;
      if (e.key === "ArrowRight") next = visible[(i + 1) % visible.length];
      else if (e.key === "ArrowLeft") next = visible[(i - 1 + visible.length) % visible.length];
      else if (e.key === "Home") next = visible[0];
      else if (e.key === "End") next = visible[visible.length - 1];
      if (!next) return;
      e.preventDefault();
      select(next.dataset.chip, true);
    });
  });

  search.addEventListener("input", apply);
  function setDiet(btn) {
    diet = btn.dataset.diet;
    dietButtons.forEach((b) => {
      b.setAttribute("aria-checked", String(b === btn));
      b.tabIndex = b === btn ? 0 : -1;
    });
    apply();
  }
  dietButtons.forEach((btn, i) => {
    btn.tabIndex = i === 0 ? 0 : -1;
    btn.addEventListener("click", () => setDiet(btn));
    btn.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const next = dietButtons[(i + step + dietButtons.length) % dietButtons.length];
      setDiet(next);
      next.focus();
    });
  });
  document.querySelector("[data-clear]").addEventListener("click", () => {
    search.value = "";
    setDiet(dietButtons[0]);
    search.focus();
  });
  apply();
}

function wireOrderDialog() {
  const dialog = document.querySelector("[data-order-dialog]");
  document.querySelectorAll("[data-order]").forEach((btn) => {
    btn.addEventListener("click", () => dialog.showModal());
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.querySelector("[data-direct]").addEventListener("click", () => {
    dialog.close();
    if (cart.count()) {
      document.querySelector("[data-cart-open]").click();
    } else {
      document.querySelector("#menu").scrollIntoView();
      document.querySelector("[data-search]").focus({ preventScroll: true });
    }
  });
}

function renderQty(node) {
  const { add: id, name } = node.dataset;
  const qty = cart.qty(id);
  if (!qty) {
    node.replaceChildren(el("button", { type: "button", class: "qty-add", "data-act": "inc", "aria-label": `Add ${name}`, text: "Add" }));
    return;
  }
  node.replaceChildren(
    el("button", { type: "button", class: "qty-btn", "data-act": "dec", "aria-label": qty === 1 ? `Remove ${name}` : `One less ${name}`, text: "−" }),
    el("span", { class: "qty-n", text: String(qty) }),
    el("button", { type: "button", class: "qty-btn", "data-act": "inc", "aria-label": `One more ${name}`, text: "+" }),
  );
}

function wireCart(index) {
  const bar = document.querySelector("[data-cartbar]");
  const dialog = document.querySelector("[data-cart-dialog]");
  const body = dialog.querySelector("[data-cart-body]");
  const foot = dialog.querySelector("[data-cart-foot]");
  const announce = el("p", { class: "visually-hidden", "aria-live": "polite" });
  document.body.append(announce);

  document.querySelectorAll(".fav-add[data-add]").forEach((node) => {
    const item = index.get(node.dataset.add);
    if (!item) return node.remove();
    node.dataset.name = item.name;
    const caption = node.parentElement.querySelector("figcaption");
    caption.querySelector("span").textContent = item.name;
    caption.querySelector("b").textContent = formatCents(item.priceCents);
  });

  function renderDialog() {
    if (!cart.count()) {
      body.replaceChildren(el("div", { class: "cart-empty" }, [
        el("p", { text: "Your order is empty. Add dishes from the menu and they'll show up here." }),
        el("a", { class: "btn btn-red", href: "#menu", "data-cart-close": "", text: "Browse the menu" }),
      ]));
      foot.replaceChildren();
      return;
    }
    const bill = priceOrder(index, { lines: cart.lines });
    body.replaceChildren(el("ul", { class: "cart-lines" }, bill.lines.map((line) => el("li", { class: "cart-line" }, [
      el("div", { class: "cart-line-text" }, [
        el("span", { class: "cart-line-name", text: line.name }),
        el("span", { class: "cart-line-unit", text: `${formatCents(line.unitCents)} each` }),
      ]),
      el("span", { class: "qty", "data-add": line.id, "data-name": line.name }),
      el("span", { class: "cart-line-total", text: formatCents(line.totalCents) }),
    ]))));
    body.querySelectorAll("[data-add]").forEach(renderQty);
    foot.replaceChildren(
      el("dl", { class: "bill" }, [
        el("div", { class: "bill-row" }, [el("dt", { text: `Subtotal, ${cart.count()} ${cart.count() === 1 ? "item" : "items"}` }), el("dd", { text: formatCents(bill.subtotalCents) })]),
        el("div", { class: "bill-row bill-save" }, [el("dt", { text: `Direct order discount, ${DIRECT_DISCOUNT_PCT}% off` }), el("dd", { text: `−${formatCents(bill.discountCents)}` })]),
      ]),
      el("p", { class: "bill-note", text: `HST, delivery and tip are added at checkout. Pickup or delivery from ${RESTAURANT.address}.` }),
      el("a", { class: "btn btn-red btn-block", href: "checkout.html", text: `Go to checkout, ${formatCents(bill.subtotalCents - bill.discountCents)}` }),
    );
  }

  function render() {
    const count = cart.count();
    document.querySelectorAll("[data-cart-count]").forEach((n) => { n.textContent = count; });
    document.querySelector(".topbar-cart").classList.toggle("has-items", count > 0);
    bar.hidden = count === 0;
    document.body.classList.toggle("has-cartbar", count > 0);
    if (count) {
      const bill = priceOrder(index, { lines: cart.lines });
      bar.querySelector("[data-cart-total]").textContent = formatCents(bill.subtotalCents - bill.discountCents);
    }
    document.querySelectorAll("main [data-add]").forEach(renderQty);
    if (dialog.open) renderDialog();
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const node = btn.closest("[data-add]");
    const { add: id, name } = node.dataset;
    const inc = btn.dataset.act === "inc";
    cart.set(id, cart.qty(id) + (inc ? 1 : -1));
    const qty = cart.qty(id);
    announce.textContent = `${name}: ${qty} in your order. ${cart.count()} items total.`;
    const target = node.isConnected ? node : dialog.querySelector(`[data-add="${CSS.escape(id)}"]`);
    const next = target?.querySelector(`[data-act="${qty ? btn.dataset.act : "inc"}"]`);
    if (next) next.focus();
    else if (dialog.open) dialog.querySelector(".sheet-close").focus();
  });

  document.querySelectorAll("[data-cart-open]").forEach((btn) => btn.addEventListener("click", () => {
    renderDialog();
    dialog.showModal();
  }));
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || e.target.closest("[data-cart-close]")) dialog.close();
  });

  cart.prune(index);
  cart.subscribe(render);
  render();
}

function wireNav() {
  const toggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("#site-nav");
  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.querySelector(".visually-hidden").textContent = open ? "Close site navigation" : "Open site navigation";
    nav.classList.toggle("is-open", open);
  };
  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });
}

function wireMap() {
  const map = document.querySelector("[data-map]");
  map.querySelector("[data-map-load]").addEventListener("click", () => {
    const frame = el("iframe", {
      title: "Interactive map of 1 Stop Meat and Tandoori Hut, 1070 Wellington Rd, London, Ontario",
      src: "https://maps.google.com/maps?q=1+Stop+Meat+%26+Tandoori+Hut,+1070+Wellington+Rd,+London,+ON&z=16&output=embed",
      referrerpolicy: "no-referrer-when-downgrade",
    });
    map.replaceChildren(frame);
    frame.focus();
  });
}

async function loadMenu() {
  const body = document.querySelector("[data-menu]");
  try {
    const menu = await fetchMenu();
    renderMenu(menu);
    wireCart(indexMenu(menu));
  } catch {
    body.replaceChildren(el("p", { class: "form-error", text: "The menu didn't load. Refresh the page, or call (519) 668-6064 to order." }));
  }
}

document.querySelector("[data-year]").textContent = new Date().getFullYear();
renderStatus();
setInterval(renderStatus, 60000);
wireOrderDialog();
wireNav();
wireMap();
loadMenu();
wireAccountLink();
