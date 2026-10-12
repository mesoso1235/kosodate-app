// 共有データの出入り口。画面はここだけを使う。
//  ・ローカルモード: localStorage（この端末だけ）
//  ・Supabaseモード: 夫婦で共有。Realtimeで相手の変更をすぐ反映
// 読み取り系（getChecks など）は手元のキャッシュから同期的に返す。書き込みは即座に画面へ反映し、裏で保存する。
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { DEFAULT_DUE } from "./dates.js";

const LS_KEY = "kosodate:v1";
const TABLES = ["checks", "favorites", "notices", "settings"];

const listeners = new Set();
let backend = "local"; // "local" | "supabase"
let client = null;
let user = null;
let channel = null;
let lastError = null;
const state = { checks: {}, favorites: [], notices: [], settings: {} };

function emit() {
  for (const cb of listeners) {
    try { cb(); } catch (e) { console.error(e); }
  }
}

// ---------- localStorage ----------
function lsRead() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function lsWrite() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ checks: state.checks, favorites: state.favorites, settings: state.settings }));
  } catch { /* 保存できない環境でも、画面を開いている間は動かす */ }
}
export function lsGetRaw(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function lsSetRaw(key, val) {
  try { localStorage.setItem(key, val); } catch { /* 無視 */ }
}

// ---------- 初期化 ----------
export function mode() { return backend; }
export function getUser() { return user; }
export function getLastError() { return lastError; }
export function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function init() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    backend = "local";
    const saved = lsRead() || {};
    state.checks = saved.checks || {};
    state.favorites = Array.isArray(saved.favorites) ? saved.favorites : [];
    state.settings = saved.settings || {};
    return;
  }
  backend = "supabase";
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const { data } = await client.auth.getSession();
    // マジックリンクで戻ってきたときの #access_token=... を消してホームへ
    if (/access_token|error_description/.test(location.hash)) {
      history.replaceState(null, "", location.pathname + location.search + "#/home");
    }
    await applySession(data.session);
    client.auth.onAuthStateChange(async (event, session) => {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      await applySession(session);
      emit();
    });
  } catch (e) {
    lastError = "共有サーバーにつながりませんでした。電波やWi-Fiを確かめて、開き直してください。";
    console.error(e);
  }
}

async function applySession(session) {
  const email = session && session.user ? session.user.email : null;
  if (!email) {
    user = null;
    unsubscribe();
    state.checks = {}; state.favorites = []; state.notices = []; state.settings = {};
    return;
  }
  if (user && user.email === email) return;
  user = { email, id: session.user.id };
  await Promise.all(TABLES.map(loadTable));
  subscribe();
}

async function loadTable(t) {
  try {
    const { data, error } = await client.from(t).select("*");
    if (error) throw error;
    const rows = data || [];
    if (t === "checks") state.checks = Object.fromEntries(rows.map((r) => [r.item_id, r]));
    else if (t === "favorites") state.favorites = rows;
    else if (t === "notices") state.notices = rows.sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
    else if (t === "settings") state.settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    lastError = null;
  } catch (e) {
    console.error(t, e);
    lastError = "データを読み込めませんでした。このメールアドレスが登録されているか確かめてください。";
  }
}

function subscribe() {
  unsubscribe();
  channel = client.channel("kosodate-sync");
  for (const t of TABLES) {
    channel.on("postgres_changes", { event: "*", schema: "public", table: t }, async () => {
      await loadTable(t);
      emit();
    });
  }
  channel.subscribe();
}
function unsubscribe() {
  if (channel && client) { client.removeChannel(channel); }
  channel = null;
}

// ---------- ログイン ----------
export async function signInWithEmail(email) {
  if (!client) throw new Error("not-configured");
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.href.split("#")[0] },
  });
  if (error) throw error;
}
export async function signOut() {
  if (client) await client.auth.signOut();
  user = null;
  unsubscribe();
  emit();
}

// ---------- 読み取り ----------
export function getChecks() { return state.checks; }
export function getFavorites(type) {
  return type ? state.favorites.filter((f) => f.item_type === type) : state.favorites;
}
export function getNotices() { return backend === "supabase" ? state.notices : []; }
export function getSetting(key) {
  const v = state.settings[key];
  if (v === undefined || v === null || v === "") return key === "due_date" ? DEFAULT_DUE : null;
  return v;
}

// ---------- 書き込み ----------
function who() { return user ? user.email : null; }
async function remote(fn, reloadTable) {
  try {
    const { error } = await fn();
    if (error) throw error;
  } catch (e) {
    console.error(e);
    lastError = "保存できませんでした。電波やWi-Fiを確かめて、もう一度試してください。";
    await loadTable(reloadTable); // 手元を正しい状態に戻す
    emit();
  }
}

export async function setCheck(id, done) {
  const row = { item_id: id, done: !!done, done_by: done ? who() : null, updated_at: new Date().toISOString() };
  state.checks = { ...state.checks, [id]: row };
  emit();
  if (backend === "local") return lsWrite();
  await remote(() => client.from("checks").upsert(row), "checks");
}

export async function setFavorite(type, id, val) {
  const rest = state.favorites.filter((f) => !(f.item_type === type && f.item_id === id));
  if (val === null) {
    state.favorites = rest;
    emit();
    if (backend === "local") return lsWrite();
    return remote(() => client.from("favorites").delete().eq("item_type", type).eq("item_id", id), "favorites");
  }
  const prev = state.favorites.find((f) => f.item_type === type && f.item_id === id);
  const row = {
    item_type: type,
    item_id: id,
    note: val.note !== undefined ? val.note : prev ? prev.note : "",
    rank: val.rank !== undefined ? val.rank : prev ? prev.rank : null,
    created_by: prev && prev.created_by ? prev.created_by : who(),
    updated_at: new Date().toISOString(),
  };
  state.favorites = [...rest, row];
  emit();
  if (backend === "local") return lsWrite();
  await remote(() => client.from("favorites").upsert(row, { onConflict: "item_type,item_id" }), "favorites");
}

export async function setSetting(key, value) {
  state.settings = { ...state.settings, [key]: value };
  emit();
  if (backend === "local") return lsWrite();
  await remote(() => client.from("settings").upsert({ key, value: String(value ?? "") }), "settings");
}

export function getNoticesCount() { return state.notices.length; }
