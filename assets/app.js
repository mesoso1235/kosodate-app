// ルーター（#/home など）と全体の枠
import * as store from "./store.js";
import { esc } from "./ui.js";

const VIEWS = {
  home: () => import("./views/home.js"),
  todo: () => import("./views/todo.js"),
  news: () => import("./views/news.js"),
  search: () => import("./views/search.js"),
  settings: () => import("./views/settings.js"),
};

const root = document.getElementById("view");
const banner = document.getElementById("banner");
const tabbar = document.getElementById("tabbar");

let token = 0;
let current = null; // { cleanup, ignoreChanges }
let dirty = false;

export function parseRoute(hash) {
  const parts = String(hash || "").replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean);
  const name = VIEWS[parts[0]] ? parts[0] : "home";
  return { name, sub: parts[1] || "" };
}

function loginHtml(msg = "", sent = false) {
  return `<section class="login"><h1 class="page-title">こそだてポケット</h1>
    <p>ふたり用の子育てノートです。登録済みのメールアドレスに、ログイン用のメールを送ります。パスワードは要りません。</p>
    ${store.getLastError() ? `<p class="err" role="alert">${esc(store.getLastError())}</p>` : ""}
    ${sent
      ? `<p class="ok" role="status">ログイン用のメールを送りました。届いたメールのリンクを、この端末で開いてください。</p>`
      : `<form id="login-form"><label for="email">メールアドレス</label>
        <input id="email" name="email" type="email" required autocomplete="email" inputmode="email" placeholder="you@example.com">
        <button class="btn" type="submit">ログイン用のメールを送る</button></form>`}
    ${msg ? `<p class="err" role="alert">${esc(msg)}</p>` : ""}</section>`;
}

function showLogin(msg = "", sent = false) {
  tabbar.hidden = true;
  banner.hidden = true;
  root.innerHTML = loginHtml(msg, sent);
  const form = document.getElementById("login-form");
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const email = form.email.value.trim();
      const btn = form.querySelector("button");
      btn.disabled = true;
      btn.textContent = "送信中…";
      try {
        await store.signInWithEmail(email);
        showLogin("", true);
      } catch {
        showLogin("メールを送れませんでした。アドレスを確かめて、もう一度送ってください。");
      }
    };
  }
}

async function show() {
  const my = ++token;
  if (current && current.cleanup) { try { current.cleanup(); } catch { /* 無視 */ } }
  current = null;
  dirty = false;

  if (store.mode() === "supabase" && !store.getUser()) { showLogin(); return; }
  tabbar.hidden = false;
  banner.hidden = store.mode() !== "local";

  const { name, sub } = parseRoute(location.hash);
  for (const a of tabbar.querySelectorAll("a[data-tab]")) {
    if (a.dataset.tab === name) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  let result;
  try {
    const mod = await VIEWS[name]();
    result = await mod.render({ sub });
  } catch (e) {
    console.error(e);
    if (my !== token) return;
    root.innerHTML = `<div class="empty"><p>表示できませんでした。ページを開き直してください。</p></div>`;
    return;
  }
  if (my !== token) return; // 途中で別の画面へ移動した
  root.innerHTML = result.html;
  current = { cleanup: result.cleanup, ignoreChanges: !!result.ignoreChanges };
  if (result.mount) await result.mount(root, { rerender: () => rerender() });
}

let lastHash = null;
async function route() {
  const changed = location.hash !== lastHash;
  lastHash = location.hash;
  const y = window.scrollY;
  await show();
  if (changed) {
    window.scrollTo(0, 0);
    root.focus({ preventScroll: true });
  } else {
    window.scrollTo(0, y);
  }
}

// 同じ画面を描き直す（スクロール位置は保つ）
async function rerender() {
  const y = window.scrollY;
  await show();
  window.scrollTo(0, y);
}

function isTyping() {
  const el = document.activeElement;
  if (!el || !root.contains(el)) return false;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return el.tagName === "INPUT" && !["checkbox", "radio", "button"].includes(el.type);
}

store.onChange(() => {
  if (store.mode() === "supabase" && !store.getUser()) { show(); return; }
  if (current && current.ignoreChanges) return;
  if (isTyping()) { dirty = true; return; } // 入力中は邪魔しない
  rerender();
});
root.addEventListener("focusout", () => {
  if (dirty) setTimeout(() => { if (dirty && !isTyping()) rerender(); }, 0);
});

window.addEventListener("hashchange", route);

async function boot() {
  await store.init();
  route();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
boot();
