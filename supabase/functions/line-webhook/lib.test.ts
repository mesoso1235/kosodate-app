// 実行方法: node --test supabase/functions/line-webhook/lib.test.ts
// Node 24 は TypeScript の型を自動で取り除いて実行できるため、追加フラグは不要。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySignature, parseNotice, isAllowedSender } from "./lib.ts";

const secret = "test-secret";
const body = JSON.stringify({ events: [{ type: "message" }] });
const sign = (s: string, b: string) => createHmac("sha256", s).update(b).digest("base64");

test("verifySignature: 正しい署名は true", async () => {
  assert.equal(await verifySignature(secret, body, sign(secret, body)), true);
});
test("verifySignature: 本文が改ざんされていれば false", async () => {
  assert.equal(await verifySignature(secret, body + " ", sign(secret, body)), false);
});
test("verifySignature: secret が違えば false", async () => {
  assert.equal(await verifySignature("other", body, sign(secret, body)), false);
});
test("verifySignature: 空・不正な署名は false", async () => {
  assert.equal(await verifySignature(secret, body, ""), false);
  assert.equal(await verifySignature(secret, body, "!!!not-base64"), false);
});

test("parseNotice: 1行目が title、全文が body", () => {
  const r = parseNotice("\n  \n 件名です \n本文2行目");
  assert.equal(r.title, "件名です");
  assert.equal(r.body, "\n  \n 件名です \n本文2行目");
  assert.equal(r.url, null);
});
test("parseNotice: 80文字を超える title は切って … を付ける", () => {
  const r = parseNotice("あ".repeat(100));
  assert.equal(r.title, "あ".repeat(80) + "…");
  const exact = parseNotice("い".repeat(80));
  assert.equal(exact.title, "い".repeat(80));
});
test("parseNotice: 最初の URL を取り出す", () => {
  const r = parseNotice("お知らせ\n詳細 https://example.com/a?b=1 と http://example.org/x");
  assert.equal(r.url, "https://example.com/a?b=1");
});
test("parseNotice: 全角の句読点や括弧で URL を切る", () => {
  assert.equal(parseNotice("詳しくは https://example.com/a。").url, "https://example.com/a");
});

test("isAllowedSender: 空・未設定なら全員許可", () => {
  assert.equal(isAllowedSender("U1", ""), true);
  assert.equal(isAllowedSender("U1", undefined as unknown as string), true);
  assert.equal(isAllowedSender("U1", "  , "), true);
});
test("isAllowedSender: 一致すれば許可", () => {
  assert.equal(isAllowedSender("U2", "U1, U2 ,U3"), true);
});
test("isAllowedSender: 不一致なら拒否", () => {
  assert.equal(isAllowedSender("U9", "U1,U2"), false);
});
