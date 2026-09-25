# AGENTS.md — 図面レイアウトシミュレーター

このリポジトリで作業するエージェント（Codex 等）向けの指示書です。まずこの1枚を読めば、開発・テスト・公開まで一通り分かるようにしています。詳細な設計は `HANDOFF.md` を参照してください。

## プロジェクト概要

図面（PDF/画像）を背景に、什器・設備を **実寸(mm) でドラッグ配置** できる、サーバー不要のブラウザ用ツール。飲食店等のレイアウト検討に使う。プロダクト名は **MiseFits**。
主な機能: 図面/白紙シート、縮尺キャリブレーション、什器ライブラリ、Undo/Redo、什器・壁への吸着ガイド、通路幅の計測、席数・面積の自動集計、PNG/PDF/印刷。

- 公開URL: https://misefits.kokokikaku.com/ （GitHub Pages custom domain, `main` / `/` ルート）
- 実体は **単一の `index.html`**（バニラJS）。ビルド工程・npm依存・フレームワークなし。
- 外部ライブラリは CDN(cdnjs) 読み込み：Fabric.js 5.3.1 / pdf.js 3.11.174 / jsPDF 2.5.1。→ **オンライン環境が必須**。

## いちばん大事なルール

1. **`index.html` を直接編集する。** これが唯一の本番ソース。ビルド生成物ではない。
2. **単一ファイル構成を維持する。** CSS も JS も `index.html` 内にインライン。CSS/JS を別ファイルに分割しない（明確な理由と合意がない限り）。
3. **ライブラリは CDN のまま。** バージョンを上げるときは後述の「テスト」で必ず回帰確認。
4. **`localStorage` は try/catch で包む**（すでにそうなっている）。自動保存に使用。artifact 環境等で例外になり得るため。
5. 破壊的・外部公開・課金を伴う操作（GitHubへのコミット、公開URLの変更など）は、勝手に実行せず利用者に確認する。

## リポジトリ構成

```
index.html      … 本番アプリ（公開版・単一ファイル）。ここを編集する。
guide.html      … 使い方ガイド（静的ページ。HowTo/FAQPage の構造化データ入り）。
                  末尾の「業種別・寸法別のガイド」から下記の集客ページへ送っている。
layout-restaurant.html … 業種別ガイド：飲食店・カフェ。
layout-salon.html      … 業種別ガイド：美容室・サロン。
layout-classroom.html  … 業種別ガイド：学習塾・教室・オフィス。
aisle-width.html       … 寸法ガイド：通路幅と什器のすき間。
madori-2d.html         … 集客ページ：2Dの間取りシミュレーション（幅×奥行きだけで検討する層向け）。
fixture-sizes.html     … 什器・設備の寸法一覧（LIBRARY から自動生成。手で数値を書かない）。
overseas-store.html    … 集客ページ：日系の海外出店（現地の図面・坪／m²／sq ft の換算）。日本語。
en/             … 英語版（海外向け）の静的ページ。詳しくは下の「英語版（海外向け）」。
scripts/build-en-fixture-sizes.js … en/fixture-sizes.html を LIBRARY と I18N_EN から生成する。
privacy.html    … プライバシーポリシー・免責事項（解析のオプトアウトUIを含む）。
pro-unlock.html … 買い切りStripe決済後のリダイレクト先（ライセンスキー表示）。
404.html        … カスタム404（GitHub Pages が自動で使用）。
assets/         … ブランド画像（WebP/PNG）とOGP画像。
assets/ads.js   … アフィリエイト広告枠（もしも/A8兼用）。タグ未設定のあいだは枠ごと消える。
manifest.webmanifest / robots.txt / sitemap.xml / CNAME
README.md       … 利用者向けの使い方・公開手順。
AGENTS.md       … 本ファイル。
HANDOFF.md      … 詳細な設計・アーキテクチャ・変更履歴。
mobile/         … 【凍結】iOSアプリ（Expo + WebView）。2026-08-28にリリース中止を決定、コードは参考として残置。
functions/      … Firebase Cloud Functions（Web版買い切りのライセンスAPI）。
firebase.json / firestore.rules / firestore.indexes.json … 上記Functionsのプロジェクト設定。
```

### `mobile/`（iOSアプリ）について

- **【重要】2026-08-28、iOSアプリはリリースしないことが決定した（Web版のみで展開する）。**
  `mobile/` 以下と `index.html` のネイティブブリッジ（`window.MiseFitsNative`）は無害なので残しているが、
  今後の開発はWeb版のみを対象とする。RevenueCat/Apple IAPの実装は不要。
- iOS App Store向けに、`index.html` を **フォークせず** Expo/React Native の `WebView` でラップしたもの。
- `index.html` はこれまで通り唯一の本番ソース。`mobile/scripts/build-webapp-bundle.js` がCDN依存の
  ローカル同梱・CSP調整だけを行った派生HTMLを自動生成する（ロジックはWeb版と完全に共有）。
- `index.html` に手を入れたら `mobile/` 側で `npm run build:webapp` を実行して同梱HTMLを再生成すること。
- 課金（RevenueCat）・Pro限定機能は未実装。**クラウド保存（サブスク）は2026-08-31に提供取りやめを決定**
  （経緯は HANDOFF.md の「課金設計」の決定ブロックを参照）。

### `functions/`（Web版の買い切り販売）について

- Web版（`misefits.kokokikaku.com`）で「MiseFits Pro」買い切り（¥1,480）をStripeで直接販売するための
  Firebase Cloud Functions。iOSアプリのRevenueCat/Apple IAPとは完全に別売り（意図的な設計、統合しない）。
