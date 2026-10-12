// 純粋関数のみ。Web Crypto だけを使うので Deno でも Node 24 でも動く。

/** LINE の X-Line-Signature(HMAC-SHA256 を base64 にしたもの)を検証する。 */
export async function verifySignature(
  channelSecret: string,
  rawBody: string,
  signatureB64: string,
): Promise<boolean> {
  if (!channelSecret || !signatureB64) return false;
  let sig: Uint8Array;
  try {
    const bin = atob(signatureB64);
    sig = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  // subtle.verify は定数時間で比較する
  return await crypto.subtle.verify("HMAC", key, sig, enc.encode(rawBody));
}

/** テキストを「お知らせ」の形に整える。 */
export function parseNotice(text: string): { title: string; body: string; url: string | null } {
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const chars = Array.from(firstLine);
  const title = chars.length > 80 ? chars.slice(0, 80).join("") + "…" : firstLine;
  const m = text.match(/https?:\/\/[^\s<>"'\u3000、。，．）」』】]+/);
  const url = m ? m[0].replace(/[.,;:!?)\]]+$/, "") : null;
  return { title, body: text, url };
}

/** allowList はカンマ区切り。空・未設定なら全員許可。 */
export function isAllowedSender(userId: string, allowList: string | undefined): boolean {
  const ids = (allowList ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return true;
  return ids.includes(userId);
}
