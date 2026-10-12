// 画面に依存しない小さな道具（テスト対象）
import { parseYmd, startOfDay } from "./dates.js";

/** HTMLに差し込む文字列は必ずこれを通す（収集サイトやLINEの文面は信用しない） */
export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** http / https 以外（javascript: など）は空文字にする */
export function safeUrl(u) {
  try {
    const url = new URL(String(u ?? "").trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

/** メールの @ より前。空なら "" */
export function nameFromEmail(email) {
  const s = String(email ?? "");
  const i = s.indexOf("@");
  return i > 0 ? s.slice(0, i) : s;
}

/** 2点間の距離（km, 球面近似） */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function fmtDistance(km) {
  if (km === null || km === undefined || !Number.isFinite(km)) return "";
  return km < 1 ? `約${Math.round(km * 10) * 100}m` : `約${km.toFixed(1)}km`;
}

/** "35.6,139.6" → {lat,lng} / 不正なら null */
export function parseLatLng(s) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(s ?? ""));
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
}

/** 距離つきで並べ替え（home が null なら名前順）。元配列は変更しない */
export function sortByDistance(items, home) {
  const withD = items.map((it) => ({
    it,
    d: home && Number.isFinite(it.lat) && Number.isFinite(it.lng) ? haversineKm(home.lat, home.lng, it.lat, it.lng) : null,
  }));
  withD.sort((a, b) => {
    if (a.d !== null && b.d !== null) return a.d - b.d;
    if (a.d !== null) return -1;
    if (b.d !== null) return 1;
    return String(a.it.name ?? "").localeCompare(String(b.it.name ?? ""), "ja");
  });
  return withD.map((x) => ({ ...x.it, distanceKm: x.d }));
}

/** 施設の種別が保育園系か。types は完全一致の追加候補 */
export function isNurseryType(type, types = []) {
  const t = String(type ?? "");
  return t.includes("保育") || types.includes(t);
}

/** news.json と notices を1本の新しい順タイムラインにする */
export function mergeTimeline(news = [], notices = []) {
  const out = [];
  for (const n of news) {
    const d = parseYmd(n.published_at);
    out.push({
      kind: "news",
      id: `news:${n.id ?? n.url ?? n.title}`,
      title: n.title ?? "",
      url: n.url ?? "",
      source: n.source ?? "",
      group: n.category ?? "",
      ts: d ? d.getTime() : n.published_at && Number.isFinite(Date.parse(n.published_at)) ? Date.parse(n.published_at) : null,
      dateOnly: true,
    });
  }
  for (const n of notices) {
    const ts = Date.parse(n.received_at);
    out.push({
      kind: "line",
      id: `line:${n.id}`,
      title: n.title ?? "",
      body: n.body ?? "",
      url: n.url ?? "",
      source: n.source === "line" || !n.source ? "LINE" : n.source,
      group: "LINE",
      ts: Number.isFinite(ts) ? ts : null,
      dateOnly: false,
    });
  }
  out.sort((a, b) => (b.ts ?? -Infinity) - (a.ts ?? -Infinity));
  return out;
}

/** 最終閲覧（ミリ秒）より新しいか。日付だけの項目は「最終閲覧の日以降」を新着とする */
export function isNew(item, prevMs) {
  if (prevMs === null || prevMs === undefined || item.ts === null || item.ts === undefined) return false;
  if (item.dateOnly) return item.ts >= startOfDay(new Date(prevMs)).getTime();
  return item.ts > prevMs;
}

/** sources.json の形がどうでも配列にそろえる */
export function normalizeSources(json) {
  if (!json || typeof json !== "object") return [];
  let list = [];
  if (Array.isArray(json.sources)) list = json.sources;
  else if (Array.isArray(json.items)) list = json.items;
  else if (json.sources && typeof json.sources === "object") list = Object.entries(json.sources).map(([id, v]) => ({ id, ...v }));
  else {
    list = Object.entries(json)
      .filter(([, v]) => v && typeof v === "object" && !Array.isArray(v))
      .map(([id, v]) => ({ id, ...v }));
  }
  return list.map((s) => ({
    name: s.name ?? s.id ?? "",
    lastSuccess: s.last_success ?? s.last_success_at ?? s.last_ok ?? s.updated_at ?? null,
    count: s.count ?? s.item_count ?? s.items ?? null,
    error: s.error ?? s.last_error ?? null,
  }));
}
