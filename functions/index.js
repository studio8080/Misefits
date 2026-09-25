const crypto = require('crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');

// Web版の買い切り「MiseFits Pro」（¥1,480）のライセンスキー発行・検証API。
// キーの発行（licenses/sessions docの作成）は stripeWebhook（Stripeの署名検証を通過した場合のみ）。
// verifyLicense は既存キーへのデバイス登録（devices配列へのarrayUnion）だけ書き込む。
// issueLicense は読み取り専用。クライアントから直接Firestoreは触らせない
// （firestore.rulesで全面拒否。Admin SDK経由のここだけがルールをバイパスして読み書きできる）。

initializeApp();
const db = getFirestore();

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
// Price IDは秘匿情報ではないので通常のパラメータとして扱う（誤発行防止用・任意）
const stripePriceId = defineString('STRIPE_PRICE_ID', { default: '' });
// 英語版（海外向け）の Price ID。Stripe Managed Payments（MoR は Link, LLC）で US$19 で売る商品。
// 同じ Stripe アカウント・同じ webhook で受けるので、どちらの Price に一致したかで控えメールの言語を決める。
// 片方でも設定されていれば、どちらにも一致しない決済はキーを出さずに捨てる（MenuFits の決済を拾わないため）。
const stripePriceIdEn = defineString('STRIPE_PRICE_ID_EN', { default: '' });
// Managed Payments が越境販売の間接税を処理する国（docs.stripe.com/payments/managed-payments/tax-compliance、
// 2026-09-25 時点）。これ以外の国（例：UAE）からの英語版の注文は、税務がこちらの責任になるので
// licenses に outsideMpTax を立ててログに残す。見つけたら返金して案内する運用（AGENTS.md）。
const MP_TAX_COUNTRIES = new Set(('CM EG GH KE NG UG ZA ZM ZW AM AU AZ BN GE HK ID IL IN JP KG KR KW KZ LA MO MY NP NZ '
  + 'PH QA SA SG TH TJ TR TW VN AL BY CH GB GI IS LI MD NO RS UA AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT '
  + 'LT LU LV MT NL PL PT RO SE SI SK BB BM KY MX VG CA US').split(' '));
// 税は MP が処理するが、GDPR（EU 代理人の設置・同意バナー）の準備ができるまで英語版を売らない地域。
// 規約（en/terms.html）に「返金する」と明記してある。準備ができたらこの一覧から外して規約も直す。
const EN_NOT_YET_OFFERED = new Set(('AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK '
  + 'IS LI NO GB CH').split(' '));

// ライセンスキーの控えメール。購入完了ページを閉じてしまった人がキーを失わないようにする。
// ホスト名とポートは非個人情報なので通常のパラメータ（functions/.env）。
// 差出人アドレスとパスワードはSecret Manager に置く（このリポジトリは公開なので、
// メールアドレスを .env に書くとスパム収集の対象になる）。
// SMTP_HOST / SMTP_USER / MAIL_FROM / SMTP_PASS のどれかが空なら送信自体をスキップする（＝任意機能）。
const smtpHost = defineString('SMTP_HOST', { default: '' });
const smtpPort = defineString('SMTP_PORT', { default: '465' });
const smtpUser = defineSecret('SMTP_USER');
const mailFrom = defineSecret('MAIL_FROM');
const smtpPass = defineSecret('SMTP_PASS');

const ALLOWED_ORIGIN = 'https://misefits.kokokikaku.com';
const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 0/O/1/I/L等の紛らわしい文字を除いたbase32相当
// 1キーあたりの解放上限（ブラウザ＝デバイス単位。localStorageのdeviceIdで数える）。
// サイトデータ削除や機種変更で同じ端末が別カウントになり得るため、上限到達時は
// Firestoreコンソールで licenses/{key} の devices 配列を空にすればリセットできる。
const MAX_DEVICES = 5;

function generateLicenseKey() {
  const bytes = crypto.randomBytes(16);
  let raw = '';
  for (const b of bytes) raw += KEY_ALPHABET[b % KEY_ALPHABET.length];
  const groups = raw.match(/.{1,4}/g).slice(0, 4);
  return 'MFPRO-' + groups.join('-');
}

