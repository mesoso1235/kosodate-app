# こそだてポケット セットアップ手順

全部で3ステップです。①だけ終われば、すぐにスマホで使い始められます（その時点ではチェックはスマホごとに別々）。②③は夫婦での共有とLINE転送のためのものです。

## ① GitHub に公開する（約10分）

1. GitHub アカウントを作る: https://github.com/signup （すでにあれば不要）
2. このパソコンで Claude に「GitHubに公開して」と頼む
   - Claude が GitHub CLI（GitHubを操作する公式ツール）を入れ、`kosodate-app` という名前のリポジトリ（ファイル置き場）を作ってアップロードします
   - 途中でブラウザが開くので、GitHub の画面で「Authorize（許可）」を押してください
3. 公開設定（Claude が代わりに行います）
   - Settings → Pages → Source を「Deploy from a branch」、Branch を `main` / `(root)` にする
   - Settings → Actions → General → Workflow permissions を「Read and write permissions」にする（毎朝の自動更新が保存できるように）
4. 数分後、`https://<ユーザー名>.github.io/kosodate-app/` で開けます

### スマホのホーム画面に追加する
- iPhone（Safari）: 共有ボタン → 「ホーム画面に追加」
- Android（Chrome）: 右上の︙ → 「ホーム画面に追加」 または 「アプリをインストール」

アイコンから開くと、アプリのように全画面で表示されます。

## ② 夫婦で共有できるようにする（Supabase、約15分）

詳しい手順は [setup-supabase-line.md](setup-supabase-line.md) の前半にあります。終わったら、次の2つを Claude に渡してください。`assets/config.js` に書き込みます。

- Project URL（`https://xxxx.supabase.co`）
- anon public キー（公開してよい鍵）

**service_role キーは絶対に誰にも渡さないでください**（Claude にも、どこかに貼るのもダメです）。LINEボットの設定でも、このキーを手で入力する場面はありません。

## ③ LINE ボットを作る（約15分）

[setup-supabase-line.md](setup-supabase-line.md) の後半の手順です。完成したら、

- 区の公式LINEで気になるメッセージを長押し → 「転送」 → 自分のボットを選んで送信
- ボットから「お知らせに追加しました」と返ってくれば成功。アプリの「お知らせ」に LINE として表示されます

## 毎日の自動更新について

- 毎朝6時に GitHub が区・団体のサイトを確認し、新しいお知らせ・イベントを取り込みます
- 施設（保育園の空き状況など）は週1回更新します
- GitHub の「Actions」タブ → 「collect」→「Run workflow」で、今すぐ更新することもできます

## アプリを更新したとき

画面のファイルを直したら `sw.js` の `VERSION` の数字を1つ上げます（上げないと、スマホに古い画面が残ることがあります）。Claude に頼めば自動でやります。
