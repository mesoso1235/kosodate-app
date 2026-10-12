import * as store from "../store.js";
import { loadData, getDateCtx } from "../data.js";
import { startOfDay, countdown, greeting, fmtShort, parseYmd, deadlineText } from "../dates.js";
import { enrich, pickNow } from "../procedures.js";
import { mergeTimeline, homeNotices } from "../util.js";
import { esc, extLink } from "../ui.js";

// あいさつの下に1行だけ。大きな数字にはしない
function daysLine(ctx, today) {
  const c = countdown(ctx, today);
  if (c.kind === "born") return `赤ちゃんが生まれて ${c.day}日目`;
  if (c.kind === "before") {
    if (c.days === 0) return c.isBirth ? "今日が誕生日です" : "今日が予定日です";
    return `${c.isBirth ? "誕生日" : "予定日"}まで あと${c.days}日（${esc(fmtShort(c.target))}）`;
  }
  if (c.kind === "pastdue") return `予定日から ${c.days}日。生まれたら<a href="#/settings">設定</a>で誕生日を入れてください`;
  return `まず<a href="#/settings">設定</a>で出産予定日を入れてください`;
}

function nowCard({ now, next }, today, hasDate) {
  const rows = now
    .map((x) => {
      const dl = deadlineText(x.deadline.date, today);
      return `<li><a class="row-link" href="#/todo"><span class="row-main">${esc(x.title)}</span><span class="dl-text ${dl.kind}">${esc(dl.text)}</span></a></li>`;
    })
    .join("");
  const overdueNote = now.some((x) => x.status.days < 0)
    ? `<p class="muted note">済んでいたら、<a href="#/todo">やること</a>でチェックを付けてください。</p>`
    : "";
  let empty = `<p class="muted">予定日を入れると、ここに手続きが並びます。</p>`;
  if (hasDate) {
    empty = next
      ? `<p class="muted">いま急ぐ手続きはありません。次は「${esc(next.title)}」（${esc(fmtShort(next.deadline.date))}まで）。</p>`
      : `<p class="muted">いま急ぐ手続きはありません。</p>`;
  }
  return `<section class="card"><div class="card-head"><h2>いまやること</h2><a class="more" href="#/todo">すべて見る</a></div>
    ${rows ? `<ul class="plain">${rows}</ul>${overdueNote}` : empty}</section>`;
}

// 期限のないものを1件だけ、控えめに
function spareLine(item) {
  if (!item) return "";
  return `<section class="spare" aria-label="手が空いたら"><h2 class="spare-head">手が空いたら</h2>
    <a class="spare-link" href="#/todo">${esc(item.title)}</a></section>`;
}

function noticesCard(items) {
  if (!items.length) return "";
  const rows = items
    .map((x) => {
      const d = x.ts ? fmtShort(new Date(x.ts)) : "";
      const date = `<span class="row-date">${esc(x.kind === "line" ? `LINE ${d}` : d)}</span>`;
      if (x.kind === "news" && x.url) {
        const link = extLink(x.url, x.title, "row-main");
        if (link) return `<li><div class="row-link">${link}${date}</div></li>`;
      }
      return `<li><a class="row-link" href="#/news"><span class="row-main">${esc(x.title || "（タイトルなし）")}</span>${date}</a></li>`;
    })
    .join("");
  return `<section class="card"><div class="card-head"><h2>申し込めるお知らせ</h2><a class="more" href="#/news">お知らせ一覧</a></div>
    <ul class="plain">${rows}</ul></section>`;
}

function eventsCard(events, today) {
  const favIds = new Set(store.getFavorites("event").map((f) => f.item_id));
  const list = events
    .filter((e) => favIds.has(e.id))
    .map((e) => ({ e, s: parseYmd(e.start), en: parseYmd(e.end) }))
    .filter((x) => x.s && (x.en || x.s).getTime() >= today.getTime())
    .sort((a, b) => a.s - b.s)
    .slice(0, 3);
  if (!list.length) return "";
  const rows = list
    .map(({ e, s }) => `<li><a class="row-link" href="#/search/events"><span class="row-main">${esc(e.title)}</span><span class="row-date">${esc(fmtShort(s))}</span></a></li>`)
    .join("");
  return `<section class="card"><div class="card-head"><h2>気になるイベント</h2><a class="more" href="#/search/events">イベントを探す</a></div>
    <ul class="plain">${rows}</ul></section>`;
}

export async function render() {
  const today = startOfDay(new Date());
  const ctx = getDateCtx();
  const [proc, news, events] = await Promise.all([loadData("procedures"), loadData("news"), loadData("events")]);
  const picked = pickNow(enrich(proc.items, ctx, today), store.getChecks());
  const notices = homeNotices(mergeTimeline(news.items, store.getNotices()), Date.now());
  const html = `<h1 class="greeting">${esc(greeting(new Date().getHours()))}</h1>
    <p class="days-line">${daysLine(ctx, today)}</p>
    ${nowCard(picked, today, !!(ctx.due || ctx.birth))}
    ${spareLine(picked.spare)}
    ${noticesCard(notices)}
    ${eventsCard(events.items, today)}`;
  return { html };
}
