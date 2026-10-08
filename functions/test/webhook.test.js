// node functions/test/webhook.test.js — MiseFits / MenuFits の Webhook を、Stripe・Firestore・メールを差し替えて確かめる
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const PRICES = {
  STRIPE_PRICE_ID: 'price_mf_ja', STRIPE_PRICE_ID_EN: 'price_mf_en',
  STRIPE_PRICE_ID_MENUFITS: 'price_mn_ja', STRIPE_PRICE_ID_MENUFITS_EN: 'price_mn_en',
  SMTP_HOST: 'smtp.example',
};
let params = { ...PRICES };

// ---- Firestore の代わり（create は既にあれば code 6 で失敗する） ----
const store = {};
const docRef = (coll, id) => ({
  async get() { const v = store[coll + '/' + id]; return { exists: !!v, data: () => v }; },
  async set(v) { store[coll + '/' + id] = { ...v }; },
  async create(v) { if (store[coll + '/' + id]) { const e = new Error('ALREADY_EXISTS'); e.code = 6; throw e; } store[coll + '/' + id] = { ...v }; },
  async update(v) { if (!store[coll + '/' + id]) { const e = new Error('NOT_FOUND'); e.code = 5; throw e; } Object.assign(store[coll + '/' + id], v); },
});
const fakeDb = { collection: (c) => ({ doc: (id) => docRef(c, id) }) };

const mails = [];
let mailFails = false;
let lineItems = {};
let listCalls = 0;
const fakes = {
  'firebase-functions/v2/https': { onRequest: (_o, fn) => fn },
  'firebase-functions/params': {
    defineSecret: () => ({ value: () => 'x' }),
    defineString: (n, o) => ({ value: () => (n in params ? params[n] : (o && o.default) || '') }),
  },
  'firebase-admin/app': { initializeApp() {}, getApps: () => [1] },
  'firebase-admin/firestore': { getFirestore: () => fakeDb, FieldValue: { serverTimestamp: () => 'TS', arrayUnion: (x) => [x] } },
  stripe: function Stripe() { return {
    webhooks: { constructEvent: (body) => JSON.parse(body) },
    checkout: { sessions: { listLineItems: async (id) => { listCalls++; return { data: (lineItems[id] || []).map((p) => ({ price: { id: p } })) }; } } },
  }; },
  nodemailer: { createTransport: () => ({ sendMail: async (m) => { if (mailFails && m.to !== 'studio@kokokikaku.com') throw new Error('smtp down'); mails.push(m); } }) },
};
const orig = Module._load;
Module._load = function (req, ...rest) { return fakes[req] || orig.call(this, req, ...rest); };
const fns = require(path.join(__dirname, '..', 'index.js'));
Module._load = orig;

async function post(fn, event) {
  let status = 200, body;
  const res = { set() { return this; }, status(s) { status = s; return this; }, send(b) { body = b; return this; }, json(b) { body = b; return this; } };
  await fns[fn]({ rawBody: JSON.stringify(event), headers: {} }, res);
  return { status, body };
}
const paid = (id, extra = {}) => ({ type: 'checkout.session.completed', data: { object: { id, mode: 'payment', payment_status: 'paid', payment_intent: 'pi_' + id, customer_details: { email: id + '@example.com', address: { country: 'JP' } }, ...extra } } });
const count = (prefix) => Object.keys(store).filter((k) => k.startsWith(prefix)).length;
const reset = () => { for (const k of Object.keys(store)) delete store[k]; mails.length = 0; mailFails = false; params = { ...PRICES }; listCalls = 0; };

