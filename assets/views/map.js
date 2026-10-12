// 地図（Leaflet）と保活の画面。Leaflet は地図・保活を開いたときだけ読み込む
import * as store from "../store.js";
import { loadData } from "../data.js";
import { HOKATSU_LINKS, HOKATSU_TYPES, MAP_CENTER } from "../links.js";
import { esc, chips, emptyState, extLink, delegate, debounce, badge } from "../ui.js";
import { safeUrl, parseLatLng, sortByDistance, isNurseryType, fmtDistance } from "../util.js";

const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist/";
const TYPE_COLORS = {
  認可保育園: "#c4553f", 認証保育所: "#b8772f", 小規模保育: "#8f7a1f", 幼稚園: "#4f8a4e",
  児童館: "#2f8283", おでかけひろば: "#3d73ad", 子育てステーション: "#6f5fb0", 授乳室: "#a85a92", 小児科: "#b83f62",
};
const colorOf = (t) => TYPE_COLORS[t] || "#6b625c";

let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = LEAFLET + "leaflet.css";
      document.head.appendChild(css);
      const js = document.createElement("script");
      js.src = LEAFLET + "leaflet.js";
      js.onload = () => resolve(window.L);
      js.onerror = () => reject(new Error("leaflet"));
      document.head.appendChild(js);
    });
    leafletPromise.catch(() => { leafletPromise = null; });
  }
  return leafletPromise;
}

let focusId = null;
export function setMapFocus(id) { focusId = id; }

function getHome() { return parseLatLng(store.getSetting("home_latlng")); }

function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("no-geo"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      reject,
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });
}

function popupHtml(f) {
  const tel = String(f.tel || "").replace(/[^\d+\-]/g, "");
  const url = safeUrl(f.url);
  return `<div class="popup"><strong>${esc(f.name)}</strong><br><span class="popup-type">${esc(f.type)}</span>
    ${f.address ? `<br>${esc(f.address)}` : ""}${tel ? `<br><a href="tel:${esc(tel)}">${esc(f.tel)}</a>` : ""}
    ${url ? `<br><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">ホームページ</a>` : ""}</div>`;
}

