'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');

let records = new Map(), queue = Promise.resolve(), failStore = false, writes = 0;
const fakeDb = {
  collection: (name) => ({ doc: (id) => ({ path: name + '/' + id }) }),
  runTransaction(fn) {
    const task = queue.then(async () => {
      if (failStore) throw new Error('synthetic infrastructure failure');
      const staged = [];
      const result = await fn({
        get: async (ref) => ({ exists: records.has(ref.path), data: () => structuredClone(records.get(ref.path)) }),
        update: (ref, value) => staged.push([ref.path, value]),
      });
      for (const [p, v] of staged) { records.set(p, { ...records.get(p), ...v }); writes++; }
      return result;
    });
    queue = task.catch(() => {});
    return task;
  },
};
const fakes = {
  'firebase-functions/v2/https': { onRequest: (_o, fn) => fn },
  'firebase-functions/params': { defineSecret: () => ({ value: () => '' }), defineString: (_n, o) => ({ value: () => o?.default || '' }) },
  'firebase-admin/app': { initializeApp() {}, getApps: () => [1] },
  'firebase-admin/firestore': { getFirestore: () => fakeDb, FieldValue: {} },
  stripe: function () {},
  nodemailer: { createTransport: () => ({}) },
};
const original = Module._load;
let fns;
try {
  Module._load = function (name, ...args) { return fakes[name] || original.call(this, name, ...args); };
  fns = require('../index');
} finally { Module._load = original; }
async function call(fn, query) {
  let status, body; const headers = {};
  await fns[fn]({ query }, { set(k, v) { headers[k] = v; return this; }, status(s) { status = s; return this; }, json(v) { body = v; return this; } });
  assert.equal(headers['Cache-Control'], 'no-store');
  return { status, body };
}
for (const [label, fn, coll, key, device] of [
  ['MiseFits', 'verifyLicense', 'licenses', 'MFPRO-ABCD-EFGH-JKMN-PQRS', (i) => 'dev-' + i.toString(16).padStart(32, '0')],
  ['MenuFits', 'menufitsVerifyLicense', 'menufitsLicenses', 'MNPRO-ABCD-EFGH-JKMN', (i) => 'd' + i.toString(36).padStart(8, '0')],
]) {
  test(label + ': 同時に12端末が最後の1枠を要求しても1台だけ登録', async () => {
    records = new Map([[coll + '/' + key, { devices: [1, 2, 3, 4].map(device) }]]); writes = 0;
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => call(fn, { key, device: device(10 + i) })));
    assert.equal(results.filter((x) => x.body.valid).length, 1);
    assert.equal(results.filter((x) => x.body.reason === 'device_limit').length, 11);
    assert.equal(records.get(coll + '/' + key).devices.length, 5);
    assert.equal(writes, 1);
  });
  test(label + ': 同じ端末の再試行・旧クライアント・返金・欠損を維持', async () => {
    const p = coll + '/' + key; records = new Map([[p, { devices: [device(1)] }]]); writes = 0;
    const rs = await Promise.all(Array.from({ length: 8 }, () => call(fn, { key, device: device(1) })));
    assert.ok(rs.every((x) => x.body.valid)); assert.equal(writes, 0);
    assert.deepEqual((await call(fn, { key })).body, { valid: true }); assert.equal(writes, 0);
    records.set(p, { revoked: true, devices: [] });
    assert.deepEqual((await call(fn, { key, device: device(1) })).body, { valid: false, reason: 'revoked' });
    assert.deepEqual((await call(fn, { key })).body, { valid: false, reason: 'revoked' });
    records.delete(p); assert.deepEqual((await call(fn, { key })).body, { valid: false });
  });
  test(label + ': 不正な入力とDB障害は許可を出さない', async () => {
    assert.equal((await call(fn, { key: 'invalid' })).status, 400);
    failStore = true;
    try { const r = await call(fn, { key, device: device(1) }); assert.equal(r.status, 503); assert.deepEqual(r.body, { valid: false, reason: 'unavailable' }); }
    finally { failStore = false; }
  });
}