- `index.html`・`pro-unlock.html` はこのFunctionsのURLを`FUNCTIONS_BASE`定数とCSPの`connect-src`に
  ハードコードしている：`https://us-central1-misefits.cloudfunctions.net`（Firebaseプロジェクト
  `misefits`、2026-08-26作成・Blazeプラン・Firestore作成済み）。詳細は HANDOFF.md「Web版での買い切り販売」を参照。
- **ライセンスキーの控えメール**：`stripeWebhook` がキー発行後に `sendLicenseMail()` で購入者へ送る。
  設定は `functions/.env`（`SMTP_HOST` / `SMTP_PORT` のみ）＋ Secret Manager の
  `SMTP_USER` / `MAIL_FROM` / `SMTP_PASS`。**このリポジトリは公開なので、メールアドレスを `.env` に
  書かないこと**（差出人アドレスもSecret側に置いている理由）。**どれかが空のあいだは送信をスキップする**ので、
  未設定でもキー発行は通常どおり動く。送信失敗でwebhookを落とすとStripeが再送し、
  `sessions/{id}` の重複ガードで二度と送れなくなるため、**メールの例外は握りつぶして200を返す**設計。
  結果は `licenses/{key}` の `mailSentAt` / `mailSkipped` / `mailError` に残るので問い合わせ時に追える。
  設定手順：

  ```bash
  # functions/.env はリポジトリに存在する（STRIPE_PRICE_ID が入っている）。上書きせず追記すること。
  firebase functions:secrets:set SMTP_USER   # 例: studio@kokokikaku.com
  firebase functions:secrets:set MAIL_FROM   # 例: MiseFits <studio@kokokikaku.com>
  firebase functions:secrets:set SMTP_PASS   # Googleアプリパスワード
  firebase deploy --only functions
  ```

#### MenuFits の販売（`functions/menufits.js`）— サンドボックス混入に注意

MiseFits とは別売りだが**同じStripeアカウント・同じFunctions**に同居している。そのため
`STRIPE_PRICE_ID_MENUFITS` による Price ID の一致判定が「念のため」ではなく**必須の切り分け**になる。

**ここが無音で壊れる。** webhook は Price ID が一致しない決済を
`res.status(200).send('ignored (unrelated price)')` で捨てる。200を返すので
**Stripeは成功扱いにして再送しない**。つまりサンドボックスのPrice IDが載ったままライブ販売を始めると、
購入は成立するのにライセンスが発行されず、エラーもアラートも出ない。

- `STRIPE_PRICE_ID_MENUFITS` は `defineString` で、**デプロイ時に `functions/.env` から読まれる**。
  `.env` の変更をコミットし忘れると、クリーンなチェックアウトからのデプロイで
  サンドボックスのIDに戻る（2026-09-01の切替が2026-09-04まで未コミットで残っていた）。
- Price ID を**空**にすると素通しになる（`if (priceId)` を通らない）。誤ったIDより空のほうがまだマシ、
  という非直感的な挙動なので、切り替え時は必ず値を確認すること。
- 鍵2件（`STRIPE_SECRET_KEY_MENUFITS` / `STRIPE_WEBHOOK_SECRET_MENUFITS`）は Secret Manager 側なので
  `.env` を直しても連動しない。**別々に差し替える**。サンドボックスの鍵ではライブのセッションを読めない。

  ```bash
  firebase functions:secrets:get STRIPE_SECRET_KEY_MENUFITS      # メタ情報のみ（値は出ない）
  firebase functions:secrets:get STRIPE_WEBHOOK_SECRET_MENUFITS
  ```

  ただし**このコマンドは作成日時を出さない**（バージョン番号と状態だけ）。日時が要るなら
  Secret Manager のコンソールを見る。