// ---------- 地図 ----------
export async function renderMap(ctx, tabsHtml) {
  const data = await loadData("facilities");
  const items = data.items.filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng));
  const types = [...new Set(items.map((f) => f.type).filter(Boolean))];
  let typeFilter = "all";
  let settingHome = false;

  const html = `${tabsHtml}
    ${!items.length ? `<div class="card tight muted">${esc("施設のデータはまだありません。毎朝6時に集めに行きます。地図だけ先に使えます。")}</div>` : ""}
    ${types.length ? `<div id="map-chips">${chips("type", [{ value: "all", label: "すべて" }, ...types], typeFilter, "施設の種類")}</div>` : ""}
    <div class="map-actions">
      <button type="button" class="btn small" data-action="locate">現在地へ</button>
      <button type="button" class="btn small" data-action="set-home" aria-pressed="false">家の場所をここにする</button>
    </div>
    <p id="map-hint" class="muted note" role="status"></p>
    <div id="map" class="map" role="region" aria-label="施設の地図"></div>
    <p class="muted note">地図データ © OpenStreetMap contributors${data.items.some((f) => f.license) ? "・施設情報は各自治体のオープンデータ" : ""}</p>`;

  let map = null;
  let cleanup = () => { if (map) map.remove(); map = null; };

  async function mount(root) {
    const hint = root.querySelector("#map-hint");
    let L;
    try { L = await loadLeaflet(); } catch {
      root.querySelector("#map").outerHTML = `<div class="empty"><p>地図を読み込めませんでした。電波やWi-Fiを確かめて、開き直してください。</p></div>`;
      return;
    }
    if (!root.querySelector("#map")) return; // すでに別の画面へ移動した
    map = L.map("map", { preferCanvas: true }).setView([MAP_CENTER.lat, MAP_CENTER.lng], MAP_CENTER.zoom);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    const markers = new Map();
    const dot = (color, size = 18) => L.divIcon({ className: "fmark", html: `<span style="background:${color}"></span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
    let homeMarker = null;
    const drawHome = () => {
      if (homeMarker) { homeMarker.remove(); homeMarker = null; }
      const h = getHome();
      if (h) homeMarker = L.marker([h.lat, h.lng], { icon: L.divIcon({ className: "hmark", html: "<span>家</span>", iconSize: [28, 28], iconAnchor: [14, 14] }), title: "家の場所", keyboard: false }).addTo(map);
    };
    const draw = () => {
      layer.clearLayers();
      markers.clear();
      for (const f of items) {
        if (typeFilter !== "all" && f.type !== typeFilter) continue;
        const m = L.circleMarker([f.lat, f.lng], { radius: 7, color: "#ffffff", weight: 1.5, fillColor: colorOf(f.type), fillOpacity: 0.92 }).bindPopup(popupHtml(f));
        m.addTo(layer);
        markers.set(f.id, m);
      }
    };
    draw();
    drawHome();
    if (focusId && markers.has(focusId)) {
      const m = markers.get(focusId);
      map.setView(m.getLatLng(), 16);
      m.openPopup();
    }
    focusId = null;

    map.on("click", (e) => {
      if (!settingHome) return;
      settingHome = false;
      root.querySelector('[data-action="set-home"]').setAttribute("aria-pressed", "false");
      store.setSetting("home_latlng", `${e.latlng.lat.toFixed(6)},${e.latlng.lng.toFixed(6)}`);
      drawHome();
      hint.textContent = "家の場所を保存しました。保活の一覧が近い順になります。";
    });
    delegate(root, "click", async (a, el) => {
      if (a === "type") {
        typeFilter = el.dataset.value;
        root.querySelector("#map-chips").innerHTML = chips("type", [{ value: "all", label: "すべて" }, ...types], typeFilter, "施設の種類");
        draw();
      } else if (a === "locate") {
        try {
          const p = await locate();
          if (!map) return;
          map.setView([p.lat, p.lng], 15);
          L.circleMarker([p.lat, p.lng], { radius: 8, color: "#2563eb", fillOpacity: 0.6 }).addTo(map);
        } catch { /* 位置情報が使えなくても何もしない */ }
      } else if (a === "set-home") {
        settingHome = !settingHome;
        el.setAttribute("aria-pressed", String(settingHome));
        hint.textContent = settingHome ? "地図をタップして、家の場所を決めてください。" : "";
      }
    });
  }
  return { html, mount, cleanup: () => cleanup() };
}

// ---------- 保活 ----------
function vacancyHtml(f) {
  const v = f.vacancy;
  if (!v || typeof v !== "object" || !Object.keys(v).length) return "";
  const parts = Object.entries(v).map(([k, n]) => `${esc(k)}:${esc(n)}`).join(" ");
  const asOf = f.vacancy_as_of ? `(${esc(String(f.vacancy_as_of).replace(/^\d{4}-0?(\d+)-0?(\d+).*$/, "$1/$2"))}時点)` : "";
  return `<p class="vacancy">空き${asOf} ${parts}<span class="muted"> ※必ず公式ページで確認してください</span></p>`;
}

const hk = { onlyCand: false, q: "", limit: 40 };

export async function renderHokatsu(ctx, tabsHtml) {
  const data = await loadData("facilities");
  const all = data.items.filter((f) => isNurseryType(f.type, HOKATSU_TYPES));
  const home = getHome();
  const favs = new Map(store.getFavorites("nursery").map((f) => [f.item_id, f]));

  const linkBox = `<section class="card tight"><h2 class="card-title">区の公式ページ</h2>
    <ul class="plain">${HOKATSU_LINKS.map((l) => `<li>${extLink(l.url, l.label)}</li>`).join("")}</ul>
    <p class="muted note">入園の条件や空き状況は変わります。申し込む前に、必ず公式ページで確認してください。</p></section>`;

  function cardHtml(f) {
    const fav = favs.get(f.id);
    const dist = fmtDistance(f.distanceKm);
    const rankOpts = ['<option value="">順位なし</option>']
      .concat(Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}"${fav && fav.rank === i + 1 ? " selected" : ""}>第${i + 1}希望</option>`))
      .join("");
    const memo = fav
      ? `<div class="nursery-edit">
          <label class="field-label" for="rk-${esc(f.id)}">候補の順位</label>
          <select id="rk-${esc(f.id)}" data-action="rank" data-id="${esc(f.id)}">${rankOpts}</select>
          <label class="field-label" for="mm-${esc(f.id)}">見学メモ（ふたりで共有）</label>
          <textarea id="mm-${esc(f.id)}" rows="3" data-action="memo" data-id="${esc(f.id)}" placeholder="雰囲気、先生の印象、持ち物、気づいたことなど">${esc(fav.note || "")}</textarea></div>`
      : "";
    const vac = vacancyHtml(f);
    return `<li class="card tight${fav ? " is-cand" : ""}"><div class="event-top"><div>
        <div class="item-badges">${badge(f.type, "cat")}${fav && fav.rank ? badge("第" + fav.rank + "希望", "high") : ""}${dist ? `<span class="muted">${esc(dist)}</span>` : ""}</div>
        <h3 class="card-title">${esc(f.name)}</h3>${f.address ? `<p class="muted">${esc(f.address)}</p>` : ""}${vac}</div>
        <button type="button" class="star" data-action="cand" data-id="${esc(f.id)}" aria-pressed="${!!fav}" aria-label="${esc(f.name)}を候補に${fav ? "入れている" : "入れる"}">${fav ? "★" : "☆"}</button></div>
      <p class="item-foot">${f.tel ? `<a class="link" href="tel:${esc(String(f.tel).replace(/[^\d+\-]/g, ""))}">${esc(f.tel)}</a>` : ""}${extLink(f.url, "ホームページ")}
      ${Number.isFinite(f.lat) ? `<button type="button" class="linkbtn" data-action="onmap" data-id="${esc(f.id)}">地図で見る</button>` : ""}</p>${memo}</li>`;
  }

  function listHtml() {
    const q = hk.q.trim().toLowerCase();
    let list = all.filter((f) => !q || `${f.name} ${f.address || ""}`.toLowerCase().includes(q));
    if (hk.onlyCand) list = list.filter((f) => favs.has(f.id));
    list = sortByDistance(list, home);
    if (hk.onlyCand) {
      list.sort((a, b) => {
        const ra = favs.get(a.id).rank ?? 99, rb = favs.get(b.id).rank ?? 99;
        return ra - rb;
      });
    }
    if (!list.length) return emptyState(hk.onlyCand ? "候補はまだありません。園の ☆ を押すと、ここに並びます。" : "条件に合う園はありません。");
    const shown = list.slice(0, hk.limit);
    return `<ul class="plain stack">${shown.map(cardHtml).join("")}</ul>${list.length > shown.length ? `<p class="center"><button type="button" class="btn small" data-action="more">もっと見る（残り${list.length - shown.length}件）</button></p>` : ""}`;
  }

  let body;
  if (!all.length) body = emptyState(data.missing || !data.items.length ? undefined : "保育園のデータがありません。");
  else {
    body = `<div class="searchbox"><label class="sr-only" for="hk-q">園の名前や住所</label>
      <input id="hk-q" type="search" placeholder="園の名前・住所で探す" value="${esc(hk.q)}" autocomplete="off"></div>
      <label class="switch"><input type="checkbox" data-action="only-cand" ${hk.onlyCand ? "checked" : ""}> 候補だけ（順位順）</label>
      <p class="muted note">${home ? "家の場所から近い順に並べています。" : "家の場所を決めると、近い順に並びます。"}
      <button type="button" class="linkbtn" data-action="geo-home">現在地を家の場所にする</button>
      ／ 地図タブの「家の場所をここにする」でも決められます。</p><p id="hk-status" class="muted note" role="status"></p>
      <div id="hk-list">${listHtml()}</div>`;
  }
  const html = `${tabsHtml}${linkBox}${body}`;

  function mount(root, { rerender }) {
    const refresh = () => { const l = root.querySelector("#hk-list"); if (l) l.innerHTML = listHtml(); };
    const q = root.querySelector("#hk-q");
    if (q) q.oninput = debounce((e) => { hk.q = e.target.value; hk.limit = 40; refresh(); });
    delegate(root, "click", async (a, el) => {
      const id = el.dataset.id;
      if (a === "cand") store.setFavorite("nursery", id, favs.has(id) ? null : { note: "", rank: null });
      else if (a === "more") { hk.limit += 40; refresh(); }
      else if (a === "onmap") { setMapFocus(id); location.hash = "#/search/map"; }
      else if (a === "geo-home") {
        const st = root.querySelector("#hk-status");
        try {
          const p = await locate();
          store.setSetting("home_latlng", `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`);
        } catch { if (st) st.textContent = "現在地がわかりませんでした。地図タブで家の場所を決めることもできます。"; }
      }
    });
    root.onchange = (ev) => {
      const t = ev.target, a = t.dataset && t.dataset.action, id = t.dataset && t.dataset.id;
      if (a === "only-cand") { hk.onlyCand = t.checked; refresh(); }
      else if (a === "rank") store.setFavorite("nursery", id, { rank: t.value ? Number(t.value) : null });
      else if (a === "memo") store.setFavorite("nursery", id, { note: t.value });
    };
  }
  return { html, mount };
}
