// アプリ内で使う固定のリンクや定数

export const APP_VERSION = "0.1.0";

// GitHub リポジトリ（公開後に実際のURLへ差し替える）
export const GITHUB_REPO_URL = "https://github.com/mesoso1235/kosodate-app";

// 保活ページの公式リンク（世田谷区の公式ページ）
export const HOKATSU_LINKS = [
  { label: "保育園の空き状況（毎週更新）", url: "https://www.city.setagaya.lg.jp/01044/1577.html" },
  { label: "保育園入園の流れ", url: "https://www.city.setagaya.lg.jp/01044/1551.html" },
  { label: "申込方法", url: "https://www.city.setagaya.lg.jp/01044/1564.html" },
  { label: "申込方法（その2）", url: "https://www.city.setagaya.lg.jp/01044/1565.html" },
];

// 「保活」画面に出す施設の種別。「保育」を含む種別は自動で対象になるので、
// ここには含まれない名前の種別だけ足せばよい。
export const HOKATSU_TYPES = ["認可保育園", "認証保育所", "小規模保育", "保育所", "保育園"];

// 地図の中心（世田谷区）
export const MAP_CENTER = { lat: 35.6464, lng: 139.6533, zoom: 13 };