**`secrets:set` だけでは反映されない。必ずデプロイする。** Firebase はデプロイ時に
「その時点の最新バージョン」を解決して関数に固定するため、`set` で新しいバージョンを作っても
デプロイしない限り古いバージョンが使われ続ける。

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY_MENUFITS --project misefits
firebase deploy --only functions:menufitsStripeWebhook --project misefits   # ← これを忘れない
```

反映確認は監査ログで見る。`secretEnvironmentVariables` にデプロイ時点のバージョン番号が残る。

```bash
firebase functions:log --only menufitsStripeWebhook --project misefits
```

**2026-09-04 時点の実測**：`STRIPE_SECRET_KEY_MENUFITS` はバージョンが3つあるのに、
動いている関数は **v2** に固定されていた（最後のデプロイが 2026-09-01 11:42 UTC で、v3 はその後に作られた）。
`STRIPE_WEBHOOK_SECRET_MENUFITS` は同日に v2→v3→v4 と7分間で3回差し替えられており、
署名検証で難儀した形跡がある。MenuFits はまだ販売実績ゼロなので実害は出ていないが、
**最初の購入が来る前に、Stripeのライブ画面から鍵を取り直して set→deploy し、テスト購入で通すこと。**

### 英語版（海外向け）— 2026-09-25 追加

**対象**：第1弾は **オーストラリア・シンガポール・ニュージーランド**（メートル法の英語圏で、MP が税を処理する国）。
UAE は MP が税を処理しないので外した。英国・アイルランド・カナダは、GA4 の同意バナーを入れてから
（英国は GA4 に同意が必要。EU も同様）。米国はインチ表記の対応が要るので後回し。
**価格**：US$19 の買い切り（日本語版の ¥1,480 とは別売り・別決済）。地域別の値下げは後から Stripe のプロモーションコードで足す想定。

**アプリ本体（`index.html`）は同じファイルのまま英語でも表示する。フォークしない。**

- 表示言語は head の `MF_LANG`。`?lang=en` か、以前に英語を選んだ記録（localStorage の `misefitsLang`）が
  あるときだけ英語。**ブラウザの言語設定で自動切替しないこと**（Googlebot は英語環境でレンダリングするので、
  日本語トップが英語で索引される）。
- 文言は日本語の原文をキーにした辞書 `I18N_EN` から `t('原文', {差し込み})` で引く。日本語表示では原文を
  そのまま返すので、**日本語の表示は1文字も変わらない**。静的HTMLは `applyI18nDom()` がテキストノードと
  title / aria-label / placeholder を差し替える。
- **UIの文言を足したら `I18N_EN` にも英訳を足す**（無いと英語画面に日本語がそのまま出る）。JSの文言は
  `t()` で包む。関数の中で `t` という名前のローカル変数を作らないこと（`t()` が隠れて動かなくなる）。
- 英語でだけ差し替えるリンクは `data-href-en`、片方の言語だけに出す要素は `class="only-ja"` / `class="only-en"`。
- 什器名・カテゴリ名は英語表示のときだけ `LIBRARY` を書き換える（検索は日本語名でも当たる）。
- 面積は英語表示で **m² と sq ft を併記**（`areaNum()` / `areaStr()`）。シンガポール・UAE・英国などの
  テナント募集は sq ft で出るため。長さは mm のまま。
- 英語の静的ページは `en/`：`index.html`（トップ・使い方・料金・FAQ）/ `restaurant-floor-plan.html` /
  `fixture-sizes.html`（**生成物。`node scripts/build-en-fixture-sizes.js` で作り直す。手で直さない**）/
  `privacy.html` / `terms.html`（返金は購入から14日以内なら理由を問わず全額。豪州消費者法では
  「返金不可」の表示自体が問題になりうるため、日本語版の特商法表記とは方針が違う）/ `pro-unlock.html`。
- 対になる日英ページには相互に hreflang を張っている（トップ、飲食店ガイド、寸法一覧、プライバシー）。
  片方だけ張っても効かないので、ページを足すときは両方に書く。
- **広告（A8）は英語ページに出さない**（A8 は国内専用）。英語圏の候補は Amazon の各国版（.com.au / .sg / .ae）・
  Nisbets（Awin・英愛）。日本在住で登録できるかは申請して確かめる。

**決済：Stripe Managed Payments（MP）**。2026-09-25 に Lemon Squeezy から方針変更（Lemon Squeezy は
MP への統合を進めており、後で移行する二度手間を避けるため）。販売者（Merchant of Record）は **Link, LLC**
（Stripe の再販事業者・米国）で、対応国の VAT/GST の計算・徴収・申告・納付は Stripe が行う。

- **日本語版（¥1,480・通常の Stripe 決済）はそのまま。** 英語版だけ、MP を有効にした別の商品（US$19）と
  Payment Link で売る。同じ Stripe アカウント・同じ `stripeWebhook` で受け、`STRIPE_PRICE_ID`（日本語版）と
  `STRIPE_PRICE_ID_EN`（英語版）のどちらに一致したかで控えメールの言語を決める。キーは同じ `MFPRO-` 形式で、
  **アプリ側の検証経路（`verifyLicense`）は日英で1本**。
- Payment Link の完了後URLは `https://misefits.kokokikaku.com/en/pro-unlock.html?session_id={CHECKOUT_SESSION_ID}`。
  日本語版と同じ `issueLicense` でキーを受け取る。
- 返金：webhook エンドポイントで **`charge.refunded` も購読**しておくと、全額返金で `licenses/{key}.revoked = true`
  になり、以後そのキーは新しい端末で解放できない（`paymentIntents/{pi}` からキーを引く。日本語版の返金にも効く）。
  MP では Link のサポートが客の返金依頼を受け、**48時間以内に返事がないと Stripe が承認なしに返金することがある**。
  ダッシュボードのサポート用メールアドレスを常に最新にしておく。
- **MP が税を処理しない国**（UAE など。一覧は `functions/index.js` の `MP_TAX_COUNTRIES`、出典は Stripe の
  tax-compliance ドキュメント）からの英語版の注文は、税務がこちらの責任になる。webhook が `licenses` に
  `outsideMpTax: true` を立て、ログに警告を出すので、**見つけたら返金して案内する**（規約 en/terms.html に明記済み）。
- **MP は日本の事業者の国内販売（日本の客）の消費税を扱わない。** 英語版で日本の客が買った分は国内の課税売上として
  日本語版の売上と同じく自分で扱う。
- 決済URL `PRO_PURCHASE_URL_EN` は **`index.html` と `en/index.html` の2か所**にある。空のあいだは
  購入ボタンを出さない（ロック機能に触れるとキー入力欄へ案内する従来の挙動になる）。変更時は両方そろえる。
- MP の決済画面はカスタムドメイン非対応。客の明細は `LINK.COM* <明細書表記>`、領収書は Link から届く。

**開通手順**

1. Stripe ダッシュボードで Managed Payments を有効にする（対象：日本の事業者も可。デジタル商品のみ）。
2. 商品「MiseFits Pro (English)」US$19・単発、税コードはデジタル商品（ソフトウェア）を選ぶ。
   Managed Payments を有効にした Payment Link を作り、完了後URLを上記の `session_id` 付きURLにする。
