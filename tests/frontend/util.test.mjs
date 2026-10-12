import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, safeUrl, haversineKm, sortByDistance, mergeTimeline, isNew, nameFromEmail, parseLatLng, isNurseryType, normalizeSources, fmtDistance, isIrrelevantNews, isApplyNews, homeNotices } from "../../assets/util.js";

test("escapeHtml", () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(12), "12");
});
test("safeUrl は http/https だけ通す", () => {
  assert.equal(safeUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(safeUrl("http://example.com"), "http://example.com/");
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("data:text/html,x"), "");
  assert.equal(safeUrl("//evil.com"), "");
  assert.equal(safeUrl(""), "");
  assert.equal(safeUrl(undefined), "");
});
test("nameFromEmail", () => {
  assert.equal(nameFromEmail("taro@example.com"), "taro");
  assert.equal(nameFromEmail(null), "");
});
test("haversineKm: 世田谷区役所〜渋谷駅は約3.5km前後", () => {
  const km = haversineKm(35.6464, 139.6533, 35.658, 139.7016);
  assert.ok(km > 4 && km < 5, String(km));
  assert.equal(haversineKm(35, 139, 35, 139), 0);
  assert.equal(fmtDistance(0.42), "約400m");
  assert.equal(fmtDistance(2.345), "約2.3km");
});
test("sortByDistance", () => {
  const items = [
    { name: "遠", lat: 35.7, lng: 139.8 },
    { name: "座標なし" },
    { name: "近", lat: 35.6465, lng: 139.6534 },
  ];
  const r = sortByDistance(items, { lat: 35.6464, lng: 139.6533 });
  assert.deepEqual(r.map((x) => x.name), ["近", "遠", "座標なし"]);
  const n = sortByDistance(items, null);
  assert.equal(n.length, 3);
  assert.equal(items[0].name, "遠"); // 元は変えない
});
test("parseLatLng", () => {
  assert.deepEqual(parseLatLng("35.6,139.6"), { lat: 35.6, lng: 139.6 });
  assert.equal(parseLatLng("abc"), null);
  assert.equal(parseLatLng("95,10"), null);
});
test("isNurseryType", () => {
  assert.ok(isNurseryType("認可保育園"));
  assert.ok(isNurseryType("小規模保育事業"));
  assert.ok(isNurseryType("ナーサリー", ["ナーサリー"]));
  assert.ok(!isNurseryType("児童館"));
});
test("mergeTimeline は新しい順に統合する", () => {
  const news = [
    { id: "1", title: "古い", published_at: "2026-10-01", category: "区", source: "世田谷区" },
    { id: "2", title: "日付なし", published_at: null, category: "都" },
    { id: "3", title: "新しい", published_at: "2026-10-12", category: "民間" },
  ];
  const notices = [{ id: "n1", title: "LINE", body: "本文", received_at: "2026-10-12T09:00:00Z", source: "line" }];
  const r = mergeTimeline(news, notices);
  assert.deepEqual(r.map((x) => x.title), ["LINE", "新しい", "古い", "日付なし"]);
  assert.equal(r[0].group, "LINE");
  assert.equal(r[0].kind, "line");
});
test("isNew", () => {
  const prev = new Date(2026, 9, 10, 15, 0).getTime();
  assert.equal(isNew({ ts: new Date(2026, 9, 10).getTime(), dateOnly: true }, prev), true); // 同じ日
  assert.equal(isNew({ ts: new Date(2026, 9, 9).getTime(), dateOnly: true }, prev), false);
  assert.equal(isNew({ ts: prev + 1, dateOnly: false }, prev), true);
  assert.equal(isNew({ ts: prev - 1, dateOnly: false }, prev), false);
  assert.equal(isNew({ ts: prev + 1, dateOnly: false }, null), false);
  assert.equal(isNew({ ts: null }, prev), false);
});
test("normalizeSources はいろいろな形を受ける", () => {
  assert.deepEqual(normalizeSources(null), []);
  const a = normalizeSources({ sources: [{ id: "x", name: "X", last_success: "2026-10-13T06:00:00+09:00", count: 5, error: null }] });
  assert.equal(a[0].name, "X");
  assert.equal(a[0].count, 5);
  const b = normalizeSources({ setagaya: { last_success_at: "t", item_count: 3, last_error: "boom" } });
  assert.equal(b[0].name, "setagaya");
  assert.equal(b[0].error, "boom");
});

test("isIrrelevantNews: 言葉ではっきり関係ないものだけ", () => {
  assert.equal(isIrrelevantNews("【募集は終了しました】令和8年度 世田谷区職員「保育士(経験者)」の募集"), true);
  assert.equal(isIrrelevantNews("「児童館運営支援システム導入及びシステム運用保守業務委託契約」公募型プロポーザルの実施結果について"), true);
  assert.equal(isIrrelevantNews("【終了しました】第29回アドベンチャーin多摩川いかだ下り大会"), true);
  assert.equal(isIrrelevantNews("10/5(月)「助産師さんとみんなでおしゃべり」中止のお知らせ"), true);
  assert.equal(isIrrelevantNews("（中高生世代対象）閉館時間帯の児童館で自習ができます"), true);
  assert.equal(isIrrelevantNews("2026年11月分の両親学級の申し込みを開始しました（申込期間 10/1～10/15）"), false);
  assert.equal(isIrrelevantNews("折り紙タイム"), false);
  assert.equal(isIrrelevantNews("【ベビーシッター利用支援事業】区の職員等によるシッティング現場立ち会い"), false);
});
test("isApplyNews: 申込み・予約などで、関係ないものは除く", () => {
  assert.equal(isApplyNews("2026年11月分の両親学級の申し込みを開始しました（申込期間 10/1～10/15）"), true);
  assert.equal(isApplyNews("10月の予約が必要なプログラム、予約開始しました"), true);
  assert.equal(isApplyNews("「二十歳のつどい」実行委員の募集 ※今年度の募集は終了しました"), false);
  assert.equal(isApplyNews("折り紙タイム"), false);
  assert.equal(isApplyNews("喜多見児童館 陶芸窯応援プロジェクト【寄附金を募集します（ふるさと納税）】"), false);
  assert.equal(isApplyNews("認可保育所整備・運営事業者の募集（提案型：令和10年4月開園）"), false);
  assert.equal(isApplyNews("親子ヨガの参加者募集"), true);
});
test("homeNotices: LINEは7日以内、お知らせは申込みで14日以内、LINEを先に2件", () => {
  const now = new Date(2030, 0, 23, 12).getTime();
  const day = 86400000;
  const t = (kind, title, ago) => ({ kind, title, ts: now - ago * day });
  const timeline = [
    t("news", "両親学級の申し込み", 1),
    t("line", "区からのお知らせ", 2),
    t("news", "折り紙タイム", 3),
    t("news", "予約開始しました", 10),
    t("line", "古いLINE", 8),
    t("news", "昔の申し込み", 20),
  ];
  assert.deepEqual(homeNotices(timeline, now).map((x) => x.title), ["区からのお知らせ", "両親学級の申し込み"]);
  assert.deepEqual(homeNotices(timeline, now, 5).map((x) => x.title), ["区からのお知らせ", "両親学級の申し込み", "予約開始しました"]);
});
