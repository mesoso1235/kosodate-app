# Supabase と LINE ボットの準備手順

夫婦2人で「チェック」「お気に入り」「LINEお知らせ」を共有するための準備です。
すべて無料プランでできます。画面の文言は 2026年10月時点の公式案内にもとづきますが、細かい表示が違う場合は近い名前のものを探してください。

用意するもの: パソコン、メールアドレス(あなたとパートナーの2つ)、LINEアカウント

---

## パート1: Supabase(データの置き場)

### 1-1. アカウントとプロジェクトを作る

1. https://supabase.com を開き、右上の「Start your project」から GitHub アカウントかメールで登録します。
2. 「New project」を押します(組織の作成を求められたら、名前は何でもよく、プランは Free)。
3. 次のように入力して「Create new project」を押します。
   - Name: `kosodate`
   - Database Password: 「Generate a password」で自動生成してメモ帳に控える(普段は使いません)
   - Region: **Tokyo (Northeast Asia)**
   - Plan: **Free**
4. 1〜2分待つと、プロジェクトの画面が開きます。

### 1-2. データの入れ物を作る(schema.sql を実行)

1. 左メニューの **SQL Editor** を開きます。
2. このリポジトリの `supabase/schema.sql` をメモ帳などで開き、**全部コピー**します。
3. SQL Editor の空欄に貼り付け、右下の **Run** を押します。
4. 「Success」と出れば完了です(2回押しても壊れません)。

### 1-3. 2人のメールアドレスを登録する

このアプリは、ここに登録したメールの人だけが使えます。

1. SQL Editor で「New query」を押して新しい空欄を開きます。
2. 下の文のメールアドレスを2人分に書き換えて貼り付け、Run を押します。

```sql
insert into public.allowed_users values ('あなたのメール'), ('パートナーのメール') on conflict do nothing;
```

### 1-4. メールでログインできるようにする

パスワードの代わりに、メールに届くリンクを押すだけでログインする方式(マジックリンク)を使います。

1. 左メニューの **Authentication** を開きます。
2. **Sign In / Providers**(古い表示では Providers)の中の **Email** が Enabled(オン)になっているか確認します。オフならオンにします。
   - 「Confirm email」はオンのままで構いません。
3. 左の **URL Configuration** を開き、次を入力して Save します。
   - **Site URL**: `https://<github-username>.github.io/kosodate-app/`
   - **Redirect URLs** の「Add URL」: 同じ `https://<github-username>.github.io/kosodate-app/`(と、必要なら `https://<github-username>.github.io/kosodate-app/**`)
   - `<github-username>` は自分の GitHub ユーザー名に置き換えます。
4. 補足: 無料のメール送信は、1時間あたりの通数が少なめです。ログインのメールが届かないときは、少し待ってからもう一度試し、迷惑メールフォルダも見てください。

### 1-5. アプリに入れる2つの値をコピーする

1. 左下の歯車 **Project Settings** → **API**(または **API Keys**)を開きます。
2. 次の2つを控えます。これをアプリ開発担当(Claude)に伝えると `assets/config.js` に入ります。
   - **Project URL**(`https://xxxx.supabase.co` の形)
   - **anon public** キー(長い英数字。公開されても大丈夫な鍵)
3. 同じ画面にある **service_role** キーは、**絶対に誰にも見せない・チャットに貼らない・アプリやリポジトリに書かない**でください。データを全部読み書きできる「マスターキー」です。この手順書でも使いません(Edge Function には Supabase が自動で渡します)。
4. Project URL の `xxxx` の部分が **project-ref**(プロジェクトの識別文字)です。あとで使うので控えます。

---

## パート2: LINE ボット(区のLINEを転送して受け取る係)

### 2-1. LINE公式アカウントと Messaging API を用意する

1. https://developers.line.biz/console/ を開き、普段のLINEアカウントでログインします(メールアドレスの登録を求められることがあります)。
2. **Provider(プロバイダー)** を作ります。名前は何でもよく、例は `kosodate` です。
3. 「Create a new channel」→ **Messaging API** を選びます。
   - ボット作成の案内で LINE公式アカウントの作成を求められたら、その画面で作ります(アカウント名: `こそだてポケット` など、業種は個人でOK、**プランは無料のコミュニケーションプラン**)。
   - Channel name: `こそだてポケット`、Category / Subcategory は適当なものを選び、規約に同意して Create。
4. 作成後、チャネルの画面にタブが並びます。

### 2-2. 2つの値を控える

1. **Basic settings** タブ → **Channel secret** をコピーしてメモ帳へ。
2. **Messaging API** タブの一番下 → **Channel access token (long-lived)** の **Issue** を押し、出てきた長い文字列をコピーしてメモ帳へ。
3. この2つもパスワードと同じ扱いです。人に見せないでください。

### 2-3. ボットを友だち追加する

**Messaging API** タブの QR コードを、LINEアプリで読み取って友だち追加します(パートナーにも同じことをしてもらいます)。

---

## パート3: Edge Function(LINEからの連絡を受ける小さなプログラム)を置く

おすすめは**パソコンに何もインストールしない方法A**です。