3. `functions/.env` の `STRIPE_PRICE_ID_EN` にその Price ID を入れる。
4. 既存の webhook エンドポイント（`stripeWebhook`）の購読イベントに `charge.refunded` を足す。
5. `firebase deploy --only functions:stripeWebhook,functions:verifyLicense --project misefits`。
6. テスト（少額の本番購入 → 返金でもよい）で、キー表示・英語メール・アプリでの解放・返金後の `revoked` を確認。
7. Payment Link のURLを `PRO_PURCHASE_URL_EN`（2か所）に入れて push。

**2026-09-25 の開通時に分かったこと**

- **misefits プロジェクトには別リポジトリの関数も同居している**（全銀ポン：`zenginponStripeWebhook` /
  `zenginponLicense`、asia-northeast1）。全銀ポンは codebase `zenginpon` に分けてあるので、デプロイは
  `repos/zengin-pon` から `firebase deploy --only functions:zenginpon --project misefits`。
  こちらからは念のため `--only functions:stripeWebhook,functions:verifyLicense` のように関数名を指定する
  （MenuFits の関数は Stripe の鍵のバージョンまで一緒に切り替わるので、巻き込まない）。
- `SMTP_PASS` は全銀ポン・MenuFits・MiseFits の3関数で共有している。`secrets:set` の最後に出る
  「再デプロイして古いバージョンを破棄するか」には **`n`** と答え、MiseFits の関数だけ個別にデプロイする。
- `SMTP_PASS` は **Google のアプリ パスワード（16桁）**でないと送れない（通常のパスワードだと 534-5.7.9）。
  v2・v4・v5 は失敗、**v6 で送信を確認**（2026-09-25）。同日に MiseFits（`stripeWebhook`）と全銀ポンは v6 で再デプロイ済み。
  **MenuFits（`menufitsStripeWebhook`）は v2 のままで、控えメールは 9/1 から失敗している**
  （再デプロイすると Stripe の鍵も未検証の最新版 v4 に切り替わるため、テスト購入とセットで行う）。
  v5 には通常のパスワードが入っているので、破棄と Google パスワードの変更を検討する。
- テスト購入は本番の Payment Link で行い、請求先を**オーストラリア**にして全額返金した。控えメールの再テストは、
  Firestore の `sessions/{cs_live_…}` を消してから Stripe の Webhook 画面で「再送する」を使った
  （**再送できるのは直近の送信試行だけ**）。再送すると別のキーが発行されるので、最後に `charge.refunded` も再送して無効化する。
- Stripe の公開ビジネス名は **Koko Kikaku**、サポート用メールは **studio@kokokikaku.com**（MP のエスカレーション先）。
- Stripe の Payment Link：`https://buy.stripe.com/3cI5kw8S68zO5zldSz9R606`（MP 有効・US$19・内税・`txcd_10103001`）。
  **MP の有効/無効はリンク作成後に変えられない**（変えるならリンクを作り直す）。

**海外向けの法務・同意（2026-09-25 のリサーチで決めたこと）**

- **EU/EEA・英国・スイスでは英語版を売らない**（GDPR の EU/英国代理人と同意バナーの準備ができるまで）。
  規約に「注文は全額返金」と明記し、webhook が `notYetOffered: true` を立てる（`EN_NOT_YET_OFFERED`）。
- **GA4 は欧州のタイムゾーン（`Europe/…`）では読み込まない**。全ページのローダーに入っている（同意バナーの代わりの暫定策）。
  Do Not Track と **Global Privacy Control** も尊重する。新しいページを作るときも同じローダーを使う。
- 価格は **「US$19 total incl. GST/VAT」**（Stripe の Price は内税）。豪州の総額表示ルールのため、税抜に見える書き方をしない。
- 英語の連絡先は **studio@kokokikaku.com**（会社サイトは日本語のみなので案内先にしない）。
- 豪州の不公正契約条項対策として、規約に「キーの無効化は14日前に連絡」「Pro を終了するときは90日前に通知し直近12か月分を返金」
  「既存の購入者に不利な変更はしない」を入れてある。免責は ACL・NZ CGA の保証を除く書き方にする。
- プライバシーポリシーに保存場所（米国の Google Cloud）・保存期間（購入記録は最長7年、解析は最長14か月）・苦情申立先を明記。
  GA4 の管理画面のデータ保持期間は14か月以下にしておくこと。
- **未決定**：運営者の氏名・住所を英語ページに載せるか（シンガポール PDPA / NZ IPP 3 / GDPR の観点では載せるのが望ましい）。
- SEO：英語の組は **`/` ↔ `/en/`**。`/?lang=en` は canonical を `/` のままにして索引させない（JS で canonical を書き換えない）。
  英語表示のときは `manifest-en.webmanifest` に差し替え、共有 URL は `/en/` にする。
- 購入完了ページは GA に session_id を送らない（`page_location` からクエリを除く）。session_id があれば `issueLicense` でキーを取り出せるため。
  あわせて `issueLicense` は**購入から30日を過ぎると返さない**（`reason: 'expired'`。控えメールでは引き続き確認できる）。
  控えメールは `replyTo: studio@kokokikaku.com`。

**残タスク（2026-09-25 時点）**

- [x] **A8 への広告掲載URLの追加提出**：`overseas-store.html`（オフィスコム）を 2026-09-25 13:55 に提出済み（計8件）。
      `pr-manage-pub.a8.net` は直接開くと「セッション切れ」になる。メディア管理画面（`media-console.a8.net/home`）で
      `window.open` を同じタブへの遷移に差し替えてから「広告掲載URL管理」をクリックすると、同じタブでセッションが張られ、
      その後は `program-detail?programId=…` を直接開ける。
