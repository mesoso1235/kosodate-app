# こそだてポケット

世田谷区の子育て情報を、ひとつのアプリにまとめた家族用の PWA です。

- **やること**: 出産予定日・誕生日から逆算した手続きタイムライン（夫婦でチェック共有）
- **お知らせ**: 世田谷区・せたがや子育てネット・助産師会などの新着と、LINE で転送したメッセージ
- **さがす**: サービス図鑑 / イベント / 施設マップ / 保活（候補・メモ・空き状況）

## 構成

| 場所 | 中身 |
|---|---|
| `index.html`, `assets/` | アプリ画面（ビルド不要、GitHub Pages で配信） |
| `data/` | 表示データ。`procedures.json` `services.json` は手で作ったもの、ほかは自動収集 |
| `collector/` | 毎朝の自動収集（Python）。`python -m collector.collect` |
| `.github/workflows/collect.yml` | 毎日 06:00 JST に収集してコミット |
| `supabase/` | 共有データの表定義と LINE ボット（Edge Function） |
| `docs/` | 設計書・セットアップ手順 |

## テスト

```
python -m pytest collector -q
node --test tests/frontend/*.test.mjs
node --test supabase/functions/line-webhook/lib.test.ts
```

## データについて

手続き・サービス情報は公式ページを確認した時点（`verified_at`）の内容です。必ずリンク先の公式ページで最新情報を確認してください。施設データは世田谷区オープンデータ（CC BY 4.0）を利用しています。
