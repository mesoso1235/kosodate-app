import * as store from "../store.js";
import { loadData, getDateCtx } from "../data.js";
import { startOfDay, countdown, greeting, fmtJa, fmtShort, parseYmd } from "../dates.js";
import { enrich, pickThisWeek } from "../procedures.js";
import { mergeTimeline } from "../util.js";
import { esc, badge, extLink } from "../ui.js";

function countdownCard(ctx, today) {
  const c = countdown(ctx, today);
  if (c.kind === "born") {
    return `<section class="hero" aria-label="日数">
      <p class="hero-lead">赤ちゃんが生まれて</p>
      <p class="hero-num"><strong>${c.day}</strong><span>日目</span></p>
      <p class="hero-foot">毎日おつかれさまです。ふたりのペースで。</p></section>`;
  }
  if (c.kind === "before") {
    const what = c.isBirth ? "誕生日" : "出産予定日";
    const msg = c.days === 0 ? "今日が予定日です。落ち着いて待ちましょう。" : `${what}は ${fmtJa(c.target)}`;
    return `<section class="hero" aria-label="カウントダウン">
      <p class="hero-lead">赤ちゃんに会えるまで</p>
      <p class="hero-num"><span>あと</span><strong>${c.days}</strong><span>日</span></p>
      <p class="hero-foot">${esc(msg)}</p></section>`;
  }
  if (c.kind === "pastdue") {
    return `<section class="hero" aria-label="予定日">
      <p class="hero-lead">予定日から</p>
      <p class="hero-num"><strong>${c.days}</strong><span>日</span></p>
      <p class="hero-foot">生まれたら、<a href="#/settings">設定</a>で誕生日を入れてください。</p></section>`;
  }
  return `<section class="hero"><p class="hero-lead">まず<a href="#/settings">設定</a>で出産予定日を入れてください。</p></section>`;
}

function todoCard(list, today) {
  const rows = list
    .map((x) => {
      const cls = x.status ? x.status.kind : "";
      const dl = x.status ? `<span class="badge dl ${esc(cls)}">${esc(x.status.label)}</span>` : "";
      return `<li><a class="row-link" href="#/todo"><span class="row-main">${esc(x.title)}</span>${dl}</a></li>`;
    })
    .join("");
  return `<section class="card"><div class="card-head"><h2>今週やること</h2><a class="more" href="#/todo">すべて見る</a></div>
    ${rows ? `<ul class="plain">${rows}</ul>` : `<p class="muted">いま急ぐ手続きはありません。</p>`}</section>`;
}

function newsCard(items) {
  const rows = items
    .map((x) => {
      const d = x.ts ? fmtShort(new Date(x.ts)) : "";
      return `<li><a class="row-link" href="#/news"><span class="row-main">${esc(x.title)}</span>${badge(x.group, "src")}<span class="row-date">${esc(d)}</span></a></li>`;
    })
    .join("");
  return `<section class="card"><div class="card-head"><h2>新着のお知らせ</h2><a class="more" href="#/news">もっと見る</a></div>
    ${rows ? `<ul class="plain">${rows}</ul>` : `<p class="muted">まだありません。毎朝6時に集めに行きます。</p>`}</section>`;
}

function eventsCard(events, today) {
  const favIds = new Set(store.getFavorites("event").map((f) => f.item_id));
  const list = events
    .filter((e) => favIds.has(e.id))
    .map((e) => ({ e, s: parseYmd(e.start), en: parseYmd(e.end) }))
    .filter((x) => x.s && (x.en || x.s).getTime() >= today.getTime())
    .sort((a, b) => a.s - b.s)
    .slice(0, 3);
  const rows = list
    .map(({ e, s }) => `<li><a class="row-link" href="#/search/events"><span class="row-main">${esc(e.title)}</span><span class="row-date">${esc(fmtShort(s))}</span></a></li>`)
    .join("");
  return `<section class="card"><div class="card-head"><h2>気になるイベント</h2><a class="more" href="#/search/events">イベントを探す</a></div>
    ${rows ? `<ul class="plain">${rows}</ul>` : `<p class="muted">イベントの ☆ を押すと、ここに並びます。</p>`}</section>`;
}

export async function render() {
  const today = startOfDay(new Date());
  const ctx = getDateCtx();
  const [proc, news, events] = await Promise.all([loadData("procedures"), loadData("news"), loadData("events")]);
  const checks = store.getChecks();
  const week = pickThisWeek(enrich(proc.items, ctx, today), checks, 5);
  const timeline = mergeTimeline(news.items, store.getNotices()).slice(0, 3);
  const html = `<h1 class="greeting">${esc(greeting(new Date().getHours()))}</h1>
    ${countdownCard(ctx, today)}
    ${todoCard(week, today)}
    ${newsCard(timeline)}
    ${eventsCard(events.items, today)}`;
  return { html };
}
