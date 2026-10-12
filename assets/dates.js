// 日付まわりの計算（すべて端末のローカル日付で行う。UTCのずれを避ける）

export const DEFAULT_DUE = ""; // 予定日は設定画面で入力（リポジトリに個人の日付を置かない）
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** "YYYY-MM-DD"（先頭一致）→ ローカル0時のDate。不正なら null */
export function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ""));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
  return d;
}

export function fmtYmd(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** a から b までの暦日の差（b - a）。時刻・夏時間の影響を受けない */
export function diffDays(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

/** 2030年3月15日 */
export function fmtJa(d) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 3/15(金) */
export function fmtShort(d) {
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`;
}

/**
 * 手続きの基準日。anchor が birth のとき、誕生日が未入力なら予定日で代用（estimated: true）
 * ctx = { due: Date|null, birth: Date|null }
 */
export function anchorDate(item, ctx) {
  if (item && item.anchor === "birth") {
    if (ctx.birth) return { date: ctx.birth, estimated: false };
    return ctx.due ? { date: ctx.due, estimated: true } : null;
  }
  return ctx.due ? { date: ctx.due, estimated: false } : null;
}

function offsetDate(item, ctx, key) {
  const off = item ? item[key] : null;
  if (off === null || off === undefined || Number.isNaN(Number(off))) return null;
  const a = anchorDate(item, ctx);
  if (!a) return null;
  return { date: addDays(a.date, Number(off)), estimated: a.estimated };
}

/** 期限日 = 基準日 + deadline_offset_days。期限なしは null */
export function deadlineOf(item, ctx) {
  return offsetDate(item, ctx, "deadline_offset_days");
}

/** 開始日 = 基準日 + start_offset_days。指定なしは null（いつでも可） */
export function startOf(item, ctx) {
  return offsetDate(item, ctx, "start_offset_days");
}

/** 期限までの状態。days は今日から見た残り日数（負なら超過） */
export function deadlineStatus(deadlineDate, today) {
  const days = diffDays(today, deadlineDate);
  if (days < 0) return { days, kind: "overdue", label: "期限切れ" };
  if (days === 0) return { days, kind: "today", label: "今日まで" };
  return { days, kind: days <= 14 ? "soon" : "later", label: `あと${days}日` };
}

/**
 * ホームの大きなカード用。
 * born: 誕生日を過ぎている → 生まれて N日目（誕生日当日が1日目）
 * before: 予定日（または未来の誕生日）まで あとN日
 * pastdue: 予定日を過ぎたが誕生日が未入力
 */
export function countdown(ctx, today) {
  if (ctx.birth && diffDays(ctx.birth, today) >= 0) {
    return { kind: "born", day: diffDays(ctx.birth, today) + 1 };
  }
  const target = ctx.birth || ctx.due;
  if (!target) return { kind: "none" };
  const days = diffDays(today, target);
  if (days >= 0) return { kind: "before", days, target, isBirth: !!ctx.birth };
  return { kind: "pastdue", days: -days, target };
}

export function greeting(hour) {
  if (hour < 5) return "夜遅くまでおつかれさま";
  if (hour < 11) return "おはようございます";
  if (hour < 17) return "こんにちは";
  return "こんばんは";
}
