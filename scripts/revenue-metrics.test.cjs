const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/revenue-metrics.js'), 'utf8');
const config = JSON.parse(source.match(/var CFG = (.*);/)[1]);
function harness(options = {}) {
  const events = [], listeners = {}, timers = new Map(), storage = {};
  let now = 0, sequence = 0, intersection, mutation;
  const attrs = {'data-revenue': 'affiliate', 'data-revenue-placement': 'article',
    'data-revenue-id': 'sample-brand', 'data-revenue-provider': 'a8', ...options.attrs};
  const images = options.images || [];
  const link = {isConnected: true, getAttribute: k => attrs[k],
    closest: sel => sel === '[data-revenue]' || sel === 'a[href]' ? link : null,
    querySelectorAll: () => images, checkVisibility: () => options.rendered !== false};
  let links = [link];
  const doc = {visibilityState: 'visible', readyState: 'complete', body: {},
    querySelector: () => ({href: options.canonical || config.origin + '/guide.html'}),
    querySelectorAll: () => links,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); }};
  const win = {trackEvent: (name, params) => events.push({name, params}), ...options.window};
  const IO = options.noObserver ? undefined : function (fn) {
    intersection = fn;
    this.observe = () => {}; this.unobserve = () => {};
  };
  vm.runInNewContext(source, {window: win, document: doc, navigator: options.navigator || {}, URL, Map,
    localStorage: {getItem: k => {if (options.storageError) throw Error('denied'); return storage[k] || null;}},
    IntersectionObserver: IO, MutationObserver: function (fn) {mutation = fn; this.observe = () => {};},
    setTimeout: (fn, delay) => {const id = ++sequence; timers.set(id, {fn, at: now + delay}); return id;},
    clearTimeout: id => timers.delete(id)});
  function emit(type, event = {}) {(listeners[type] || []).forEach(fn => fn({type, button: 0, target: link, ...event}));}
  function tick(ms) {
    now += ms;
    [...timers].forEach(([id, timer]) => {if (timer.at <= now) {timers.delete(id); timer.fn();}});
  }
  return {events, link, doc, win, storage, tick, emit, attrs,
    intersect: (ratio, target = link) => intersection && intersection([{target, isIntersecting: ratio > 0, intersectionRatio: ratio}]),
    remove: () => {link.isConnected = false; links = []; mutation && mutation();},
    add: () => {link.isConnected = true; links = [link]; mutation && mutation();}};
}
test('view needs 50 percent for one continuous second and counts once per link', () => {
  const h = harness(); h.intersect(0.49); h.tick(2000); assert.equal(h.events.length, 0);
  h.intersect(0.5); h.tick(999); assert.equal(h.events.length, 0);
  h.tick(1); assert.equal(h.events[0].name, 'affiliate_view');
  h.intersect(0); h.intersect(1); h.tick(2000); assert.equal(h.events.length, 1);
});
test('leaving viewport and hidden tabs reset dwell time', () => {
  const h = harness(); h.intersect(1); h.tick(600); h.intersect(0); h.tick(600);
  h.intersect(1); h.tick(600); h.doc.visibilityState = 'hidden'; h.emit('visibilitychange'); h.tick(600);
  assert.equal(h.events.length, 0);
  h.doc.visibilityState = 'visible'; h.emit('visibilitychange'); h.tick(1000); assert.equal(h.events.length, 1);
});
test('clicks and middle clicks preserve navigation and contain only public labels', () => {
  const h = harness(); h.emit('click'); h.emit('auxclick', {button: 1}); h.emit('auxclick', {button: 2});
  assert.equal(h.events.length, 2);
  const event = h.events[0]; assert.equal(event.name, config.bannerEvents ? 'ad_click' : 'affiliate_click');
  assert.equal(event.params.page_location, config.origin + '/guide.html');
  assert.equal(event.params.page_referrer, '');
  assert.ok(!JSON.stringify(event).includes('a8mat'));
});
for (const [name, options] of [
  ['DNT', {navigator: {doNotTrack: '1'}}], ['window DNT', {window: {doNotTrack: '1'}}],
  ['GPC', {navigator: {globalPrivacyControl: true}}], ['storage denial', {storageError: true}],
]) test(name + ' blocks both views and clicks', () => {
  const h = harness(options); h.intersect(1); h.tick(1000); h.emit('click'); assert.equal(h.events.length, 0);
});
test('changing opt-out before timer or click prevents sending', () => {
  const h = harness(); h.intersect(1); h.storage[config.optOut] = '1'; h.tick(1000); h.emit('click'); assert.equal(h.events.length, 0);
});
test('Pro users have no affiliate metrics, but article-to-tool actions still work', () => {
  const h = harness({window: {MiseFitsNative: {pro: true}}}); h.intersect(1); h.tick(1000); h.emit('click'); assert.equal(h.events.length, 0);
  const action = harness({attrs: {'data-revenue': 'editor'}, window: {MiseFitsNative: {pro: true}}});
  action.emit('click'); assert.equal(action.events[0].name, 'revenue_action'); assert.equal(action.events[0].params.action, 'editor');
});
test('web license prevents affiliate metrics without sending the license', () => {
  if (!config.license) return;
  const h = harness(); h.storage[config.license] = 'private-license'; h.intersect(1); h.tick(1000); h.emit('click'); assert.equal(h.events.length, 0);
});
test('invalid labels, query-bearing canonical and foreign canonical are not measured', () => {
  for (const options of [{attrs: {'data-revenue-id': 'email@example.test'}},
    {canonical: config.origin + '/guide.html?session_id=private-secret'}, {canonical: 'https://other.test/guide.html'}]) {
    const h = harness(options); h.intersect(1); h.tick(1000); h.emit('click'); assert.equal(h.events.length, 0);
  }
});
test('hidden elements, unloaded images and removed elements do not generate views', () => {
  const image = {complete: false, naturalWidth: 0, addEventListener: () => {}};
  for (const options of [{rendered: false}, {images: [image]}]) {
    const h = harness(options); h.intersect(1); h.tick(1000); assert.equal(h.events.length, 0);
  }
  const h = harness(); h.intersect(1); h.remove(); h.tick(1000); assert.equal(h.events.length, 0);
});
test('without IntersectionObserver clicks work and no views are fabricated', () => {
  const h = harness({noObserver: true}); h.tick(5000); assert.equal(h.events.length, 0);
  h.emit('click'); assert.equal(h.events.length, 1);
});
test('analytics failure does not interrupt link handling', () => {
  const h = harness({window: {trackEvent: () => {throw Error('blocked');}}});
  assert.doesNotThrow(() => h.emit('click'));
});
