/* Revenue measurement: public labels only; no input, link URL or license values.
 * affiliate_view = at least 50% of the link visible for 1 continuous second.
 * This is a local diagnostic metric, not an ASP/AdSense billable impression. */
(function () {
  'use strict';
  var CFG = {"origin": "https://misefits.kokokikaku.com", "optOut": "misefitsAnalyticsOptOut", "license": "misefitsWebLicense", "bannerEvents": false};
  if (window.__kokoRevenueMetrics) return;
  window.__kokoRevenueMetrics = true;
  var records = new Map();
  function blocked() {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true) return true;
    try { return localStorage.getItem(CFG.optOut) === '1'; } catch (e) { return true; }
  }
  function adBlocked() {
    try {
      return (CFG.license && !!localStorage.getItem(CFG.license)) ||
        !!(window.MiseFitsNative && window.MiseFitsNative.pro);
    } catch (e) { return true; }
  }
  function token(value) { return /^[a-z0-9_-]{1,48}$/.test(value || '') ? value : ''; }
  function context(link) {
    var owner = link.closest('[data-revenue]');
    if (!owner) return null;
    var action = owner.getAttribute('data-revenue');
    if (['affiliate', 'editor', 'pro'].indexOf(action) < 0) return null;
    var placement = token(owner.getAttribute('data-revenue-placement'));
    if (!placement) return null;
    var canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) return null;
    var page = new URL(canonical.href);
    if (page.origin !== CFG.origin || page.search || page.hash) return null;
    var params = { placement: placement, page_location: page.href, page_referrer: '' };
    if (action === 'affiliate') {
      var id = token(owner.getAttribute('data-revenue-id'));
      var provider = owner.getAttribute('data-revenue-provider');
      if (!id || ['a8', 'moshimo'].indexOf(provider) < 0) return null;
      params.advertiser_id = id;
      params.provider = provider;
      if (CFG.bannerEvents) {
        params.ad_network = provider;
        params.ad_creative = id;
        params.ad_placement = placement;
        params.page_kind = page.pathname.indexOf('/read/') === 0 ? 'article' :
          page.pathname.indexOf('/category/') === 0 ? 'category' : 'top';
      }
    } else params.action = action;
    return { action: action, params: params };
  }
  function send(name, info) {
    if (blocked() || (info.action === 'affiliate' && adBlocked())) return;
    try {
      if (typeof window.trackEvent === 'function') window.trackEvent(name, info.params);
      else if (typeof window.gtag === 'function') window.gtag('event', name, info.params);
    } catch (e) { /* Measurement never interrupts a link or editor. */ }
  }
  function eligible(record) {
    var link = record.link;
    if (document.visibilityState !== 'visible' || !link.isConnected || record.ratio < 0.5 || blocked()) return false;
    if (record.info.action === 'affiliate' && adBlocked()) return false;
    if (link.checkVisibility && !link.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    var images = link.querySelectorAll('img');
    for (var i = 0; i < images.length; i++) if (!images[i].complete || !images[i].naturalWidth) return false;
    return true;
  }
  function update(record) {
    if (record.sent) return;
    if (!eligible(record)) {
      clearTimeout(record.timer); record.timer = null; return;
    }
    if (record.timer !== null) return;
    record.timer = setTimeout(function () {
      record.timer = null;
      if (!eligible(record)) return;
      record.sent = true;
      send(record.info.action === 'affiliate' ? 'affiliate_view' : 'revenue_action_view', record.info);
      if (observer) observer.unobserve(record.link);
    }, 1000);
  }
  var observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var record = records.get(entry.target);
      if (record) { record.ratio = entry.isIntersecting ? entry.intersectionRatio : 0; update(record); }
    });
  }, { threshold: [0, 0.5] }) : null;
  function scan() {
    if (!observer) return; // No fabricated views when observation is unavailable.
    document.querySelectorAll('[data-revenue] a[href], a[data-revenue][href]').forEach(function (link) {
      if (records.has(link)) return;
      var info;
      try { info = context(link); } catch (e) { return; }
      if (!info) return;
      var record = { link: link, info: info, ratio: 0, timer: null, sent: false };
      records.set(link, record);
      link.querySelectorAll('img').forEach(function (img) { img.addEventListener('load', function () { update(record); }); });
      observer.observe(link);
    });
    records.forEach(function (record, link) {
      if (!link.isConnected) { clearTimeout(record.timer); observer.unobserve(link); records.delete(link); }
    });
  }
  function click(event) {
    if ((event.type === 'click' && event.button > 0) || (event.type === 'auxclick' && event.button !== 1)) return;
    var target = event.target.closest ? event.target : event.target.parentElement;
    var link = target && target.closest('a[href]');
    if (!link) return;
    try {
      var info = context(link);
      if (info) send(info.action === 'affiliate' ? (CFG.bannerEvents ? 'ad_click' : 'affiliate_click') : 'revenue_action', info);
    } catch (e) {}
  }
  document.addEventListener('click', click, { passive: true });
  document.addEventListener('auxclick', click, { passive: true });
  document.addEventListener('visibilitychange', function () { records.forEach(update); });
  function start() {
    scan();
    if (typeof MutationObserver === 'function' && observer) new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
