'use strict';
// No browser/network: real HTML handlers run in a VM with a GA queue stub.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../en/index.html'), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('function trackEvent('));
const links = [...html.matchAll(/<a\b[^>]*href="\.\.\/\?lang=en"[^>]*>/g)].map(m => m[0]);
const placements = ['header', 'hero', 'free_plan', 'related', 'cta', 'footer'];
function harness(options = {}) {
  const scripts = [], storage = {}, win = {...options.window};
  const ctx = vm.createContext({window:win, navigator:options.navigator || {},
    localStorage:{getItem:key => {if(options.storageError) throw Error('denied'); return storage[key] || null;}},
    Intl:{DateTimeFormat:() => ({resolvedOptions:() => ({timeZone:options.timeZone || 'Asia/Tokyo'})})},
    document:{createElement:() => ({}), head:{appendChild:s => scripts.push(s)}}});
  function init() {vm.runInContext(script, ctx);}
  init();
  const events = () => Array.from(win.dataLayer || [], a => Array.from(a)).filter(a => a[0] === 'event');
  function click(index) {
    const handler = links[index].match(/onclick="([^"]+)"/)[1];
    // undefined return leaves default navigation intact; event cancellation is unavailable.
    return vm.runInContext(handler, ctx);
  }
  return {win, ctx, storage, scripts, events, click, init};
}
test('all six app links keep destinations and send en_open_app exactly once with fixed placement', () => {
  assert.equal(links.length, 6);
  const h = harness();
  for (let i=0; i<links.length; i++) {
    assert.equal((links[i].match(/onclick=/g) || []).length, 1);
    assert.equal(h.click(i), undefined);
    assert.equal(h.events().length, i+1);
    const [,name,params] = h.events()[i];
    assert.equal(name, 'en_open_app'); assert.equal(params.location, placements[i]);
    assert.deepEqual(Object.keys(params).sort(), ['location','page_location','page_referrer']);
    assert.equal(params.page_location, 'https://misefits.kokokikaku.com/en/'); assert.equal(params.page_referrer, '');
  }
  assert.match(links[1], /location:'hero'/); assert.match(links[4], /location:'cta'/);
});
test('repeated script initialization never installs duplicate click listeners', () => {
  const h = harness(); h.init(); h.init();
  assert.equal(h.scripts.length, 1);
  assert.equal(Array.from(h.win.dataLayer).filter(a => a[0] === 'config').length, 1);
  for (let i=0; i<6; i++) h.click(i);
  assert.equal(h.events().length, 6);
  // This feature uses one existing inline handler per anchor, no added delegation.
  assert.ok(!script.includes('addEventListener'));
});
for (const [name, options] of [
  ['DNT', {navigator:{doNotTrack:'1'}}], ['window DNT', {window:{doNotTrack:'1'}}],
  ['GPC', {navigator:{globalPrivacyControl:true}}], ['European time zone', {timeZone:'Europe/London'}],
  ['GA disable', {window:{'ga-disable-G-W0Y7GMPVRK':true}}], ['storage denial', {storageError:true}]
]) test(name + ' blocks all six app events, even when gtag exists', () => {
  const h = harness(options), calls = [];
  h.win.gtag = (...args) => calls.push(args);
  for(let i=0; i<6; i++) assert.doesNotThrow(() => h.click(i));
  assert.equal(calls.length, 0);
  if (['DNT','window DNT','GPC','European time zone'].includes(name)) assert.equal(h.scripts.length, 0);
});
test('opt-out after initialization blocks all links and opting back in resumes existing handler', () => {
  const h = harness(); h.storage.misefitsAnalyticsOptOut = '1';
  for(let i=0; i<6; i++) h.click(i);
  assert.equal(h.events().length, 0);
  delete h.storage.misefitsAnalyticsOptOut; h.click(0); assert.equal(h.events().length, 1);
});
test('initial opt-out prevents loader and clicks', () => {
  const h = harness(); h.storage.misefitsAnalyticsOptOut = '1'; h.win.dataLayer = []; h.scripts.length = 0;
  h.init(); h.click(1); assert.equal(h.scripts.length, 0); assert.equal(h.events().length, 0);
});
test('disabled/throwing GA never blocks link navigation', () => {
  const h = harness();
  h.win.gtag = undefined;
  for(let i=0; i<6; i++) assert.doesNotThrow(() => h.click(i));
  h.win.gtag = () => {throw Error('blocked');};
  for(let i=0; i<6; i++) assert.doesNotThrow(() => h.click(i));
});
test('unknown locations and arbitrary URL/input fields cannot enter app click payloads', () => {
  const h = harness();
  vm.runInContext("trackEvent('en_open_app',{location:'https://private.test/?email=private'})", h.ctx);
  assert.equal(h.events().length, 0);
  vm.runInContext("trackEvent('en_open_app',{location:'hero',url:'https://private.test/?email=private',email:'private@example.test'})", h.ctx);
  assert.equal(h.events().length, 1);
  assert.ok(!JSON.stringify(h.events()).includes('private'));
});
test('inline handlers preserve modifier clicks, target-blank and default browser behavior', () => {
  const h = harness();
  for (const link of links) {
    const handler = new Function('trackEvent', 'event', link.match(/onclick="([^"]+)"/)[1]);
    for (const modifiers of [{}, {ctrlKey:true}, {metaKey:true}, {shiftKey:true}, {altKey:true}]) {
      let cancelled = 0, stopped = 0;
      const event = {...modifiers, button:0, preventDefault:() => {cancelled++;}, stopPropagation:() => {stopped++;}};
      const anchor = {href:'../?lang=en', target:'_blank', rel:'noopener'}, before = h.events().length;
      assert.equal(handler.call(anchor, h.ctx.trackEvent, event), undefined);
      assert.equal(cancelled, 0); assert.equal(stopped, 0);
      assert.deepEqual(anchor, {href:'../?lang=en', target:'_blank', rel:'noopener'});
      assert.equal(h.events().length, before + 1);
    }
  }
});
