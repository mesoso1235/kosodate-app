# こそだてポケット 設計書

- 作成日: 2026-10-13
- 利用者: 世田谷区在住の夫婦2人（第一子を出産予定）
- 方針: まず夫婦2人専用で使う → 手応えがあれば一般公開へ広げる

## 1. 目的

区・都・民間団体に散らばった子育て情報を **1つのアプリ** に集め、
「何を・いつまでに・どこで」が迷わず分かる状態をつくる。
保活も手続きもイベントも、ここを開けば完結する「子育てスーパーアプリ」を目指す。

## 2. 全体構成

```
[各サイト・オープンデータ] --毎朝6時--> [GitHub Actions: collector(Python)]
                                              | data/*.json をコミット
                                              v
[スマホ(ホーム画面に追加)] <--- [GitHub Pages: アプリ画面(HTML/CSS/JS)]
          |  チェック・お気に入り・メモ・LINEお知らせ
          v
      [Supabase: DB + 認証 + Edge Function(line-webhook)]
          ^
[区LINEのメッセージを転送] --> [自作LINEボット] --webhook--+
```

| 部品 | 置き場所 | 役割 |
|---|---|---|
| アプリ画面 | GitHub Pages（リポジトリ直下） | 表示専用。ビルド不要の素のHTML/CSS/JS（ESモジュール） |
| 静的データ | `data/*.json` | 手続き・サービス図鑑（手書きキュレーション）、ニュース・イベント・施設（自動収集） |
| 自動収集 | `collector/` + `.github/workflows/collect.yml` | 毎朝 06:00 JST に実行し、変更があれば `data/` をコミット |
| 共有データ | Supabase | 夫婦のチェック、お気に入り、メモ、LINEから来たお知らせ |
| LINE受付 | Supabase Edge Function `line-webhook` | 署名を検証し、テキストを `notices` に保存して「追加しました」と返信 |

**Supabaseが未設定でも動く**: `assets/config.js` が空なら「ローカルモード」で動作する
（チェックなどは端末内の localStorage に保存し、LINEお知らせは非表示）。
設定すると自動で共有モードに切り替わる。公開直後から使い始められるようにするため。

## 3. 画面

下部タブ5つ。スマホ縦向きを基本にし、PCでも崩れないようにする。

1. **ホーム**: 予定日（または誕生日）までの残り日数、今週やること（タイムラインから期限が近い未完了の上位5件）、新着お知らせ3件、気になるイベント
2. **やること**: 手続きタイムライン。「妊娠中 / 出産直後(〜14日) / 〜1か月 / 〜4か月 / 〜1年」の段階に分け、各項目に期限日（予定日・誕生日から自動計算）、どこで、持ち物、公式リンク、夫婦共有チェック（誰がチェックしたか表示）
3. **お知らせ**: 自動収集ニュースとLINE転送を時系列で1本にまとめる。発信元で絞り込み（区 / 都 / 民間 / LINE）。新着は「NEW」バッジ（最終閲覧以降）
4. **さがす**: 上部サブタブ
   - サービス図鑑: ネウボラ、産後ケア等をカード表示。段階別・カテゴリ別フィルタ、キーワード検索
   - イベント: 収集したイベントを日付順に表示。お気に入り登録
   - 地図: 施設を地図に表示（Leaflet + OpenStreetMap）。種別で絞り込み
   - 保活: 保育園一覧（地図連動）、各園の見学メモ・候補順位（夫婦共有）、区の入園案内と空き状況への公式リンク
5. **設定**: 出産予定日／誕生日の入力（誕生後は誕生日を基準に再計算）、ログイン状態、LINEボットの使い方、データの最終更新日時

## 4. データ形式

すべて UTF-8 JSON。日付は ISO 8601（`YYYY-MM-DD` または日時）。

### data/procedures.json（手書き・重要）
```json
{
  "verified_at": "2026-10-13",
  "items": [{
    "id": "birth-registration",
    "title": "出生届",
    "stage": "pregnancy | newborn | month1 | month4 | year1",
    "category": "届出 | お金 | 医療 | 健診 | 保育 | 仕事 | 準備 | ケア",
    "who": "父 | 母 | どちらでも",
    "anchor": "due | birth",
    "start_offset_days": 0,
    "deadline_offset_days": 13,
    "deadline_note": "生まれた日を含めて14日以内",
    "where": "区役所・総合支所・出張所",
    "how": "手続きの流れの要点",
    "bring": ["出生届（出生証明書つき）", "母子健康手帳"],
    "summary": "一言で何か",
    "priority": "high | normal",
    "url": "公式ページURL（必須）",
    "source": "世田谷区 | 東京都 | 国 | 勤務先 | 健康保険"
  }]
}
```
期限日 = 基準日（anchor）+ deadline_offset_days。null は期限なし。

### data/services.json（手書き）
```json
{
  "verified_at": "2026-10-13",
  "items": [{
    "id": "neuvola",
    "name": "世田谷版ネウボラ",
    "category": "相談 | 産後ケア | ひろば | 講座 | 一時預かり | 支援 | 情報",
    "stages": ["pregnancy", "newborn", "infant", "toddler"],
    "summary": "何ができるか（2〜3文）",
    "for_whom": "対象",
    "cost": "費用",
    "how_to_apply": "申込方法",
    "provider": "世田谷区 | NPO法人せたがや子育てネット 等",
    "url": "公式URL（必須）",
    "tags": ["妊娠中から", "無料"]
  }]
}
```

