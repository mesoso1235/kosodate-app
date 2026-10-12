import test from "node:test";
import assert from "node:assert/strict";
import { parseYmd, fmtYmd, addDays, diffDays, deadlineOf, startOf, deadlineStatus, countdown, greeting } from "../../assets/dates.js";
import { enrich, pickThisWeek } from "../../assets/procedures.js";

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
test("pickThisWeek: 未完了・開始済み・期限が近い順で5件まで", () => {
  const ctx = { due: d("2030-03-15"), birth: null };
  const today = d("2030-01-23");
  const items = [
    { id: "a", anchor: "due", start_offset_days: -100, deadline_offset_days: -10 },
    { id: "b", anchor: "due", start_offset_days: -100, deadline_offset_days: -40 },
    { id: "c", anchor: "due", start_offset_days: 0, deadline_offset_days: 5 }, // 未開始
    { id: "d", anchor: "due", start_offset_days: -100, deadline_offset_days: null },
    { id: "e", anchor: "due", start_offset_days: -100, deadline_offset_days: -60 },
  ];
  const r = pickThisWeek(enrich(items, ctx, today), { e: { done: true } }, 5);
  assert.deepEqual(r.map((x) => x.id), ["b", "a", "d"]);
  assert.equal(pickThisWeek(enrich(items, ctx, today), {}, 2).length, 2);
});