(async () => {
  let passed = 0;
  const t = async (name, fn) => { reset(); await fn(); passed++; console.log('ok -', name); };

  for (const [label, fn, price, lic, ses] of [
    ['MiseFits', 'stripeWebhook', 'price_mf_ja', 'licenses/', 'sessions/'],
    ['MenuFits', 'menufitsStripeWebhook', 'price_mn_ja', 'menufitsLicenses/', 'menufitsSessions/'],
  ]) {
    await t(`${label}: 購入でキーを1本発行して控えを送る`, async () => {
      lineItems.cs_a = [price];
      const r = await post(fn, paid('cs_a'));
      assert.equal(r.status, 200);
      assert.equal(count(lic), 1);
      assert.equal(mails.filter((m) => m.to === 'cs_a@example.com').length, 1);
    });

    await t(`${label}: 同じ通知が2回届いてもキーとメールは1回`, async () => {
      lineItems.cs_b = [price];
      await Promise.all([post(fn, paid('cs_b')), post(fn, paid('cs_b'))]);
      await post(fn, paid('cs_b'));
      assert.equal(count(lic), 1);
      assert.equal(mails.filter((m) => m.to === 'cs_b@example.com').length, 1);
    });

    await t(`${label}: 途中で落ちたあとの再送では、確保済みのキーで続きから完了する`, async () => {
      lineItems.cs_r = [price];
      const prefix = label === 'MiseFits' ? 'MFPRO' : 'MNPRO';
      store[ses + 'cs_r'] = { licenseKey: prefix + '-RESU-MEDK-EYAA', claimedAt: Date.now() - 5 * 60 * 1000 };
      const r = await post(fn, paid('cs_r'));
      assert.equal(r.status, 200);
      assert.ok(store[lic + prefix + '-RESU-MEDK-EYAA']);
      assert.equal(mails.filter((m) => m.to === 'cs_r@example.com').length, 1);
      assert.match(mails[0].text, /RESU-MEDK-EYAA/);
    });

    await t(`${label}: メールが送れなかったら運営者に知らせる`, async () => {
      lineItems.cs_c = [price];
      mailFails = true;
      const r = await post(fn, paid('cs_c'));
      assert.equal(r.status, 200);
      assert.equal(mails.filter((m) => m.to === 'studio@kokokikaku.com').length, 1);
      const l = Object.entries(store).find(([k]) => k.startsWith(lic))[1];
      assert.ok(l.mailError);
    });

    await t(`${label}: ほかの商品の決済にはキーを出さない`, async () => {
      lineItems.cs_d = ['price_other'];
      const r = await post(fn, paid('cs_d'));
      assert.equal(r.status, 200);
      assert.equal(count(lic), 0);
    });

    await t(`${label}: サブスク（全銀ポン）は Stripe に問い合わせずに素通り`, async () => {
      const r = await post(fn, paid('cs_e', { mode: 'subscription' }));
      assert.equal(r.status, 200);
      assert.equal(listCalls, 0);
      assert.equal(count(lic), 0);
    });

    await t(`${label}: Price ID が未設定なら発行しない（500で Stripe に再送させる）`, async () => {
      params = { SMTP_HOST: 'smtp.example' };
      lineItems.cs_f = ['anything'];
      const r = await post(fn, paid('cs_f'));
      assert.equal(r.status, 500);
      assert.equal(count(lic), 0);
    });

    await t(`${label}: 返金でキーを無効にする。キーが無くても落ちない`, async () => {
      lineItems.cs_g = [price];
      await post(fn, paid('cs_g'));
      const r1 = await post(fn, { type: 'charge.refunded', data: { object: { refunded: true, payment_intent: 'pi_cs_g' } } });
      assert.equal(r1.status, 200);
      assert.equal(Object.entries(store).find(([k]) => k.startsWith(lic))[1].revoked, true);
      const piColl = lic === 'licenses/' ? 'paymentIntents/' : 'menufitsPaymentIntents/';
      store[piColl + 'pi_orphan'] = { licenseKey: 'NOPE' };
      const r2 = await post(fn, { type: 'charge.refunded', data: { object: { refunded: true, payment_intent: 'pi_orphan' } } });
      assert.equal(r2.status, 200);
    });
  }

  await t('MenuFits: 日本からの英語版購入は運営者に知らせる', async () => {
    lineItems.cs_h = ['price_mn_en'];
    await post('menufitsStripeWebhook', paid('cs_h'));
    const l = Object.entries(store).find(([k]) => k.startsWith('menufitsLicenses/'))[1];
    assert.equal(l.domesticJp, true);
    assert.equal(mails.filter((m) => m.to === 'studio@kokokikaku.com' && /要対応/.test(m.subject)).length, 1);
  });

  await t('MenuFits: 不正な session_id・キー・端末IDは 400', async () => {
    const call = async (fn, query) => { let s, b; await fns[fn]({ query }, { set() { return this; }, status(x) { s = x; return this; }, json(x) { b = x; return this; } }); return s; };
    assert.equal(await call('menufitsIssueLicense', { session_id: 'a/b' }), 400);
    assert.equal(await call('menufitsVerifyLicense', { key: 'x/y' }), 400);
    assert.equal(await call('menufitsVerifyLicense', { key: 'MNPRO-ABCD-EFGH-JKMN', device: '../x' }), 400);
  });

  console.log(`\n${passed} tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