### data/news.json（自動）
```json
{ "updated_at": "...", "items": [{ "id": "urlのsha1先頭12文字", "title": "", "url": "", "source_id": "setagaya", "source": "世田谷区", "category": "区 | 都 | 民間", "published_at": "YYYY-MM-DD or null" }] }
```
新しい順、最大300件。子育てに関係する語（子育て/妊娠/出産/乳幼児/保育/児童/子ども/ひろば 等）で絞り込む（子育て専門サイトは絞り込まない）。

### data/events.json（自動）
```json
{ "updated_at": "...", "items": [{ "id": "", "title": "", "start": "YYYY-MM-DD", "end": null, "time": "10:00-11:30", "place": "", "target": "", "url": "", "source": "" }] }
```

### data/facilities.json（自動・オープンデータ）
```json
{ "updated_at": "...", "items": [{ "id": "", "name": "", "type": "認可保育園 | 認証保育所 | 小規模保育 | 幼稚園 | 児童館 | おでかけひろば | 子育てステーション | 授乳室 | 小児科", "address": "", "lat": 35.0, "lng": 139.0, "tel": "", "url": "", "source": "", "license": "CC BY 4.0" }] }
```

### data/sources.json（自動）
各収集元の最終成功日時・件数・エラー。設定画面で「データの最終更新」として表示する。

## 5. Supabase

### テーブル
- `allowed_users(email text pk)` … 入れる人のメールアドレス（夫婦2人）
- `checks(item_id text pk, done boolean, done_by text, updated_at timestamptz)`
- `favorites(item_type text, item_id text, note text, rank int, created_by text, updated_at timestamptz, pk(item_type,item_id))` … イベントのお気に入り、保活の見学メモ・候補順位
- `notices(id uuid pk, source text default 'line', title text, body text, url text, received_at timestamptz)`
- `settings(key text pk, value text)` … `due_date`, `birth_date`

### セキュリティ
- 全テーブルで RLS（行単位のアクセス制御）を有効化。`auth.email() in allowed_users` のときだけ読み書き可
- ログインはメールのマジックリンク（パスワード不要）
- アプリ側に置くのは公開して問題ない anon キーのみ。service_role キーは Edge Function の環境変数だけに置く
- Realtime でチェックの変更を相手の画面に即時反映

### LINE ボット（Edge Function `line-webhook`）
- `X-Line-Signature` を Channel secret で HMAC-SHA256 検証。不一致は 401
- テキストメッセージ: 1行目を title、全文を body、本文中の最初のURLを url として `notices` に保存し、返信「お知らせに追加しました」
- 環境変数 `ALLOWED_LINE_USER_IDS`（カンマ区切り）が設定されていれば、それ以外の送信者は無視。メッセージ「ID」には送信者の userId を返信（初期設定用）
- 費用: 受信と応答メッセージは無料

## 6. 自動収集（collector）

- Python 3.12、`requests` / `beautifulsoup4` / `feedparser`
- 収集元ごとに1ファイル（`collector/sources/*.py`）。共通の型 `fetch() -> list[dict]`
- 礼儀: User-Agent に連絡先リポジトリを明記、robots.txt を守る、収集元ごとに1秒以上間隔、1日1回
- 1つの収集元が失敗しても他は続行し、前回データを残す。失敗は `sources.json` に記録
- テスト: 保存したHTML/フィードのサンプルで各パーサーを検証（pytest）。ネットワークには触れない

## 7. 情報の正確さ

- 手続き・サービスの各項目は公式URL必須。画面に「確認日 2026-10-13・公式ページで最新情報を確認」を表示
- 手書きデータは区・都・国の公式ページのみを根拠にする。確認できない内容は書かない

## 8. 公開

- GitHub リポジトリ（Private推奨。ただし無料プランでPrivateのPagesは不可のため、Publicにする。個人情報はリポジトリに一切置かない：予定日・メール・チェック状態はすべて Supabase 側）
- Pages: main ブランチ直下を公開
- PWA: `manifest.webmanifest` + Service Worker で「ホーム画面に追加」とオフライン表示に対応

## 9. 作業分担（モデル使い分け）

| 作業 | 担当 |
|---|---|
| 情報源・オープンデータの下調べ | Haiku |
| 手続きタイムライン・サービス図鑑のデータ作成（正確さ重視） | Sonnet |
| 収集プログラム + テスト + Actions | Sonnet |
| アプリ画面（PWA） | Sonnet |
| Supabase スキーマ + LINE Edge Function | Sonnet |
| 設計・統合・最終確認・セットアップ手順書 | Opus |

## 10. 利用者にお願いすること（アカウント作成のみ）

1. GitHub アカウント（あれば不要）とリポジトリへのアップロード許可
2. Supabase アカウント作成 → プロジェクト作成
3. LINE Developers でボット（Messaging API チャネル）作成

手順は `docs/setup.md` に画面単位で書く。