- [x] **英語ページの運営者表示**：`Koko Kikaku … operated by Mika Takeda`＋`studio@kokokikaku.com` を規約とプライバシーに掲載（2026-09-25）。
- [x] **バーチャルオフィスの住所**（2026-09-25 掲載）：〒600-8846 京都府京都市下京区朱雀宝蔵町44 協栄ビル2階 京都朱雀スタジオ
      → 英語表記 `Kyoei Building 2F (Kyoto Suzaku Studio), 44 Suzaku Hozocho, Shimogyo-ku, Kyoto 600-8846, Japan`（en/terms.html の Provider 欄と en/privacy.html 冒頭）。
      **自宅住所は載せない**（本人の判断）。電話番号も載せない。日本語の特商法表記は現在「請求があれば開示」のまま。
- [ ] **英国・EU の販売開始**：保留（同意バナーと GDPR 第27条の代理人が必要）。それまでは販売見合わせ・GA 非送信のまま。
- [x] **DMARC の追加（kokokikaku.com）**：2026-09-25 に Squarespace で TXT `_dmarc` を追加済み（種別 TXT は本人が選択）。控えメールの迷惑メール判定対策。
      Squarespace の DNS に TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:studio@kokokikaku.com` を**本人が**追加する
      （会社ドメインで `mikan@` の再認証が要る。種別の選択は人がやる、という CLAUDE.md の注意どおり）。
- [ ] MenuFits の英語版ができたら、日本語版・英語版まとめてテスト購入（`menufits` リポジトリの HANDOFF-FROM-MISEFITS-20260925.md）。
- [x] アクセシビリティ（2026-09-25）：ブラウザ拡大を許可（キャンバス上は `touch-action:none` と独自ピンチのまま）、
      コントラスト 4.5:1 未満を解消（削除ボタン・ON 状態・LINE・ロック中の Pro 什器）、矢印キーで10mm移動（Shift で100mm）・N で順に選択。

**PDF 系ライブラリは遅延読み込み**（2026-09-25）：pdf.js と jsPDF は `<script>` タグで読まず、起動後のアイドル時に
`loadLib()` で SRI 付きで読む（`LAZY_LIBS`）。PDF 読込・PDF 出力の時点で未読込なら待ってから続ける。
fabric.js だけは起動に必要なので従来どおり `<script>`。ヘッドレスでの回帰確認は、`?lang=en` / `?lang=ja` で
`handlePdfFile`（jsPDF で作った PDF を渡す）・`buildPDF`・`renderComposite` を呼んで確かめた。
**アプリ内ブラウザや背景タブ（`visibilityState: hidden`）では pdf.js の描画が止まる**（本番の旧版でも同じ）ので、
PDF 読込のテストは見えているタブかヘッドレスで行うこと。

**税務**：MP 経由の売上は海外法人（Link, LLC）への販売で、日本の消費税は**不課税**として扱う
（2026-09-25 に本人が確認済み。Lemon Squeezy 経由と同じ整理）。所得税・法人税の売上には入る。

### アクセス解析（GA4）

公開している全HTML（`index.html` / `guide.html` / `pro.html` / `pro-unlock.html` / `faq.html` /
`releases.html` / `privacy.html` / `tokushoho.html` / `404.html`）の `<head>` に同じローダーが入っている。
`var GA_ID = '';` に測定ID（`G-XXXXXXXXXX`）を入れると有効になる。**全ファイルを同じIDに揃えること。**
IDが空のあいだは外部への通信は一切発生しない。オプトアウト（localStorage の `misefitsAnalyticsOptOut`）と
Do Not Track を尊重する実装で、`privacy.html` に切り替えUIがある。CSPは既にGAのドメインを許可済み。

#### 集客ページ（業種別ガイド・寸法ガイド）

`layout-*.html` / `aisle-width.html` / `madori-2d.html` は、検索から入ってきた人を `/` へ送るための入口。
アプリ本体（`/`）は索引対象のテキストが少ないので、**検索の受け皿はこちら側で作る**という分担。

**狙っている検索意図は2系統ある。混ぜないこと。**

| 系統 | 受け皿 | 主なワード |
|---|---|---|
| 店舗・施設をつくる人 | `layout-*` / `aisle-width` / `fixture-sizes` | 店舗レイアウト、通路幅、什器 寸法 |
| 部屋の配置を考えたい人 | `madori-2d.html` | 間取り シミュレーション、2D 間取り、家具配置、幅 奥行き |

`madori-2d.html` は「3Dも図面ソフトも要らない」を軸に、**畳数→mmの換算**と**家具の実寸**で受ける。
トップ（`/`）の `title` / `description` / JSON-LD にも2D・間取り・無料・登録不要を入れてあるが、
**店舗レイアウトの看板は外さない**（既存の順位を落とさないため、トップは両取りの位置づけ）。

- **構成は4ページとも共通**：ヒーロー → 目次 → 考え方 → 什器の寸法表 → MiseFitsでの手順 →
  つまずきやすいところ → FAQ → 関連ページ → CTA。構造化データは `Article` + `FAQPage` + `BreadcrumbList`。
- **寸法は必ず `index.html` の `LIBRARY` の実データから引く。** 数字を創作しない。
  什器を足したり寸法を変えたら、該当ページの表も直すこと。
  `fixture-sizes.html` は **`LIBRARY` から機械的に生成した全138点の一覧**で、他社が持っていない
  独自データがそのまま資産になる。什器を増減したらこのページを作り直すこと（手編集しない）。
  カテゴリごとの解説文だけは人が書いている。
- **法令の断定を書かない。** 通路幅・避難経路・保健所の基準は業態と物件で変わる。
  「目安」「検討の出発点」と明示し、最終判断は建築士・施工会社・所轄の窓口へ、と必ず添える
  （各ページのフッター `legalnote` に共通の免責を置いてある）。
- ページを増やすときは、**`guide.html` の `#bytype` にカードを追加し、`sitemap.xml` にも登録する。**
  既存ページの「関連ページ」ブロックにも相互リンクを足す。
