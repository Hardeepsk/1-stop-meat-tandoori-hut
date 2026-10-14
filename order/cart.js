import { MAX_QTY } from "./rules.js?v=23660a1f26";

const KEY = "th.cart";
const listeners = new Set();
let lines = read();

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(saved) ? saved.filter((l) => typeof l.id === "string" && Number.isInteger(l.qty) && l.qty > 0) : [];
  } catch {
    return [];
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch {}
  listeners.forEach((fn) => fn(lines));
}

export const cart = {
  get lines() { return lines; },
  qty(id) { return lines.find((l) => l.id === id)?.qty ?? 0; },
  count() { return lines.reduce((n, l) => n + l.qty, 0); },
  set(id, qty) {
    const next = Math.max(0, Math.min(MAX_QTY, qty));
    lines = next ? (lines.some((l) => l.id === id) ? lines.map((l) => (l.id === id ? { id, qty: next } : l)) : [...lines, { id, qty: next }]) : lines.filter((l) => l.id !== id);
    save();
  },
  add(id) { this.set(id, this.qty(id) + 1); },
  replace(next) {
    lines = next.map(({ id, qty }) => ({ id, qty }));
    save();
  },
  clear() {
    lines = [];
    save();
  },
  prune(index) {
    if (lines.every((l) => index.has(l.id))) return;
    lines = lines.filter((l) => index.has(l.id));
    save();
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  lines = read();
  listeners.forEach((fn) => fn(lines));
});
