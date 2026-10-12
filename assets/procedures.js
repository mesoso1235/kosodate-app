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

/**
 * ホーム用。未完了のうち
 * now:   期限まで0〜30日、または過ぎて1〜7日のものを近い順に3件
 * spare: 期限なし・priority high・開始済みのものを、開始日の新しい順に1件（古いものは済んでいることが多い）
 * next:  now が空のとき、その先で一番近い期限のもの
 */
export function pickNow(enriched, checks) {
  const open = enriched.filter((x) => !(checks[x.id] && checks[x.id].done));
  const dated = open.filter((x) => x.status).sort(byDeadline);
  const now = dated.filter((x) => x.status.days >= -7 && x.status.days <= 30).slice(0, 3);
  const spare = open
    .filter((x) => !x.deadline && x.priority === "high" && x.started)
    .sort((a, b) => (b.start ? b.start.date.getTime() : -Infinity) - (a.start ? a.start.date.getTime() : -Infinity) || a.index - b.index)[0] || null;
  const next = now.length ? null : dated.find((x) => x.status.days > 30) || null;
  return { now, spare, next };
}
