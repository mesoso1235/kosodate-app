// 手続きの期限・開始日を計算して並べる（画面に依存しない）
import { deadlineOf, startOf, deadlineStatus } from "./dates.js";

/** items に deadline / start / status を付ける */
export function enrich(items, ctx, today) {
  return items.map((it, index) => {
    const deadline = deadlineOf(it, ctx);
    const start = startOf(it, ctx);
    return {
      ...it,
      index,
      deadline,
      start,
      status: deadline ? deadlineStatus(deadline.date, today) : null,
      started: !start || start.date.getTime() <= today.getTime(),
    };
  });
}

/** 期限が近い順（期限なしは最後、同日なら priority high が先、さらに元の順） */
export function byDeadline(a, b) {
  const da = a.deadline ? a.deadline.date.getTime() : Infinity;
  const db = b.deadline ? b.deadline.date.getTime() : Infinity;
  if (da !== db) return da < db ? -1 : 1;
  const pa = a.priority === "high" ? 0 : 1;
  const pb = b.priority === "high" ? 0 : 1;
  if (pa !== pb) return pa - pb;
  return a.index - b.index;
}

/** 今週やること: 未完了のうち、開始日が来ているものを期限の近い順に n 件 */
export function pickThisWeek(enriched, checks, n = 5) {
  const incomplete = enriched.filter((x) => !(checks[x.id] && checks[x.id].done));
  const started = incomplete.filter((x) => x.started);
  const pool = started.length ? started : incomplete;
  return [...pool].sort(byDeadline).slice(0, n);
}