function licenseMailBodyEn(key) {
  return [
    'Thank you for purchasing MiseFits Pro.',
    '',
    'Your license key',
    '    ' + key,
    '',
    'How to unlock',
    '  1. Open MiseFits: https://misefits.kokokikaku.com/?lang=en',
    '  2. Scroll the side panel down to "MiseFits Pro"',
    '  3. Paste the key and press "Unlock"',
    '',
    'One key works on up to 5 devices (counted per browser).',
    'Please keep this email as your copy of the key.',
    '',
    'Help: https://misefits.kokokikaku.com/en/',
    'Refunds and terms: https://misefits.kokokikaku.com/en/terms.html',
    'Questions or refunds: studio@kokokikaku.com',
    '',
    'MiseFits (by Koko Kikaku, Japan)',
  ].join('\n');
}

function licenseMailBody(key) {
  return [
    'MiseFits Pro をご購入いただきありがとうございます。',
    '',
    '■ ライセンスキー',
    '    ' + key,
    '',
    '■ 解放のしかた',
    '  1. MiseFits を開く … https://misefits.kokokikaku.com/',
    '  2. 左サイドバーを下にスクロールして「MiseFits Pro」欄へ',
    '  3. 上のキーを貼り付けて「解放する」を押す',
    '',
    '同じキーで最大5台（ブラウザ単位）まで解放できます。',
    'このメールはキーの控えです。大切に保管してください。',
    '',
    '・各機能の使い方と購入ガイド … https://misefits.kokokikaku.com/pro.html',
    '・よくある質問 … https://misefits.kokokikaku.com/faq.html',
    '・お問い合わせ … https://kokokikaku.com/',
    '',
    'MiseFits（提供：ここ企画）',
  ].join('\n');
}

// 送信できなくてもキー発行自体は成功しているので、ここで例外を投げない。
// 結果は licenses/{key} に記録して、問い合わせ時に追えるようにする。
async function sendLicenseMail(to, key, lang = 'ja') {
  const host = smtpHost.value();
  const user = smtpUser.value();
  const from = mailFrom.value();
  const pass = smtpPass.value();
  if (!to || !host || !user || !from || !pass) return { sent: false, reason: 'not configured' };

  const port = Number(smtpPort.value()) || 465;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 587はSTARTTLSなのでsecure:false
    auth: { user, pass },
  });
  await transporter.sendMail({
    from,
    to,
    subject: lang === 'en' ? 'Your MiseFits Pro license key' : 'MiseFits Pro ライセンスキーのご案内',
    text: lang === 'en' ? licenseMailBodyEn(key) : licenseMailBody(key),
  });
  return { sent: true };
}

