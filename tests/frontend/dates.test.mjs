import test from "node:test";
import assert from "node:assert/strict";
import { parseYmd, fmtYmd, addDays, diffDays, deadlineOf, startOf, deadlineStatus, countdown, greeting, deadlineText } from "../../assets/dates.js";
import { enrich, pickNow } from "../../assets/procedures.js";

const d = (s) => parseYmd(s);

test("parseYmd は不正な日付を弾く", () => {
  assert.equal(parseYmd("2027-02-30"), null);
  assert.equal(parseYmd(""), null);
  assert.equal(fmtYmd(parseYmd("2030-03-15")), "2030-03-15");
});
test("diffDays / addDays は月またぎ・夏時間でもずれない", () => {
  assert.equal(diffDays(d("2026-12-31"), d("2027-01-01")), 1);
  assert.equal(diffDays(d("2030-03-15"), d("2029-12-05")), -100);
  assert.equal(fmtYmd(addDays(d("2030-03-15"), 13)), "2030-03-28");
  assert.equal(fmtYmd(addDays(d("2027-03-01"), -1)), "2027-02-28");
});
test("期限: 予定日基準", () => {
  const ctx = { due: d("2030-03-15"), birth: null };
  const r = deadlineOf({ anchor: "due", deadline_offset_days: -30 }, ctx);
  assert.equal(fmtYmd(r.date), "2030-02-13");
  assert.equal(r.estimated, false);
});
test("期限: 誕生日基準で誕生日なしは予定日で代用し estimated", () => {
  const item = { anchor: "birth", deadline_offset_days: 13 };
  const a = deadlineOf(item, { due: d("2030-03-15"), birth: null });
  assert.equal(fmtYmd(a.date), "2030-03-28");
  assert.equal(a.estimated, true);
  const b = deadlineOf(item, { due: d("2030-03-15"), birth: d("2030-03-04") });
  assert.equal(fmtYmd(b.date), "2030-03-17");
  assert.equal(b.estimated, false);
});
test("期限なし・開始日なしは null", () => {
  const ctx = { due: d("2030-03-15"), birth: null };
  assert.equal(deadlineOf({ anchor: "due", deadline_offset_days: null }, ctx), null);
  assert.equal(startOf({ anchor: "due" }, ctx), null);
});
test("deadlineStatus のラベル", () => {
  const t = d("2029-12-05");
  assert.equal(deadlineStatus(d("2029-12-04"), t).label, "期限切れ");
  assert.equal(deadlineStatus(d("2029-12-05"), t).label, "今日まで");
  assert.equal(deadlineStatus(d("2029-12-08"), t).label, "あと3日");
  assert.equal(deadlineStatus(d("2029-12-08"), t).kind, "soon");
});
test("countdown", () => {
  const t = d("2029-12-05");
  assert.deepEqual({ k: countdown({ due: d("2030-03-15"), birth: null }, t).kind, n: countdown({ due: d("2030-03-15"), birth: null }, t).days }, { k: "before", n: 100 });
  assert.equal(countdown({ due: d("2030-03-15"), birth: d("2029-12-05") }, t).day, 1);
  assert.equal(countdown({ due: d("2030-03-15"), birth: d("2029-12-02") }, t).day, 4);
  assert.equal(countdown({ due: d("2029-12-02"), birth: null }, t).kind, "pastdue");
  assert.equal(countdown({ due: null, birth: null }, t).kind, "none");
});
test("greeting", () => {
  assert.equal(greeting(8), "おはようございます");
  assert.equal(greeting(14), "こんにちは");
  assert.equal(greeting(20), "こんばんは");
});
test("deadlineText: 日付で書き、7日以内だけ日数を足す", () => {
  const today = d("2030-01-23");
  assert.deepEqual(deadlineText(d("2030-02-22"), today), { text: "2/22(金)まで", kind: "later" });
  assert.deepEqual(deadlineText(d("2030-01-31"), today), { text: "1/31(木)まで", kind: "later" });
  assert.deepEqual(deadlineText(d("2030-01-30"), today), { text: "1/30(水)まで・あと7日", kind: "soon" });
  assert.deepEqual(deadlineText(d("2030-01-23"), today), { text: "今日まで", kind: "today" });
  assert.deepEqual(deadlineText(d("2030-01-20"), today), { text: "期限を過ぎました（1/20(日)）", kind: "overdue" });
});
test("pickNow: 期限30日以内と、過ぎて7日以内を、近い順に3件", () => {
  const ctx = { due: d("2030-03-15"), birth: null }; // today から 51日後
  const today = d("2030-01-23");
  const items = [
    { id: "a", anchor: "due", start_offset_days: -200, deadline_offset_days: -60 }, // 9日過ぎ → 出さない
    { id: "b", anchor: "due", start_offset_days: -200, deadline_offset_days: -55 }, // 4日過ぎ
    { id: "c", anchor: "due", start_offset_days: -200, deadline_offset_days: -40 }, // あと11日
    { id: "d", anchor: "due", start_offset_days: -200, deadline_offset_days: -21 }, // あと30日
    { id: "e", anchor: "due", start_offset_days: -200, deadline_offset_days: -20 }, // あと31日 → 出さない
    { id: "f", anchor: "due", start_offset_days: -200, deadline_offset_days: -45 }, // 済み
    { id: "g", anchor: "due", start_offset_days: -200, deadline_offset_days: -48 }, // あと3日
    { id: "h", anchor: "due", start_offset_days: -100, deadline_offset_days: null, priority: "high" },
    { id: "i", anchor: "due", start_offset_days: -120, deadline_offset_days: null, priority: "high" },
    { id: "j", anchor: "due", start_offset_days: -150, deadline_offset_days: null, priority: "normal" },
    { id: "k", anchor: "due", start_offset_days: 0, deadline_offset_days: null, priority: "high" }, // 未開始
  ];
  const r = pickNow(enrich(items, ctx, today), { f: { done: true } });
  assert.deepEqual(r.now.map((x) => x.id), ["b", "g", "c"]);
  assert.equal(r.spare.id, "h"); // 開始日が新しい方（古いものは済んでいることが多い）
  assert.equal(r.next, null);
});
test("pickNow: いまやることが0件なら次の期限を1件", () => {
  const ctx = { due: d("2030-03-15"), birth: null };
  const today = d("2030-01-23");
  const items = [
    { id: "x", anchor: "due", start_offset_days: -200, deadline_offset_days: -10 },
    { id: "y", anchor: "due", start_offset_days: -200, deadline_offset_days: -20 },
    { id: "z", anchor: "due", start_offset_days: -200, deadline_offset_days: -60 }, // 9日過ぎ
  ];
  const r = pickNow(enrich(items, ctx, today), {});
  assert.deepEqual(r.now, []);
  assert.equal(r.next.id, "y");
  assert.equal(r.spare, null);
});
