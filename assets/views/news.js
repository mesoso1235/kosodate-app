import * as store from "../store.js";
import { loadData } from "../data.js";
import { fmtShort } from "../dates.js";
import { mergeTimeline, isNew } from "../util.js";
import { esc, badge, chips, emptyState, extLink, pageTitle, delegate } from "../ui.js";

const LAST_VISIT = "kosodate:lastVisit";
let sessionPrev; // この閲覧中は「前回の閲覧時刻」を固定して NEW を保つ
let filter = "all";
const expanded = new Set();

function fmtDateTime(ts) {
  const d = new Date(ts);
  return `${fmtShort(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export async function render() {
  if (sessionPrev === undefined) {
    const raw = store.lsGetRaw(LAST_VISIT);
    sessionPrev = raw && Number.isFinite(+raw) ? +raw : null;
  }
  const news = await loadData("news");
  const isLocal = store.mode() === "local";
  const all = mergeTimeline(news.items, store.getNotices());
  const options = [{ value: "all", label: "すべて" }, "区", "都", "民間", ...(isLocal ? [] : ["LINE"])];
  const list = all.filter((x) => filter === "all" || x.group === filter);

  const rows = list
    .map((x) => {
      const nw = isNew(x, sessionPrev) ? `<span class="badge new">NEW</span>` : "";
      const date = x.ts ? (x.dateOnly ? fmtShort(new Date(x.ts)) : fmtDateTime(x.ts)) : "";
      const meta = `<div class="item-badges">${nw}${badge(x.group, "src")}<span class="muted">${esc(x.group === "LINE" ? "" : x.source)}</span><span class="row-date">${esc(date)}</span></div>`;
      if (x.kind === "line") {
        const open = expanded.has(x.id);
        return `<li class="card tight">${meta}
          <button type="button" class="item-title" data-action="toggle" data-id="${esc(x.id)}" aria-expanded="${open}">${esc(x.title || "（タイトルなし）")}</button>
          <div class="item-body" ${open ? "" : "hidden"}><p class="prewrap">${esc(x.body)}</p>${x.url ? `<p>${extLink(x.url, "リンクを開く")}</p>` : ""}</div></li>`;
      }
      return `<li class="card tight">${meta}<p class="news-title">${x.url ? extLink(x.url, x.title, "link title-link") : esc(x.title)}</p></li>`;
    })
    .join("");

  let body;
  if (!all.length) body = emptyState();
  else if (!list.length) body = emptyState("この発信元のお知らせはまだありません。");
  else body = `<ul class="plain stack">${rows}</ul>`;

  const lineHint = isLocal ? "" : `<p class="muted note">区のLINEなどのメッセージは、設定画面の「LINEボットの使い方」の手順で転送すると、ここに並びます。</p>`;
  const html = `${pageTitle("お知らせ", "区・都・民間の情報と、転送したLINEをまとめて。")}${chips("filter", options, filter, "発信元の絞り込み")}${body}${lineHint}`;

  function mount(root, { rerender }) {
    delegate(root, "click", (action, el) => {
      if (action === "filter") { filter = el.dataset.value; rerender(); }
      else if (action === "toggle") {
        const id = el.dataset.id;
        const open = !expanded.has(id);
        open ? expanded.add(id) : expanded.delete(id);
        el.setAttribute("aria-expanded", String(open));
        const panel = el.nextElementSibling;
        if (panel) panel.hidden = !open;
      }
    });
    store.lsSetRaw(LAST_VISIT, String(Date.now()));
  }
  return { html, mount };
}
