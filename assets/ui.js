// 画面の部品（HTML文字列）。差し込む文字は必ず escapeHtml を通す
import { escapeHtml as esc, safeUrl } from "./util.js";

export { esc };

export const EMPTY_MESSAGE = "まだありません。毎朝6時に集めに行きます。";

export function emptyState(msg = EMPTY_MESSAGE) {
  return `<div class="empty"><p>${esc(msg)}</p></div>`;
}

/** 絞り込みチップ。value は data-value に入る */
export function chips(action, options, current, label = "絞り込み") {
  return `<div class="chips" role="group" aria-label="${esc(label)}">${options
    .map((o) => {
      const v = typeof o === "string" ? o : o.value;
      const t = typeof o === "string" ? o : o.label;
      const on = v === current;
      return `<button type="button" class="chip" data-action="${esc(action)}" data-value="${esc(v)}" aria-pressed="${on}">${esc(t)}</button>`;
    })
    .join("")}</div>`;
}

/** 外部リンク（http/https のみ）。不正なURLなら何も出さない */
export function extLink(url, text, cls = "link") {
  const u = safeUrl(url);
  if (!u) return "";
  return `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text)}<span class="sr-only">（新しいタブで開く）</span></a>`;
}

export function badge(text, cls = "") {
  if (!text) return "";
  return `<span class="badge ${esc(cls)}">${esc(text)}</span>`;
}

export function pageTitle(text, sub = "") {
  return `<h1 class="page-title">${esc(text)}</h1>${sub ? `<p class="page-sub">${esc(sub)}</p>` : ""}`;
}

/** イベント委譲。root に1つだけハンドラを持たせる（再描画しても重ならない） */
export function delegate(root, type, handler) {
  root["on" + type] = (ev) => {
    const el = ev.target.closest("[data-action]");
    if (el && root.contains(el)) handler(el.dataset.action, el, ev);
  };
}

export function debounce(fn, ms = 150) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
