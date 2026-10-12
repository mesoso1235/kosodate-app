// data/*.json の読み込み。ファイルが無い・壊れている場合も空の結果を返す
export async function loadData(name) {
  try {
    const res = await fetch(`data/${name}.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    const items = Array.isArray(json && json.items) ? json.items : [];
    return { ...(json && typeof json === "object" ? json : {}), items, missing: false };
  } catch {
    return { items: [], missing: true };
  }
}

/** 設定値から基準日（予定日・誕生日）を取り出す */
import { parseYmd } from "./dates.js";
import * as store from "./store.js";
export function getDateCtx() {
  return { due: parseYmd(store.getSetting("due_date")), birth: parseYmd(store.getSetting("birth_date")) };
}