- 中身の薄い業種ページを量産しない。1ページあたり本文2,500〜3,500字程度（空白除く）を目安に、
  その業種でしか書けないこと（決める順番・つまずき方）を必ず入れる。

#### アフィリエイト広告（assets/ads.js）

**ASPは A8.net**（メディアID `a26072638566`。もしもアフィリエイトは未登録）。
**2026-09-04に稼働開始。**

- **MiseFits のウェブサイトIDは `005`**（カテゴリ「住まい」で副サイト登録）。
  広告リンクを生成するときは**掲載サイトに必ず `MiseFits` を選ぶ**。noteや気になるモノ手帖の
  タグをMiseFitsに貼るのは規約違反（登録外サイトへの掲載＝提携解除・成果全否認の対象）。
- サイト登録画面（登録情報 → サイト情報の登録・修正）は**ログインID＋パスワードの再認証を要求する**。
  ここだけは人がやる必要がある。紹介文は**全角100文字以内**の制限あり。
- タグ本文は、ブラウザ操作ツールの安全フィルタ（トラッキングURLを含むデータの読み出しをブロック）で
  DOMから取り出せない。画面のスクリーンショットから書き起こすか、人にコピーしてもらうこと。
  貼ったら `a8mat` の値が href と計測用imgで一致しているか必ず検算する（1文字違うと成果が付かない）。

**CSPは対応済み。** 掲載8ページの `img-src` に `https://*.a8.net` を追記してある
（A8のバナーは `<a>`＋`<img>` だけなので img-src で足りる。クリック先の `px.a8.net` は
href なのでCSPの対象外）。`index.html` / `privacy.html` / `pro*.html` には入れていない。
もしもアフィリエイトの「かんたんリンク」に替える場合だけ `script-src` の追記が要る。

**広告掲載URLの提出は 2026-09-04 に完了済み**（オフィスコム7件／家具350の1件）。
運営者・連絡先の記載義務は既存の特商法表記でクリア済み。
**掲載ページを増やしたら、この提出も追加すること**（広告主の規約要件で、応じないと成果否認の対象）。

提出画面は直リンクで開ける。参加中プログラムの「広告掲載URL管理」ボタンは
`window.open` で別タブを開くため、ブラウザ自動操作からは辿れない。次のURLを直接開くこと。

```
https://pr-manage-pub.a8.net/media/program-detail?programId=<プログラムID>
```

| プログラム | プログラムID |
|---|---|
| オフィスコム | `s00000023787002` |
| 家具350 | `s00000009385002` |

複数URLは改行区切りでまとめて提出できる。**入力と「提出する」は別の操作に分ける**こと
（同じバッチでクリックすると入力が反映される前に送信されて無反応になる）。

**掲載のルール。**

- 出すのは**集客ページだけ**（`layout-*` / `aisle-width` / `fixture-sizes` / `madori-2d` / `guide` / `faq`）。
  **アプリ本体（`/`）と課金導線（`pro.html` / `pro-unlock.html`）には出さない。**
  ツールの信頼と ¥1,480 の買い切りの価値を下げないため。
- **Proライセンスを持っている人には出さない。** 判定は `index.html` の `isPro()` と同じで、
  `window.MiseFitsNative.pro` と localStorage の `misefitsWebLicense` を見る。
- **「広告」ラベルを必ず併記する**（景品表示法のステマ規制対応）。`ads.js` が自動で付けるので、
  ページ側に書く必要はない。逆に、`ads.js` を通さずに素のタグを直書きしないこと。
- `privacy.html` の「3. 外部サービスの利用」に `<div data-ad-disclosure></div>` を置いてある。
  タグを設定した瞬間に説明文が入り、外すと消える。**掲載状況と記載が自動で一致する**ので、
  ここを手で書き換えないこと。
- **案件はページの文脈で出し分ける。** 割り当ては `ads.js` の `SLOTS` に書いてあり、
  ページ側は `<div data-ad="article-bottom"></div>` のままでよい。現在の計画は次のとおり。

  | ページ | 広告主 | 素材 | 理由 |
  |---|---|---|---|
  | `madori-2d.html` | 家具350（購入8%） | 素材ID 025 テキスト | 住まい寄り。家具を実寸で置く話と直結する |
  | それ以外の集客ページ | オフィスコム（購入5%※〜2026/09/30、通常3%） | 素材ID 001 テキスト | 店舗・オフィス什器の文脈が近い |

  **バナーではなくテキストリンクを使っている。** 同じプログラムでも数字が桁違いだったため
  （オフィスコム: テキスト CTR 5%以上・EPC 50以上 / 300x250バナー 0.98%。
  家具350: テキスト 2.23%・EPC 50以上 / バナー 1.60%・19.69）。記事末尾の文脈にも馴染む。

  次点は Kagg.jp（EPC 250 / 3%）、イトーキ公式（確定率100% / 3.7%）、
  会議室・貸会場系ページなら Regus（問い合わせ7,500円）や三井ワークスタイリング（10,000円）。
