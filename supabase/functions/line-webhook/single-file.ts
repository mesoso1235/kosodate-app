// 自動生成: lib.ts + index.ts を1ファイルにまとめたもの(ダッシュボードのエディタに貼り付け用)。
// 元の lib.ts / index.ts を直したら、このファイルも同じ内容に更新すること。
// JWT 検証(Verify JWT)は必ずオフにしてデプロイ。
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";


/** LINE の X-Line-Signature(HMAC-SHA256 を base64 にしたもの)を検証する。 */
async function verifySignature(
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
function parseNotice(text: string): { title: string; body: string; url: string | null } {
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const chars = Array.from(firstLine);
  const title = chars.length > 80 ? chars.slice(0, 80).join("") + "…" : firstLine;
  const m = text.match(/https?:\/\/[^\s<>"'\u3000、。，．）」』】]+/);
  const url = m ? m[0].replace(/[.,;:!?)\]]+$/, "") : null;
  return { title, body: text, url };
}

/** allowList はカンマ区切り。空・未設定なら全員許可。 */
function isAllowedSender(userId: string, allowList: string | undefined): boolean {
  const ids = (allowList ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return true;
  return ids.includes(userId);
}


const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";

async function reply(token: string, replyToken: string, text: string) {
  const res = await fetch(LINE_REPLY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) console.error("LINE reply failed", res.status, await res.text());
}

// deno-lint-ignore no-explicit-any
async function handleEvent(ev: any, env: Record<string, string | undefined>, // deno-lint-ignore no-explicit-any
  db: SupabaseClient<any>) {
  if (ev?.type !== "message" || !ev.replyToken) return;
  const token = env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  const userId: string = ev.source?.userId ?? "";

  if (ev.message?.type !== "text") {
    if (isAllowedSender(userId, env.ALLOWED_LINE_USER_IDS)) {
      await reply(token, ev.replyToken, "テキストのメッセージだけ取り込めます。");
    }
    return;
  }

  const text: string = ev.message.text ?? "";
  if (text.trim().toLowerCase() === "id") {
    await reply(token, ev.replyToken, userId || "userId を取得できませんでした");
    return;
  }
  if (!isAllowedSender(userId, env.ALLOWED_LINE_USER_IDS)) return;

  const n = parseNotice(text);
  const { error } = await db.from("notices").insert({
    source: "line",
    title: n.title,
    body: n.body,
    url: n.url,
  });
  if (error) {
    console.error("insert failed", error);
    await reply(token, ev.replyToken, "保存できませんでした。少し待って、もう一度送ってください");
    return;
  }
  await reply(token, ev.replyToken, "お知らせに追加しました");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const env = {
    LINE_CHANNEL_SECRET: Deno.env.get("LINE_CHANNEL_SECRET"),
    LINE_CHANNEL_ACCESS_TOKEN: Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN"),
    ALLOWED_LINE_USER_IDS: Deno.env.get("ALLOWED_LINE_USER_IDS"),
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  };

  const raw = await req.text();
  const sig = req.headers.get("x-line-signature") ?? "";
  if (!(await verifySignature(env.LINE_CHANNEL_SECRET ?? "", raw, sig))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let events: unknown[] = [];
  try {
    events = JSON.parse(raw)?.events ?? [];
  } catch (e) {
    console.error("bad json", e);
  }
  if (events.length === 0) return new Response("OK", { status: 200 }); // 「検証」ボタンの空イベント

  const db = createClient(env.SUPABASE_URL ?? "", env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
  for (const ev of events) {
    try {
      await handleEvent(ev, env, db);
    } catch (e) {
      console.error("event failed", e);
    }
  }
  return new Response("OK", { status: 200 });
});