### 方法A: Supabase の画面から貼り付ける

1. Supabase の左メニュー **Edge Functions** を開きます。
2. **Deploy a new function** → **Via Editor** を選びます。
3. 関数の名前を `line-webhook` にします(この名前でないと下の URL が変わります)。
4. エディタに最初から入っているサンプルのコードを**全部消し**、`supabase/functions/line-webhook/single-file.ts` の**中身を全部コピーして貼り付け**ます。
   - 画面のエディタが複数ファイルに対応していても、迷ったらこの1ファイル版を使ってください。
5. 画面内の **Verify JWT**(または「JWT を検証」)のスイッチを**オフ**にします。
   - LINE は Supabase の通行証(JWT)を持っていないので、オンのままだと LINE からのメッセージが全部はじかれます。
   - 見当たらないときは、デプロイ後に関数の Settings で探してオフにします。
6. **Deploy function** を押し、1分ほど待ちます。

### 方法B: コマンドで置く(慣れている人向け)

パソコンに Node.js が入っていて、ターミナルが使える場合:

```
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase functions deploy line-webhook --no-verify-jwt
```

`--no-verify-jwt` は方法Aの「Verify JWT をオフ」と同じ意味です(`supabase/config.toml` にも同じ設定を書いてあります)。

### 3-2. 秘密の設定(Secrets)を入れる

1. Supabase の **Edge Functions** → **Secrets**(「Edge Function Secrets」)を開きます。
2. 「Add new secret」で次の2つを登録して Save します。
   - `LINE_CHANNEL_SECRET` = 2-2 でコピーした Channel secret
   - `LINE_CHANNEL_ACCESS_TOKEN` = 2-2 でコピーした Channel access token
3. 3つめの `ALLOWED_LINE_USER_IDS` は、あとの 4-2 で登録します(今は入れなくて大丈夫)。
4. 名前は大文字小文字・つづりを正確に。`SUPABASE_` で始まる名前は自分では登録できません(自動で入るので不要です)。

---

## パート4: LINE とつなぐ

### 4-1. Webhook URL を登録する

1. LINE Developers のチャネル → **Messaging API** タブ → **Webhook settings**。
2. **Webhook URL** に次を入力して Update します。
   `https://<project-ref>.supabase.co/functions/v1/line-webhook`
3. **Verify(検証)** ボタンを押して「Success」と出れば成功です。
   - 失敗する場合: 関数の名前、URL の project-ref、Secrets の Channel secret、Verify JWT がオフか、を見直します。
4. **Use webhook(Webhookの利用)** をオンにします。

### 4-2. 自分の userId を調べて、他の人を締め出す

そのままだと、ボットを友だち追加した誰でもお知らせを送れてしまいます。2人だけに絞ります。

1. LINEでボットに `ID` と送ります。「U」で始まる長い文字列が返信されます(これがあなたの userId)。
2. パートナーにも `ID` と送ってもらい、返ってきた文字列をもらいます。
3. Supabase の Secrets に追加します。
   - 名前 `ALLOWED_LINE_USER_IDS` / 値 `Uあなたのid,Uパートナーのid`(カンマで区切る、スペースはあってもなくてもOK)
4. 変更後に反映されない場合は、関数をもう一度 Deploy してください。

### 4-3. 自動返信を切る(任意・おすすめ)

LINE公式アカウントの標準の自動あいさつや応答メッセージが、ボットの返信と二重に届くことがあります。気になる場合は、Messaging API タブの **LINE Official Account features** の「Auto-reply messages(応答メッセージ)」と「Greeting messages(あいさつメッセージ)」を **オフ** にします。しなくても動きます。

---

## パート5: 使い方とテスト

### 動作テスト

ボットに適当な文章を送ります(例: `テスト https://example.com`)。
「お知らせに追加しました」と返ってくれば成功です。Supabase の **Table Editor** → `notices` に1行増えているはずです。
画像やスタンプを送ると「テキストのメッセージだけ取り込めます。」と返ります。

### 区のLINEのメッセージを転送する

1. 区の公式LINEのトークを開き、取り込みたいメッセージを**長押し**します。
2. 「**転送**」を選びます。
3. 転送先に **こそだてポケット(ボット)** を選んで送信します。
4. 数秒後に「お知らせに追加しました」と返り、アプリの「お知らせ」画面に出ます。
   - 1行目がタイトル、本文中の最初のリンクが「元ページ」ボタンになります。

### うまくいかないとき

- 何も返ってこない: Webhookの利用がオンか、Verify が Success か確認。
- 返信はないが保存される/逆: Channel access token の貼り間違いを疑う。
- 返事が来ない人がいる: その人の userId が `ALLOWED_LINE_USER_IDS` に入っているか確認。
- Supabase の **Edge Functions** → `line-webhook` → **Logs** にエラーの理由が出ます。

### 開発者向けメモ

- 関数のコードの正本は `supabase/functions/line-webhook/lib.ts` と `index.ts`。`single-file.ts` は貼り付け用にまとめた同内容のコピーです。
- テスト: `node --test supabase/functions/line-webhook/lib.test.ts`