- **枠は集客ページ1枚あたり2つ**（`article-mid` / `article-bottom`）。
  `article-mid` は**寸法表の直後**に置いている（文脈が一致する位置）。
  `fixture-sizes` は表が17本続くので、ちょうど中ほどの「教室・オフィス」の直前。
  **`guide` と `faq` は案内役のページなので、意図的に `article-bottom` の1枠だけ**にしてある。
- `AD_TAGS` の `heading` / `lead` は**こちらで書いた紹介文**で、`tag` はA8が生成したもの。
  **`tag` の中（URL・rel・アンカーテキスト）は絶対に書き換えない**（A8の規約違反）。
  見せ方を変えるときは `heading` / `lead` / CSS だけを触る。
  紹介文は**広告主のPR文の範囲を超えないこと**（誇大表示は景表法の問題になる）。
- 枠を増やすときは `SLOTS` に枠名を足し、ページ側に `<div data-ad="<枠名>"></div>` を置く。
  広告主を足すときは `AD_TAGS` にキーを足して `SLOTS` から参照する。

#### 課金導線（Pro）の作り

- **ロック機能に当たったら、決済ページへ直行させない。** `requestProPurchase(feature)` は
  購入前モーダル（`#proModalBackdrop`）を開く。触った機能名・¥1,480・買い切りである点・解放される
  6機能を見せてから `proceedToProPurchase()` でStripeへ送る。iOSアプリ内（`ReactNativeWebView`）は
  従来どおりApple IAPへのpostMessageで、モーダルは出さない。
- Pro機能を増やしたら、**ロック地点から `requestProPurchase('<feature名>')` を呼び、
  モーダルの `#proModalList` に `data-f="<feature名>"` の行を足す**（触った行が太字になる）。
  `PRO_FEATURE_LABELS` にも表示名を足すとモーダル冒頭の文が具体的になる。
- 決済リンク `PRO_PURCHASE_URL` は `index.html` と `pro.html`（購入ボタン3か所のhref）に
  ハードコードされている。**変更時は両方そろえること。**
- `pro.html` は検索・SNSからの着地点でもあるので、**必ずそのページ単体で購入まで完結できる状態を保つ**
  （ヒーロー・購入の流れ・最下部の3か所に購入ボタン）。

#### 課金ファネルのイベント

`index.html` / `pro.html` / `pro-unlock.html` はローダー直後に `trackEvent(name, params)` を定義している。
解析が無効（ID未設定・オプトアウト・DNT）なら何もしない安全なラッパーなので、計測を足すときはこれを使う。
現在送っているイベントは次の5つ。**GA4の管理画面側でキーイベント（コンバージョン）に指定するのは `purchase`。**

| イベント | 送る場所 | 主なパラメータ |
|---|---|---|
| `pro_lock_hit` | `requestProPurchase()`（Pro機能に当たった瞬間） | `feature`（`free_shape` / `area_trace` / `memo_add` / `memo_edit` / `export_scale` / `fixture:<key>` / `sidebar`） |
| `pro_buy_click` | 決済リンクを開く直前 | `feature`, `location`（`app_modal` / `hero` / `step1` / `footer`） |
| `pro_detail_click` | 購入モーダルの「詳しく見る」 | `feature` |
| `license_unlock_success` / `license_unlock_fail` | キー検証の成否（アプリのサイドバーと購入完了ページ） | `location`（`app` / `pro_unlock`）, `reason`（`invalid` / `device_limit` / `network`） |
| `purchase` | `pro-unlock.html` でキーを表示できたとき | `transaction_id`（Stripeのsession_id）, `value:1480`, `currency:'JPY'`, `items` |

`pro_lock_hit` と `pro_buy_click` の差が「モーダルまで来たが買わなかった数」になる。
`feature` を見ればどのPro機能が購入意欲を生んでいるかが分かるので、機能追加時は必ず `feature` を渡すこと。

`purchase` はリロードでの二重計上を防ぐため、`localStorage` の `misefitsPurchaseTracked:<session_id>` で
1回だけ送るようにしている。

### 「サンプル入り版」について（重要・混同注意）
- 開発とは別に、内蔵サンプル図面（1〜3階の平面図PNGをbase64で埋め込んだ）版が存在するが、**それはクライアントの図面のため公開リポジトリには含めない**。
- 公開版 `index.html` の `SAMPLES` は `const SAMPLES = {};`（空）。什器ライブラリの「サンプル読込」ボタンや内蔵図面は公開版には無い。
- サンプル入り版は、この公開 `index.html` に対して「`SAMPLES` にbase64を注入」「空状態の文言差し替え」を施した派生物にすぎない。**開発では触らなくてよい。** 誤って 600KB 級のサンプル入りHTMLをこのリポジトリにコミットしないこと。

## ローカルでの動かし方

`index.html` をブラウザで開くだけ（CDNに繋がるオンライン環境で）。ビルド不要。
簡易サーバーを使うなら:

```bash
python3 -m http.server 8000   # → http://localhost:8000/index.html
```

## テスト（回帰確認）

自動テストは Playwright + Chromium。CDN がブロックされる環境向けに、ライブラリをローカル退避（vendor）して読み込むテスト用コピーを作って実行する。

