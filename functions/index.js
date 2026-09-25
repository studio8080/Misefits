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

// 海外向け（英語版）の販売は Lemon Squeezy（Merchant of Record）。各国の VAT/GST は先方が処理する。
// キーは Stripe 分と同じ MFPRO- 形式で licenses に発行するので、アプリ側の検証経路は1本のまま。
// 署名用シークレットは Lemon Squeezy の Webhook 設定画面で決めた値を Secret Manager に入れる。
const lsWebhookSecret = defineSecret('LEMONSQUEEZY_WEBHOOK_SECRET');
// 対象商品の Product ID（数字）。MenuFits の教訓で、ここが違うと購入が成立してもキーが出ない。
// 空なら素通しになる（誤ったIDよりはまし、という Stripe 側と同じ非直感的な挙動）。
const lsProductId = defineString('LEMONSQUEEZY_PRODUCT_ID', { default: '' });
// テストモードの注文でもキーを出すか。検証中だけ 'true' にし、本番販売の前に必ず 'false' へ戻す。
const lsAllowTest = defineString('LEMONSQUEEZY_ALLOW_TEST', { default: 'false' });

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

    if (event.type !== 'checkout.session.completed') {
      res.status(200).send('ignored (unhandled event type)');
      return;
    }

    const session = event.data.object;
    if (session.payment_status !== 'paid') {
      res.status(200).send('ignored (not paid)');
      return;
    }

    // 対象Price IDのみ処理（将来Web版で他の商品を売るようになった場合の誤発行防止）
    const priceId = stripePriceId.value();
    if (priceId) {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
      const matches = lineItems.data.some((li) => li.price && li.price.id === priceId);
      if (!matches) {
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
    await db.collection('licenses').doc(key).set({
      email,
      sessionId: session.id,
      createdAt: FieldValue.serverTimestamp(),
    });
    await sessionRef.set({
      licenseKey: key,
      createdAt: FieldValue.serverTimestamp(),
    });

    // キーの控えをメールで送る。失敗してもwebhookは成功扱いにする
    // （ここで500を返すとStripeが再送し、sessionRefの重複ガードで二度と送れなくなる）。
    try {
      const result = await sendLicenseMail(email, key);
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
  // 返金されたキー（Lemon Squeezy の order_refunded で立てる）は新しい端末では解放させない。
  // 既に解放済みの端末は localStorage で動き続ける（アカウント無しの設計上、遡って止める手段は持たない）。
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

// ---- Lemon Squeezy（英語版・海外向け） ----
// 購入完了ページ（en/pro-unlock.html）は Stripe の session_id のような識別子を受け取れないため、
// アプリ側で作ったランダムな claim を checkout[custom][claim] で渡し、webhook の custom_data で受け取る。
const CLAIM_RE = /^[a-z0-9]{16,64}$/;

function verifyLsSignature(req, secret) {
  const sig = String(req.headers['x-signature'] || '');
  if (!sig || !secret || !req.rawBody) return false;
  const digest = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const a = Buffer.from(digest, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

exports.lemonSqueezyWebhook = onRequest(
  { secrets: [lsWebhookSecret, smtpUser, mailFrom, smtpPass] },
  async (req, res) => {
    if (!verifyLsSignature(req, lsWebhookSecret.value())) {
      res.status(400).send('signature verification failed');
      return;
    }
    const body = req.body || {};
    const meta = body.meta || {};
    const order = body.data || {};
    const attrs = order.attributes || {};
    const orderId = String(order.id || '');
    if (!orderId || order.type !== 'orders') {
      res.status(200).send('ignored (not an order)');
      return;
    }

    if (meta.event_name === 'order_refunded') {
      const ls = await db.collection('lsOrders').doc(orderId).get();
      if (ls.exists) {
        await db.collection('licenses').doc(ls.data().licenseKey).update({
          revoked: true,
          revokedAt: FieldValue.serverTimestamp(),
        });
      }
      res.status(200).send('ok (refund recorded)');
      return;
    }
    if (meta.event_name !== 'order_created') {
      res.status(200).send('ignored (unhandled event type)');
      return;
    }
    if (attrs.status !== 'paid') {
      res.status(200).send('ignored (not paid)');
      return;
    }
    if (attrs.test_mode && lsAllowTest.value() !== 'true') {
      // 本番で黙って捨てると気づけないので、ログには必ず残す
      console.warn('Lemon Squeezy test-mode order ignored', orderId);
      res.status(200).send('ignored (test mode)');
      return;
    }
    const productId = lsProductId.value();
    const item = attrs.first_order_item || {};
    if (productId && String(item.product_id) !== productId) {
      console.warn('Lemon Squeezy order for another product ignored', orderId, item.product_id);
      res.status(200).send('ignored (unrelated product)');
      return;
    }

    // 再送に備えて、同じ注文には1回だけ発行する
    const orderRef = db.collection('lsOrders').doc(orderId);
    if ((await orderRef.get()).exists) {
      res.status(200).send('already processed');
      return;
    }

    const key = generateLicenseKey();
    const email = attrs.user_email || null;
    await db.collection('licenses').doc(key).set({
      email,
      source: 'lemonsqueezy',
      lsOrderId: orderId,
      testMode: !!attrs.test_mode,
      createdAt: FieldValue.serverTimestamp(),
    });
    await orderRef.set({ licenseKey: key, createdAt: FieldValue.serverTimestamp() });

    const claim = String((meta.custom_data || {}).claim || '');
    if (CLAIM_RE.test(claim)) {
      await db.collection('lsClaims').doc(claim).set({ licenseKey: key, createdAt: FieldValue.serverTimestamp() });
    }

    // Stripe 側と同じく、メールの失敗で webhook を落とさない（再送されると重複ガードで二度と送れない）
    try {
      const result = await sendLicenseMail(email, key, 'en');
      await db.collection('licenses').doc(key).update(
        result.sent ? { mailSentAt: FieldValue.serverTimestamp() } : { mailSkipped: result.reason }
      );
    } catch (err) {
      console.error('license mail failed', err);
      await db.collection('licenses').doc(key)
        .update({ mailError: String((err && err.message) || err) })
        .catch(() => {});
    }

    res.status(200).send('ok');
  }
);

// 購入完了ページがキーを受け取るための読み取り専用API（issueLicense の Lemon Squeezy 版）
exports.claimLicense = onRequest({ cors: [ALLOWED_ORIGIN] }, async (req, res) => {
  const claim = String(req.query.claim || '');
  if (!CLAIM_RE.test(claim)) {
    res.status(400).json({ error: 'invalid claim' });
    return;
  }
  const doc = await db.collection('lsClaims').doc(claim).get();
  if (!doc.exists) {
    res.status(404).json({ found: false });
    return;
  }
  res.status(200).json({ found: true, key: doc.data().licenseKey });
});

// MenuFits（menufits.kokokikaku.com）の買い切り販売。別売り・別コレクション・別Webhook。
// 上の MiseFits 用3関数には影響しない（menufits.js 内で完結している）。
Object.assign(exports, require("./menufits"));
