// さがす: サブタブ（サービス / イベント / 地図 / 保活）
import * as store from "../store.js";
import { loadData } from "../data.js";
import { startOfDay, parseYmd, fmtShort } from "../dates.js";
import { esc, badge, chips, emptyState, extLink, pageTitle, delegate, debounce } from "../ui.js";
import * as mapView from "./map.js";

const SUBS = [
  { id: "services", label: "サービス" },
  { id: "events", label: "イベント" },
  { id: "map", label: "地図" },
  { id: "hokatsu", label: "保活" },
];

function subTabs(current) {
  return `<nav class="subtabs" aria-label="さがすの種類">${SUBS.map(
    (s) => `<a href="#/search/${s.id}" class="subtab"${s.id === current ? ' aria-current="page"' : ""}>${esc(s.label)}</a>`
  ).join("")}</nav>`;
}

// ---------- サービス図鑑 ----------
const STAGE_CHIPS = [
  { value: "all", label: "すべての時期" },
  { value: "pregnancy", label: "妊娠中" },
  { value: "newborn", label: "新生児期" },
  { value: "infant", label: "乳児期" },
  { value: "toddler", label: "幼児期" },
];
const svc = { q: "", stage: "all", category: "all" };

function serviceCard(s) {
  const tags = Array.isArray(s.tags) ? s.tags.map((t) => badge(t, "tag")).join("") : "";
  const f = (k, v) => (v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : "");
  return `<li class="card tight"><div class="item-badges">${badge(s.category, "cat")}<span class="muted">${esc(s.provider)}</span></div>
    <h3 class="card-title">${esc(s.name)}</h3><p>${esc(s.summary)}</p>
    <dl class="facts">${f("対象", s.for_whom)}${f("費用", s.cost)}${f("申し込み", s.how_to_apply)}</dl>
    ${tags ? `<div class="item-badges">${tags}</div>` : ""}
    <p class="item-foot">${extLink(s.url, "公式ページを見る")}</p></li>`;
}

function filterServices(items) {
  const q = svc.q.trim().toLowerCase();
  return items.filter((s) => {
    if (svc.stage !== "all" && !(s.stages || []).includes(svc.stage)) return false;
    if (svc.category !== "all" && s.category !== svc.category) return false;
    if (!q) return true;
    const hay = [s.name, s.summary, s.provider, s.for_whom, s.category, ...(s.tags || [])].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

async function renderServices() {
  const data = await loadData("services");
  if (!data.items.length) return { html: subTabs("services") + emptyState() };
  const cats = [...new Set(data.items.map((s) => s.category).filter(Boolean))];
  const catOpts = [{ value: "all", label: "すべての種類" }, ...cats];
  const listHtml = () => {
    const l = filterServices(data.items);
    return l.length ? `<ul class="plain stack">${l.map(serviceCard).join("")}</ul>` : emptyState("条件に合うサービスはありません。");
  };
  const html = `${subTabs("services")}
    <div class="searchbox"><label for="svc-q" class="sr-only">キーワード</label>
    <input id="svc-q" type="search" placeholder="キーワードで探す（例：産後ケア）" value="${esc(svc.q)}" autocomplete="off"></div>
    <div id="svc-chips">${chips("stage", STAGE_CHIPS, svc.stage, "時期")}${chips("category", catOpts, svc.category, "種類")}</div>
    <p class="muted note">確認日 ${esc(data.verified_at || "—")}。申し込む前に、公式ページで最新の情報を確認してください。</p>
    <div id="svc-list">${listHtml()}</div>`;
  function mount(root) {
    const refresh = () => {
      root.querySelector("#svc-list").innerHTML = listHtml();
      root.querySelector("#svc-chips").innerHTML = chips("stage", STAGE_CHIPS, svc.stage, "時期") + chips("category", catOpts, svc.category, "種類");
    };
    root.querySelector("#svc-q").oninput = debounce((e) => { svc.q = e.target.value; root.querySelector("#svc-list").innerHTML = listHtml(); });
    delegate(root, "click", (a, el) => {
      if (a === "stage") { svc.stage = el.dataset.value; refresh(); }
      if (a === "category") { svc.category = el.dataset.value; refresh(); }
    });
  }
  return { html, mount };
}

// ---------- イベント ----------
let onlyFav = false;

function eventCard(e, fav) {
  const s = parseYmd(e.start), en = parseYmd(e.end);
  const date = s ? fmtShort(s) + (en && en.getTime() !== s.getTime() ? `〜${fmtShort(en)}` : "") : "日付未定";
  const f = (k, v) => (v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : "");
  return `<li class="card tight"><div class="event-top"><div><div class="item-badges"><span class="event-date">${esc(date)}</span>${e.time ? `<span class="muted">${esc(e.time)}</span>` : ""}</div>
    <h3 class="card-title">${esc(e.title)}</h3></div>
    <button type="button" class="star" data-action="fav-event" data-id="${esc(e.id)}" aria-pressed="${fav}" aria-label="${esc(e.title)}を気になるイベントに${fav ? "入れている" : "入れる"}">${fav ? "★" : "☆"}</button></div>
    <dl class="facts">${f("場所", e.place)}${f("対象", e.target)}${f("主催", e.source)}</dl>
    <p class="item-foot">${extLink(e.url, "詳しく見る")}</p></li>`;
}

async function renderEvents() {
  const today = startOfDay(new Date());
  const data = await loadData("events");
  const favIds = new Set(store.getFavorites("event").map((f) => f.item_id));
  const upcoming = data.items
    .map((e) => ({ e, s: parseYmd(e.start), en: parseYmd(e.end) }))
    .filter((x) => x.s && (x.en || x.s).getTime() >= today.getTime())
    .filter((x) => !onlyFav || favIds.has(x.e.id))
    .sort((a, b) => a.s - b.s);
  let body;
  if (!data.items.length) body = emptyState();
  else if (!upcoming.length) body = emptyState(onlyFav ? "気になるイベントはまだありません。☆ を押すと入ります。" : "これから開かれるイベントは、いまはありません。");
  else {
    const groups = new Map();
    for (const x of upcoming) {
      const key = `${x.s.getFullYear()}年${x.s.getMonth() + 1}月`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(x.e);
    }
    body = [...groups]
      .map(([month, es]) => `<section><h2 class="month">${esc(month)}</h2><ul class="plain stack">${es.map((e) => eventCard(e, favIds.has(e.id))).join("")}</ul></section>`)
      .join("");
  }
  const html = `${subTabs("events")}
    <label class="switch"><input type="checkbox" data-action="only-fav" ${onlyFav ? "checked" : ""}> 気になるイベントだけ</label>${body}`;
  function mount(root, { rerender }) {
    delegate(root, "click", (a, el) => {
      if (a === "fav-event") {
        const id = el.dataset.id;
        store.setFavorite("event", id, favIds.has(id) ? null : { note: "", rank: null });
      }
    });
    root.onchange = (ev) => {
      if (ev.target.matches('[data-action="only-fav"]')) { onlyFav = ev.target.checked; rerender(); }
    };
  }
  return { html, mount };
}

export async function render(ctx) {
  const sub = SUBS.some((s) => s.id === ctx.sub) ? ctx.sub : "services";
  const title = pageTitle("さがす");
  let r;
  if (sub === "services") r = await renderServices(ctx);
  else if (sub === "events") r = await renderEvents(ctx);
  else if (sub === "map") r = await mapView.renderMap(ctx, subTabs("map"));
  else r = await mapView.renderHokatsu(ctx, subTabs("hokatsu"));
  return { ...r, html: title + r.html, ignoreChanges: sub === "map" };
}