```bash
# 1) ライブラリを vendor/ に取得（fabric 5.3.1 は npm に無いので 5.3.0-browser で代用）
mkdir -p vendor
npm pack fabric@5.3.0-browser && tar -xf fabric-5.3.0-browser.tgz && cp package/dist/fabric.min.js vendor/ && rm -rf package
npm pack pdfjs-dist@3.11.174 && tar -xf pdfjs-dist-3.11.174.tgz && cp package/build/pdf.min.js package/build/pdf.worker.min.js vendor/ && rm -rf package
npm pack jspdf@2.5.1 && tar -xf jspdf-2.5.1.tgz && cp package/dist/jspdf.umd.min.js vendor/ && rm -rf package

# 2) CDN参照を vendor/ に差し替えたテスト用コピーを生成
sed -e 's#https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js#vendor/fabric.min.js#' \
    -e 's#https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js#vendor/pdf.min.js#' \
    -e 's#https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js#vendor/pdf.worker.min.js#' \
    -e 's#https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js#vendor/jspdf.umd.min.js#' \
    index.html > index.test.html
```

Playwright スクリプト例（`page.on('pageerror')` を必ず監視して JS エラー0を確認）:

```js
const { chromium, devices } = require('playwright');
(async () => {
  const errs = [];
  const b = await chromium.launch(); // 環境により executablePath を指定
  const ctx = await b.newContext({ ...devices['iPhone 12'], hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.message().includes('復元') ? d.dismiss() : d.accept()); // 復元確認は閉じる
  await p.goto('file://' + process.cwd() + '/index.test.html');
  // …画像/PDFアップロード→縮尺設定→什器追加→回転→出力 を操作して検証…
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
```

手動チェックの最低ライン（毎回確認）:
- PDF/画像アップロード → 背景表示（pdf.js は1ページ目を scale:2.0 でレンダリング）
- 縮尺設定（2点クリック→mm入力）で `mmPerPixel` が更新される
- 什器を追加 → タップで寸法バッジ表示、実寸が正しい（例: 4人テーブルが 1200×700 と出る）
- Undo/Redo（Ctrl+Z / Ctrl+Shift+Z、アクションバーの ↶ ↷）が1操作ずつ効く
- 什器を他の什器の近くへ動かすとピンクのガイドが出て辺が揃う
- 計測（📐 / Mキー）で2点をクリックすると mm が出る（600未満=赤 / 900未満=橙 / 以上=緑）。Escで解除
- サイドバーの「集計」に席数・パーツ数・面積・占有率が出る
- 回転（スライダー/±ボタン/Rキー）
- PNG / PDF 出力 と 印刷（グリッドは出力されない）
- スマホ幅（≤860px）で ☰ ドロワー、右上ズームバー、コンパクトなプロパティパネル、移動モード（ハンドル無しでドラッグ＝移動）、下部クイックパーツバー、1行フッター
- 計測モード中に線をクリックすると1本だけ消える／「最後の1本を取消」「すべてクリア」が効く
- サイドバー「操作」の「すべて削除」で配置が消え、Ctrl+Z で戻る
- 「白紙から」で形状選択モーダルが開き、矩形/L字/コの字を選んで作成できる。L字/コの字は面積が欠けの分だけ正しく減る（集計パネルで確認）
- `guide.html` / `privacy.html` / `404.html` が開き、フッターの相互リンクが繋がっている
- ブラウザコンソールに JS エラーが出ていない

## 公開（デプロイ）

GitHub Pages（`main` ブランチ / ルート）。`index.html` と `CNAME` を更新して `main` に push/commit すれば約1分で反映。
カスタムドメインは `misefits.kokokikaku.com`。DNS側では `misefits` の CNAME を `studio8080.github.io` に向ける。
Web UI からのアップロードで更新する場合: リポジトリの `Upload files` で `index.html` を上書きコミット → Pages が自動再ビルド。反映確認はキャッシュ回避で `?v=N` を付けて開く。

## 数値・単位の約束

- 実寸は「線幅を含まない基準ジオメトリ `data.baseW/baseH`（px）× オブジェクトの `scaleX/Y` × シートの `mmPerPixel`」で算出（`objRealSize()`）。線幅ぶんの誤差を出さないため。
- サンプル図面の `mmPerPixel = 6.35`（100dpiレンダリング, 縮尺1:25 → `25.4/100*25`）。アップロード図面は既定 6.35 の未校正状態で、ユーザーが縮尺設定で確定する。

## よくある落とし穴

- **Fabric 5.3.1 は npm に無い**（cdnjs 固有ビルド）。ローカルテストは 5.3.0-browser で代用。本番の CDN は 5.3.1 のままでよい。
- **jsPDF 標準フォントは日本語非対応。** PDF内に日本語テキストを直接描くと文字化けする。図面画像はラスタなので問題ないが、追記するテキスト（フッター等）はASCIIに限定している。
- **モバイルのタッチ操作**：ピンチズームは `upperCanvasEl` の capture フェーズ touch イベントで処理し、2本指時に Fabric へ伝播させない。1本指は空所ドラッグでパン、什器上ドラッグで移動。タッチ既定は「移動モード」（`handleMode=false`, `hasControls=false`）で誤リサイズを防止。
- **画面の高さは `100dvh`**（モバイルのブラウザUIでの見切れ対策）。ズームバーはモバイルでは右上。

## 今後の拡張候補（未実装）

- 実寸スケール印刷（1:50 等、用紙サイズに合わせた厳密出力）
- 計測線をレイアウトの一部として保存・出力できるようにする（現在はオーバーレイのみ）
- 什器メーカーの CAD/SVG 取り込み、ログイン＆サーバ保存