exports.stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret, smtpUser, mailFrom, smtpPass] },
  async (req, res) => {
    const stripe = new Stripe(stripeSecretKey.value());

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers['stripe-signature'],
        stripeWebhookSecret.value()
      );
    } catch (err) {
      res.status(400).send(`webhook signature verification failed: ${err.message}`);
      return;
    }

    // 返金されたらキーを無効にする（新しい端末では解放できなくなる）。全額返金のときだけ。
    // Stripe の webhook エンドポイントで charge.refunded も購読しておくこと。
    if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      if (charge.refunded && pi) {
        const link = await db.collection('paymentIntents').doc(pi).get();
        if (link.exists) {
          await db.collection('licenses').doc(link.data().licenseKey).update({
            revoked: true,
            revokedAt: FieldValue.serverTimestamp(),
          });
          res.status(200).send('ok (refund recorded)');
          return;
        }
      }
      res.status(200).send('ignored (no license for this charge)');
      return;
    }

    // 後から支払いが確定する決済手段（銀行振込型など）は async_payment_succeeded で届く
    if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
      res.status(200).send('ignored (unhandled event type)');
      return;
    }

    const session = event.data.object;
    if (session.payment_status !== 'paid') {
      res.status(200).send('ignored (not paid)');
      return;
    }

    // 対象Price IDのみ処理（MenuFits など同じアカウントの別商品への誤発行防止）。
    // 日本語版（¥1,480・通常決済）と英語版（US$19・Managed Payments）のどちらに一致したかで言語を決める。
    const priceJa = stripePriceId.value();
    const priceEn = stripePriceIdEn.value();
    let lang = 'ja';
    if (priceJa || priceEn) {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
      const has = (id) => !!id && lineItems.data.some((li) => li.price && li.price.id === id);
      if (has(priceEn)) {
        lang = 'en';
      } else if (!has(priceJa)) {
        console.warn('checkout for an unrelated price ignored', session.id);
        res.status(200).send('ignored (unrelated price)');
        return;
      }
    }

    // Stripeはwebhookを再送することがあるため、同一セッションへの重複発行を防ぐ
    const sessionRef = db.collection('sessions').doc(session.id);
    const existing = await sessionRef.get();
    if (existing.exists) {
      res.status(200).send('already processed');
      return;
    }

    const key = generateLicenseKey();
    const email = session.customer_details?.email ?? null;
    const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : null;
    const country = session.customer_details?.address?.country || null;
    const outsideMpTax = lang === 'en' && !!country && !MP_TAX_COUNTRIES.has(country);
    const notYetOffered = lang === 'en' && !!country && EN_NOT_YET_OFFERED.has(country);
    if (outsideMpTax) console.warn('English order from a country outside Managed Payments tax coverage', session.id, country);
    if (notYetOffered) console.warn('English order from a country where Pro is not yet offered (refund it)', session.id, country);
    await db.collection('licenses').doc(key).set({
      email,
      sessionId: session.id,
      paymentIntent,
      lang,
      country,
      ...(outsideMpTax ? { outsideMpTax: true } : {}),
      ...(notYetOffered ? { notYetOffered: true } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });
    await sessionRef.set({
      licenseKey: key,
      createdAt: FieldValue.serverTimestamp(),
    });
    // 返金（charge.refunded）からキーを引けるようにしておく
    if (paymentIntent) {
      await db.collection('paymentIntents').doc(paymentIntent).set({ licenseKey: key });
    }

    // キーの控えをメールで送る。失敗してもwebhookは成功扱いにする
    // （ここで500を返すとStripeが再送し、sessionRefの重複ガードで二度と送れなくなる）。
    try {
      const result = await sendLicenseMail(email, key, lang);
      await db.collection('licenses').doc(key).update(
        result.sent
          ? { mailSentAt: FieldValue.serverTimestamp() }
          : { mailSkipped: result.reason }
      );
    } catch (err) {
      console.error('license mail failed', err);
      // 記録に失敗しても200を返しきる（再送されると重複ガードで永久に送れなくなるため）
      await db.collection('licenses').doc(key)
        .update({ mailError: String((err && err.message) || err) })
        .catch(() => {});
    }

    res.status(200).send('ok');
  }
);

exports.issueLicense = onRequest({ cors: [ALLOWED_ORIGIN] }, async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId) {
    res.status(400).json({ error: 'missing session_id' });
    return;
  }
  const doc = await db.collection('sessions').doc(String(sessionId)).get();
  if (!doc.exists) {
    res.status(404).json({ found: false });
    return;
  }
  res.status(200).json({ found: true, key: doc.data().licenseKey });
});

// キー検証＋デバイス登録。deviceは クライアントがlocalStorageに持つランダムID。
// 未知のデバイスは空きがあれば devices 配列に登録（＝1枠消費）、上限超過なら
// {valid:false, reason:'device_limit'} を返す。device無しの呼び出し（旧クライアント）は
// 存在チェックのみ行い枠を消費しない（後方互換）。
exports.verifyLicense = onRequest({ cors: [ALLOWED_ORIGIN] }, async (req, res) => {
  const key = String(req.query.key || '').trim().toUpperCase();
  const device = String(req.query.device || '').slice(0, 64);
  if (!key) {
    res.status(400).json({ valid: false });
    return;
  }
  const ref = db.collection('licenses').doc(key);
  const doc = await ref.get();
  if (!doc.exists) {
    res.status(200).json({ valid: false });
    return;
  }
  // 返金されたキーは新しい端末では解放させない。既に解放済みの端末は localStorage で動き続ける
  // （アカウント無しの設計上、遡って止める手段は持たない）。
  if (doc.data().revoked) {
    res.status(200).json({ valid: false, reason: 'revoked' });
    return;
  }
  if (!device) {
    res.status(200).json({ valid: true });
    return;
  }
  const devices = Array.isArray(doc.data().devices) ? doc.data().devices : [];
  if (devices.includes(device)) {
    res.status(200).json({ valid: true });
    return;
  }
  if (devices.length >= MAX_DEVICES) {
    res.status(200).json({ valid: false, reason: 'device_limit' });
    return;
  }
  await ref.update({ devices: FieldValue.arrayUnion(device) });
  res.status(200).json({ valid: true });
});

// MenuFits（menufits.kokokikaku.com）の買い切り販売。別売り・別コレクション・別Webhook。
// 上の MiseFits 用3関数には影響しない（menufits.js 内で完結している）。
Object.assign(exports, require("./menufits"));
