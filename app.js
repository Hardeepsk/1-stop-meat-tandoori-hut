const HOURS = { 0: [11, 21], 1: [11, 21], 2: [11, 21], 3: [11, 21], 4: [11, 21], 5: [11, 23], 6: [11, 23] };
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

function torontoNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function formatHour(h) {
  if (h === 12) return "noon";
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

function renderStatus() {
  const el = document.querySelector("[data-status]");
  const { day, minutes } = torontoNow();
  const [open, close] = HOURS[day];
  el.classList.remove("is-open", "is-closed");
  if (minutes >= open * 60 && minutes < close * 60) {
    el.textContent = `Open now, until ${formatHour(close)}`;
    el.classList.add("is-open");
  } else if (minutes < open * 60) {
    el.textContent = `Closed now, opens at ${formatHour(open)} today`;
    el.classList.add("is-closed");
  } else {
    const next = (day + 1) % 7;
    el.textContent = `Closed now, opens ${DAY_NAMES[next]} at ${formatHour(HOURS[next][0])}`;
    el.classList.add("is-closed");
  }
  document.querySelectorAll("[data-hours] tr").forEach((row) => {
    row.classList.toggle("is-today", Number(row.dataset.day) === day);
  });
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "text") node.textContent = v;
    else if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  });
  children.forEach((c) => node.append(c));
  return node;
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
      const row = el("div", { class: "menu-item", "data-veg": String(item.veg), "data-text": `${item.name} ${item.desc} ${section.name}`.toLowerCase() }, [
        dietMark(item.veg),
        el("span", { class: "menu-item-name", text: item.name }),
        el("span", { class: "menu-item-price", text: money.format(item.price) }),
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
      text: section.name.replace(/^Butcher Counter — /, "Raw: "),
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
      const name = item.name.replace(/\s*\((raw|uncooked\s*1\s*lb|1\s*lb)\)/gi, "").trim();
      list.append(el("li", {}, [el("span", { text: name }), el("b", { text: money.format(item.price) })]));
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
      const id = panel.dataset.section;
      panel.hidden = searching ? panel.dataset.matches === "0" : id !== active || panel.dataset.matches === "0";
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
    if (search.value) search.value = "";
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
  dietButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      diet = btn.dataset.diet;
      dietButtons.forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
      apply();
    });
  });
  document.querySelector("[data-clear]").addEventListener("click", () => {
    search.value = "";
    diet = "all";
    dietButtons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.diet === "all")));
    apply();
    search.focus();
  });
  apply();
}

function wireOrderDialog() {
  const dialog = document.querySelector("[data-order-dialog]");
  document.querySelectorAll("[data-order]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else window.open(dialog.querySelector(".order-links a").href, "_blank", "noopener");
    });
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
}

async function loadMenu() {
  const body = document.querySelector("[data-menu]");
  try {
    const res = await fetch("data/menu.json");
    if (!res.ok) throw new Error(res.status);
    renderMenu(await res.json());
  } catch {
    body.replaceChildren(el("p", { class: "menu-loading", text: "The menu didn't load. Refresh the page, or call (519) 668-6064 to order." }));
  }
}

document.querySelector("[data-year]").textContent = new Date().getFullYear();
renderStatus();
setInterval(renderStatus, 60000);
wireOrderDialog();
loadMenu();
