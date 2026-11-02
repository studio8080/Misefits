const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const analytics = html.slice(html.indexOf('var layoutStartedTracked = false;'), html.indexOf('/* 表示言語。'));
const addFixture = html.slice(html.indexOf('function addFixture(key, pos){'), html.indexOf('// 操作モードを1オブジェクトへ適用'));

function harness(options = {}) {
  const events = [], objects = [], saved = [];
  const storage = {};
  const ctx = {
    window: {gtag: (...args) => events.push(args), ...options.window},
    navigator: {...options.navigator},
    localStorage: {getItem: key => {if (options.storageDenied) throw Error('denied'); return storage[key] || null;}},
    Intl: {DateTimeFormat: () => ({resolvedOptions: () => ({timeZone: options.zone || 'Asia/Tokyo'})})},
    ITEM_INDEX: {free: {name: 'private fixture label'}, pro: {pro: true}},
    project: {active: options.noSheet ? -1 : 0},
    makeFixture: () => ({set() {}}), viewCenterScene: () => ({x: 123, y: 456}),
    applyObjMode() {}, isPro: () => !!options.pro, requestProPurchase() {},
    canvas: {
      add: obj => {if (options.addFails) throw Error('canvas unavailable'); objects.push(obj);},
      setActiveObject() {}, requestRenderAll() {}
    },
    isMobile: () => false, closeDrawer() {}, pushRecent() {}, updateWorkStatus() {},
    autosave: () => saved.push('autosave'), historyMark: () => saved.push('history'),
    showHint() {}, t: text => text
  };
  vm.createContext(ctx);
  vm.runInContext(analytics + '\n' + addFixture, ctx);
  return {ctx, events, objects, storage, saved, add: key => ctx.addFixture(key || 'free')};
}

test('successful placement counts once per page; later placements and save/history still work', () => {
  const h = harness(); h.add(); h.add();
  assert.equal(h.objects.length, 2);
  assert.deepEqual(h.saved, ['autosave', 'history', 'autosave', 'history']);
  assert.equal(h.events.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.events[0])), ['event', 'layout_started', {
    action: 'fixture_added', page_location: 'https://misefits.kokokikaku.com/', page_referrer: ''
  }]);
});

test('a new page has its own count; this is neither a user nor session metric', () => {
  const first = harness(), second = harness(); first.add(); second.add();
  assert.equal(first.events.length + second.events.length, 2);
});

test('invalid selection, missing sheet and locked fixture do not count', () => {
  const invalid = harness(); invalid.add('unknown');
  const blank = harness({noSheet: true}); blank.add();
  const locked = harness(); locked.add('pro');
  for (const h of [invalid, blank, locked]) {
    assert.equal(h.events.length, 0); assert.equal(h.objects.length, 0);
  }
});

test('a failed canvas add cannot count as a successful placement', () => {
  const h = harness({addFails: true}); assert.throws(() => h.add(), /canvas unavailable/);
  assert.equal(h.events.length, 0);
});

for (const [name, options] of [
  ['DNT', {navigator: {doNotTrack: '1'}}], ['window DNT', {window: {doNotTrack: '1'}}],
  ['GPC', {navigator: {globalPrivacyControl: true}}], ['opt-out access denied', {storageDenied: true}],
  ['Europe rule', {zone: 'Europe/Paris'}], ['GA disabled', {window: {'ga-disable-G-W0Y7GMPVRK': true}}],
  ['no analytics', {window: {gtag: undefined}}],
]) test(name + ' suppresses the metric without interrupting layout work', () => {
  const h = harness(options); assert.doesNotThrow(() => h.add());
  assert.equal(h.events.length, 0); assert.equal(h.objects.length, 1); assert.equal(h.saved.length, 2);
});

test('changing the privacy setting after loading prevents subsequent sending', () => {
  const h = harness(); h.storage.misefitsAnalyticsOptOut = '1'; h.add();
  assert.equal(h.events.length, 0);
  delete h.storage.misefitsAnalyticsOptOut; h.ctx.navigator.globalPrivacyControl = true; h.add();
  assert.equal(h.events.length, 0); assert.equal(h.objects.length, 2);
});

test('analytics exceptions cannot interrupt placement, saving or history', () => {
  const h = harness({window: {gtag() {throw Error('blocked');}}});
  assert.doesNotThrow(() => h.add()); assert.equal(h.objects.length, 1); assert.equal(h.saved.length, 2);
});

test('private input and browser location are not included in the event payload', () => {
  const h = harness();
  h.ctx.location = {href: 'https://misefits.kokokikaku.com/?customer=private#secret'};
  h.ctx.document = {referrer: 'https://private.test/path?email=private'};
  h.add();
  assert.ok(!JSON.stringify(h.events).includes('private'));
  assert.equal(Object.keys(h.events[0][2]).length, 3);
});

test('restoration and sheet creation do not emit this placement milestone', () => {
  assert.equal((html.match(/trackLayoutStarted\(\);/g) || []).length, 1);
  const h = harness(); assert.equal(h.events.length, 0);
});
