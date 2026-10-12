import * as store from "../store.js";
import { loadData } from "../data.js";
import { parseYmd, fmtYmd } from "../dates.js";
import { normalizeSources, nameFromEmail } from "../util.js";
import { APP_VERSION, GITHUB_REPO_URL } from "../links.js";
import { esc, extLink, pageTitle, delegate } from "../ui.js";

function fmtStamp(s) {
  if (!s) return "まだ成功していません";
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return String(s);
  const d = new Date(t);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export async function render() {
  const sourcesJson = await loadData("sources");
  const sources = normalizeSources(sourcesJson);
  const local = store.mode() === "local";
  const user = store.getUser();
  const due = store.getSetting("due_date") || "";
  const birth = store.getSetting("birth_date") || "";

  const account = local
    ? `<p>いまは<strong>ローカルモード</strong>です。チェックやメモは、この端末だけに保存されます。</p>
       <p class="muted">ふたりで共有したいときは、共有の準備（Supabase の設定）が要ります。済むと、チェックがお互いの画面にすぐ出ます。手順はセットアップ手順書にあります。</p>`
    : `<p><strong>共有モード</strong>でログイン中です。</p><p class="muted">${esc(user ? user.email : "")}（${esc(user ? nameFromEmail(user.email) : "")}さん）</p>
       <button type="button" class="btn secondary" data-action="signout">ログアウト</button>`;

  const sourceRows = sources.length
    ? `<ul class="plain stack">${sources
        .map((s) => `<li class="source"><div><strong>${esc(s.name)}</strong></div><div class="muted">最終更新 ${esc(fmtStamp(s.lastSuccess))}${s.count !== null && s.count !== undefined ? `・${esc(s.count)}件` : ""}</div>${s.error ? `<div class="err">取得できませんでした: ${esc(s.error)}</div>` : ""}</li>`)
        .join("")}</ul>`
    : `<p class="muted">まだありません。毎朝6時に集めに行きます。</p>`;

  const html = `${pageTitle("設定")}
    <section class="card"><h2>赤ちゃんの日付</h2>
      <div class="field"><label for="due">出産予定日</label><input id="due" type="date" data-action="date" data-key="due_date" value="${esc(due)}"></div>
      <div class="field"><label for="birth">誕生日（生まれたら入力）</label><input id="birth" type="date" data-action="date" data-key="birth_date" value="${esc(birth)}"></div>
      <p class="muted note">誕生日を入れると、期限を誕生日から数え直します。</p></section>
    <section class="card"><h2>ログインの状態</h2>${account}</section>
    <section class="card"><h2>LINEボットの使い方</h2>
      <p>区のLINEなどで届いたお知らせは、専用のLINEボットに転送すると、このアプリの「お知らせ」に並びます。</p>
      <ol class="steps"><li>届いたメッセージを長押しして「転送」を選ぶ</li><li>転送先に、こそだてポケットのLINEボットを選ぶ</li><li>「お知らせに追加しました」と返ってきたら完了</li></ol>
      <p class="muted note">${local ? "LINEのお知らせは、共有モードにすると表示されます。" : "最初の1回だけ、ボットに「ID」と送って返ってくる番号を管理者に伝えてください。"}</p></section>
    <section class="card"><h2>データの最終更新</h2>${sourceRows}</section>
    <section class="card"><h2>このアプリについて</h2>
      <p class="muted">バージョン ${esc(APP_VERSION)}</p><p>${extLink(GITHUB_REPO_URL, "GitHubのリポジトリ")}</p>
      <p class="muted note">手続きの内容は公式ページをもとにしています。申し込む前に、必ず公式ページで最新の情報を確認してください。</p></section>`;

  function mount(root, { rerender }) {
    root.onchange = (ev) => {
      const el = ev.target.closest('[data-action="date"]');
      if (!el) return;
      const v = el.value;
      if (v && !parseYmd(v)) return;
      store.setSetting(el.dataset.key, v ? fmtYmd(parseYmd(v)) : "");
    };
    delegate(root, "click", async (a) => {
      if (a === "signout") await store.signOut();
    });
  }
  return { html, mount };
}
