import * as store from "../store.js";
import { loadData, getDateCtx } from "../data.js";
import { startOfDay, fmtShort } from "../dates.js";
import { enrich, byDeadline } from "../procedures.js";
import { nameFromEmail } from "../util.js";
import { esc, badge, chips, emptyState, extLink, pageTitle, delegate } from "../ui.js";

export const STAGES = [
  { id: "pregnancy", label: "妊娠中" },
  { id: "newborn", label: "出産〜2週間" },
  { id: "month1", label: "〜1か月" },
  { id: "month4", label: "〜4か月" },
  { id: "year1", label: "〜1歳" },
];
const FILTERS = [
  { value: "all", label: "全部" },
  { value: "open", label: "未完了" },
  { value: "father", label: "父" },
  { value: "mother", label: "母" },
  { value: "soon", label: "期限が近い" },
];

let filter = "all";
const expanded = new Set();

function passes(x, done) {
  switch (filter) {
    case "open": return !done;
    case "father": return x.who === "父" || x.who === "どちらでも";
    case "mother": return x.who === "母" || x.who === "どちらでも";
    case "soon": return !done && x.status && x.status.days <= 30;
    default: return true;
  }
}

function itemHtml(x, checks) {
  const c = checks[x.id];
  const done = !!(c && c.done);
  const open = expanded.has(x.id);
  const pid = `p-${x.index}`;
  const name = c && c.done ? nameFromEmail(c.done_by) : "";
  let dl = "";
  if (x.deadline) {
    const dateTxt = fmtShort(x.deadline.date);
    const est = x.deadline.estimated ? `<span class="badge est">予定日からの目安</span>` : "";
    dl = done
      ? `<span class="badge muted-b">〜${esc(dateTxt)}</span>`
      : `<span class="badge dl ${esc(x.status.kind)}">${esc(x.status.label)}</span><span class="badge muted-b">〜${esc(dateTxt)}</span>${est}`;
  } else if (x.deadline_offset_days !== null && x.deadline_offset_days !== undefined) {
    // 期限はあるが、基準になる予定日・誕生日が未入力
    dl = `<a class="badge dl soon" href="#/settings">予定日を入れると期限が出ます</a>`;
  } else {
    dl = `<span class="badge muted-b">期限なし</span>`;
  }
  const bring = Array.isArray(x.bring) && x.bring.length ? `<dt>持ち物</dt><dd><ul class="bullets">${x.bring.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></dd>` : "";
  const field = (k, v) => (v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : "");
  return `<li class="item${done ? " done" : ""}">
    <div class="item-head">
      <input type="checkbox" class="check" data-action="check" data-id="${esc(x.id)}" ${done ? "checked" : ""} aria-label="${esc(x.title)}を完了にする">
      <button type="button" class="item-title" data-action="toggle" data-id="${esc(x.id)}" aria-expanded="${open}" aria-controls="${pid}">${esc(x.title)}${x.priority === "high" ? '<span class="sr-only">（大切）</span>' : ""}</button>
    </div>
    <div class="item-badges">${dl}${badge(x.who, "who")}${badge(x.category, "cat")}${x.priority === "high" ? badge("大切", "high") : ""}</div>
    ${done ? `<p class="done-by">✓ ${esc(name ? name + "がチェック" : "チェック済み")}</p>` : ""}
    <div class="item-body" id="${pid}" ${open ? "" : "hidden"}>
      ${x.summary ? `<p>${esc(x.summary)}</p>` : ""}
      <dl class="facts">${field("流れ", x.how)}${field("どこで", x.where)}${bring}${field("期限のこと", x.deadline_note)}${field("出どころ", x.source)}</dl>
      <p class="item-foot">${extLink(x.url, "公式ページを見る")}${x.verified ? `<span class="muted"> 確認日 ${esc(x.verified)}</span>` : ""}</p>
    </div></li>`;
}

export async function render() {
  const today = startOfDay(new Date());
  const ctx = getDateCtx();
  const proc = await loadData("procedures");
  const checks = store.getChecks();
  const list = enrich(proc.items, ctx, today).map((x) => ({ ...x, verified: proc.verified_at || "" }));
  let body;
  if (!list.length) {
    body = emptyState();
  } else {
    body = STAGES.map((st) => {
      const all = list.filter((x) => x.stage === st.id).sort(byDeadline);
      if (!all.length) return "";
      const doneN = all.filter((x) => checks[x.id] && checks[x.id].done).length;
      const pct = Math.round((doneN / all.length) * 100);
      const shown = all.filter((x) => passes(x, !!(checks[x.id] && checks[x.id].done)));
      return `<section class="stage" aria-labelledby="st-${st.id}">
        <div class="stage-head"><h2 id="st-${st.id}">${esc(st.label)}</h2><span class="muted">${doneN} / ${all.length} 完了</span></div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(st.label)}の進み具合"><span style="width:${pct}%"></span></div>
        ${shown.length ? `<ul class="plain items">${shown.map((x) => itemHtml(x, checks)).join("")}</ul>` : `<p class="muted pad">この条件に合うものはありません。</p>`}
      </section>`;
    }).join("");
    const known = new Set(STAGES.map((s) => s.id));
    if (list.some((x) => !known.has(x.stage))) {
      const rest = list.filter((x) => !known.has(x.stage)).sort(byDeadline);
      body += `<section class="stage"><div class="stage-head"><h2>そのほか</h2></div><ul class="plain items">${rest.map((x) => itemHtml(x, checks)).join("")}</ul></section>`;
    }
  }
  const unverified = ctx.birth ? "" : `<p class="muted note">出産前は、予定日をもとにした期限の目安です。生まれたら設定で誕生日を入れると、正しい期限に直ります。</p>`;
  const html = `${pageTitle("やること", "ふたりで分けて、ひとつずつ。")}
    ${chips("filter", FILTERS, filter, "表示の絞り込み")}${unverified}${body}`;

  function mount(root, { rerender }) {
    delegate(root, "click", (action, el) => {
      if (action === "filter") { filter = el.dataset.value; rerender(); }
      else if (action === "toggle") {
        const id = el.dataset.id;
        const open = !expanded.has(id);
        open ? expanded.add(id) : expanded.delete(id);
        el.setAttribute("aria-expanded", String(open));
        const panel = document.getElementById(el.getAttribute("aria-controls"));
        if (panel) panel.hidden = !open;
      }
    });
    root.onchange = (ev) => {
      const el = ev.target.closest('[data-action="check"]');
      if (el) store.setCheck(el.dataset.id, el.checked);
    };
  }
  return { html, mount };
}
