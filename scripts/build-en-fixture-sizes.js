#!/usr/bin/env node
/* 英語版の什器寸法一覧（en/fixture-sizes.html）を index.html の LIBRARY から生成する。
   寸法は手で書かない（AGENTS.md の方針）。什器を増減したり I18N_EN の英名を直したら、
   リポジトリのルートで `node scripts/build-en-fixture-sizes.js` を実行して作り直すこと。
   カテゴリの説明文だけは人が書いている（下の CAT_NOTES）。 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function extract(startMarker, endMarker) {
  const a = html.indexOf(startMarker);
  const b = html.indexOf(endMarker, a);
  if (a < 0 || b < 0) throw new Error('marker not found: ' + startMarker);
  return html.slice(a + startMarker.length, b).trim().replace(/;\s*$/, '');
}
const LIBRARY = new Function('return ' + extract('const LIBRARY =', 'const ITEM_INDEX'))();
const I18N_EN = new Function('return ' + extract('const I18N_EN =', 'Object.keys(I18N_EN)'))();
const en = (ja) => {
  if (!Object.prototype.hasOwnProperty.call(I18N_EN, ja)) throw new Error('missing English name: ' + ja);
  return I18N_EN[ja];
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inch = (mm) => Math.round(mm / 25.4);

// カテゴリの説明（英語版向けに人が書いたもの）。カテゴリを足したらここにも1文足す。
const CAT_NOTES = {
  '建築要素': 'Doors, windows, columns and shafts are the fixed constraints of a space — place them first so everything else works around them.',
  'バリアフリー・設備': 'Clearances and utilities that are easy to forget. The φ1500 circle is a common planning check for wheelchair turning; confirm the requirement that applies where you are.',
  '共通・受付': 'Reception, waiting and storage pieces used in almost every type of business.',
  '飲食店': 'Dining tables, booths and counters. Seat counts in the app come from each item\'s typical capacity (counters count one seat per 600 mm).',
  '物販・花・食料品': 'Display tables, shelving and refrigerated cases for shops, florists and grocery.',
  '美容・サロン': 'Styling chairs, shampoo units and treatment beds for hair, nail and beauty salons.',
  '教室・オフィス': 'Desks, meeting tables and storage for classrooms, tutoring schools and small offices.',
  'クリニック・ケア': 'Exam beds, consultation desks and waiting seats for clinics and care spaces.',
  'ジム・宿泊・ランドリー': 'Gym equipment, beds and laundry machines.',
  '厨房・水回り': 'Commercial kitchen equipment and plumbing fixtures. Sizes vary a lot by brand — overwrite width and depth with the model you are quoting.',
  '会議室・セミナー': 'Seminar tables, stacking chairs and presentation equipment.',
  '貸会場・レンタルスペース': 'Folding furniture, banquet rounds and partitions for event and rental spaces.',
  '宿泊・ゲストハウス': 'Beds, bunks and bathroom pods for hotels and guesthouses.',
  'ギャラリー・工房': 'Display panels, plinths and workbenches for galleries and studios.',
  'アパレル・衣料品': 'Rails, island racks, mirrors and fitting rooms for clothing stores.',
  'ライブ・イベント': 'Stages, sound booths and bar counters for live venues and events.',
  '自由図形': 'Plain shapes and text labels for anything not in the library.',
};

let total = 0;
const sections = LIBRARY.map((c, i) => {
  const id = 'cat-' + (i + 1);
  const note = CAT_NOTES[c.cat];
  if (!note) throw new Error('missing category note: ' + c.cat);
  const rows = c.items.map((it) => {
    total++;
    const name = en(it.name);
    let size, imp;
    if (it.shape === 'text') { size = '—'; imp = '—'; }
    else if (it.shape === 'circle') { size = `φ${it.w}`; imp = `φ${inch(it.w)}″`; }
    else { size = `${it.w} × ${it.d}`; imp = `${inch(it.w)}″ × ${inch(it.d)}″`; }
    return `          <tr><td>${esc(name)}${it.pro ? '<span class="pro-tag">Pro</span>' : ''}</td><td class="num">${size}</td><td>${imp}</td></tr>`;
  }).join('\n');
  return { id, name: en(c.cat), count: c.items.length, html: `
  <section class="blk cat" id="${id}">
    <h2>${esc(en(c.cat))}<span class="cat-count">${c.items.length} items</span></h2>
    <p>${esc(note)}</p>
    <div class="dim-wrap">
      <table class="dim">
        <thead><tr><th>Item</th><th>W × D (mm)</th><th>Approx. inches</th></tr></thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>
  </section>` };
});

const chips = sections.map((s) => `<a href="#${s.id}">${esc(s.name)}<span>${s.count}</span></a>`).join('\n      ');
const faq = [
  ['Where do these sizes come from?', 'They are the default sizes of the parts in MiseFits — typical sizes used for planning. Real products vary by manufacturer, so check the model you intend to buy and overwrite the width and depth in the app.'],
  ['Why millimetres?', 'Floor plans in Australia, New Zealand, Singapore, the UK and most of the world are drawn in millimetres. Inches are shown rounded to the nearest whole inch for reference only.'],
  ['What does “Pro” mean?', `Items marked Pro are part of MiseFits Pro (US$19 one-time). The other ${'${FREE}'} items are free to use.`],
  ['Do these sizes include clearance around the item?', 'No. They are the footprint of the item itself. Leave room for chairs to pull out, doors to open and people to pass — measure the gaps with the aisle tool in the app.'],
];
const free = LIBRARY.reduce((n, c) => n + c.items.filter((i) => !i.pro).length, 0);
const faqFilled = faq.map(([q, a]) => [q, a.replace('${FREE}', free)]);
const faqLd = faqFilled.map(([q, a]) => `        { "@type": "Question", "name": ${JSON.stringify(q)},
          "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(a)} } }`).join(',\n');
const faqHtml = faqFilled.map(([q, a]) => `    <details class="qa"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n');

const out = `<!DOCTYPE html>
<!-- 生成ファイル：scripts/build-en-fixture-sizes.js から作る。直接編集しないこと。 -->
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Restaurant &amp; Shop Fixture Sizes (mm) — ${total} tables, counters and kitchen equipment | MiseFits</title>
<meta name="description" content="Standard sizes in mm for ${total} restaurant, café, retail, salon, office and commercial kitchen fixtures — tables, booths, counters, sinks and fridges. Free to place at real size.">
<meta name="robots" content="index,follow">
<link rel="canonical" href="https://misefits.kokokikaku.com/en/fixture-sizes.html">
<link rel="alternate" hreflang="en" href="https://misefits.kokokikaku.com/en/fixture-sizes.html">
<link rel="alternate" hreflang="ja" href="https://misefits.kokokikaku.com/fixture-sizes.html">
<link rel="alternate" hreflang="x-default" href="https://misefits.kokokikaku.com/en/fixture-sizes.html">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com; font-src 'self' data:; connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com; object-src 'none'; base-uri 'self'; form-action 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta property="og:type" content="article">
<meta property="og:site_name" content="MiseFits">
<meta property="og:title" content="Restaurant &amp; shop fixture sizes (mm) — ${total} items">
<meta property="og:description" content="Standard sizes for tables, counters, shelving and kitchen equipment, ready to place on your floor plan.">
<meta property="og:url" content="https://misefits.kokokikaku.com/en/fixture-sizes.html">
<meta property="og:image" content="https://misefits.kokokikaku.com/assets/misefits-ogp.jpg">
<meta property="og:image:alt" content="MiseFits floor plan and layout planner">
<meta property="og:locale" content="en_AU">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0066cc">
<link rel="icon" href="../assets/misefits-favicon.png">
<link rel="apple-touch-icon" href="../assets/misefits-icon.png">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "Restaurant & shop fixture sizes (mm)",
      "inLanguage": "en",
      "mainEntityOfPage": "https://misefits.kokokikaku.com/en/fixture-sizes.html",
      "image": "https://misefits.kokokikaku.com/assets/misefits-ogp.jpg",
      "author": { "@type": "Organization", "name": "Koko Kikaku", "url": "https://kokokikaku.com/" },
      "publisher": { "@type": "Organization", "name": "Koko Kikaku", "url": "https://kokokikaku.com/" }
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
${faqLd}
      ]
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "MiseFits", "item": "https://misefits.kokokikaku.com/en/" },
        { "@type": "ListItem", "position": 2, "name": "Fixture sizes", "item": "https://misefits.kokokikaku.com/en/fixture-sizes.html" }
      ]
    }
  ]
}
</script>
<style>
  :root{ --bg:#eef1f5; --line:#dfe4ec; --ink:#242933; --sub:#667085; --accent:#0066cc; --accent2:#004f9f; --accent-soft:#e8f2ff; --sun:#ffb545; }
  *{box-sizing:border-box;margin:0;padding:0;}
  html{scroll-behavior:smooth;scroll-padding-top:86px;}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.7;-webkit-text-size-adjust:100%;}
  a{color:var(--accent);}
  .page-top{position:sticky;top:0;z-index:20;height:72px;background:rgba(255,255,255,.97);border-bottom:1px solid var(--line);
    display:flex;align-items:center;gap:14px;padding:0 18px;box-shadow:0 1px 14px rgba(25,33,46,.07);}
  .brand{display:flex;align-items:center;gap:12px;min-width:0;text-decoration:none;}
  .brand-icon{width:46px;height:46px;border-radius:14px;object-fit:contain;flex:0 0 auto;filter:drop-shadow(0 9px 18px rgba(0,80,160,.19));}
  .brand-name{font-family:Arial Rounded MT Bold,Arial,sans-serif;font-weight:900;font-size:25px;letter-spacing:.015em;color:#102033;line-height:1;}
  .brand-name .fit{color:var(--accent);font-style:italic;letter-spacing:-.01em;}
  .brand-name .dot{display:inline-block;width:8px;height:8px;margin-left:5px;border-radius:999px;background:var(--sun);vertical-align:top;transform:translateY(4px);}
  .brand small{display:block;color:var(--sub);font-weight:700;font-size:11.5px;line-height:1.35;margin-top:3px;}
  .top-sp{flex:1;}
  .btn{display:inline-flex;align-items:center;gap:6px;background:var(--accent);color:#fff;border:1px solid var(--accent);
    border-radius:9px;padding:10px 16px;font-size:13px;font-weight:800;text-decoration:none;white-space:nowrap;}
  .btn:hover{background:var(--accent2);border-color:var(--accent2);}
  .btn.outline{background:#fff;color:var(--accent);}
  main{max-width:900px;margin:0 auto;padding:26px 18px 60px;}
  .crumb{font-size:12px;color:var(--sub);margin-bottom:16px;}
  .crumb a{text-decoration:none;font-weight:700;}
  .hero{background:linear-gradient(145deg,#ffffff,#f6faff 60%,#fff8ec);border:1px solid var(--line);border-radius:18px;padding:28px 26px;box-shadow:0 12px 30px rgba(25,33,46,.07);}
  .kicker{display:inline-flex;color:var(--accent);background:var(--accent-soft);border:1px solid #cfe4ff;border-radius:999px;padding:5px 11px;font-size:11.5px;font-weight:800;margin-bottom:13px;}
  h1{font-size:28px;line-height:1.35;margin-bottom:12px;}
  .lead{font-size:14.5px;color:#3d4654;}
  .hero .btn{margin-top:18px;}
  section.blk{margin-top:22px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px 24px 18px;box-shadow:0 6px 18px rgba(25,33,46,.05);}
  section.blk > h2{font-size:19px;line-height:1.45;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--line);}
  section.blk p{font-size:14px;color:#3d4654;margin-bottom:10px;}
  .cat-count{font-size:11.5px;color:var(--sub);font-weight:700;margin-left:9px;}
  .dim-wrap{overflow-x:auto;margin:10px 0 6px;border:1px solid var(--line);border-radius:12px;}
  table.dim{border-collapse:separate;border-spacing:0;width:100%;min-width:480px;font-size:13.5px;background:#fff;}
  .dim th,.dim td{padding:9px 13px;border-bottom:1px solid var(--line);text-align:left;}
  .dim th{background:#f4f7fb;font-size:12px;color:var(--sub);white-space:nowrap;}
  .dim td.num{font-family:ui-monospace,Consolas,monospace;white-space:nowrap;}
  .dim td:nth-child(3){color:var(--sub);font-size:12.5px;white-space:nowrap;}
  .dim tr:last-child td{border-bottom:0;}
  .pro-tag{display:inline-block;background:#fff6e6;color:#8a5200;border:1px solid #ffe0b0;border-radius:5px;padding:0 5px;font-size:10px;font-weight:900;vertical-align:1px;margin-left:6px;}
  .sz-search{display:flex;gap:8px;align-items:center;background:#fff;border:1.5px solid var(--line);border-radius:12px;padding:10px 14px;margin:20px 0 12px;}
  .sz-search:focus-within{border-color:#9fcbff;}
  .sz-search input{flex:1;border:0;outline:0;font-size:15px;font-family:inherit;background:transparent;color:var(--ink);}
  .chips{display:flex;flex-wrap:wrap;gap:8px;}
  .chips a{display:inline-flex;align-items:baseline;gap:5px;text-decoration:none;color:var(--ink);font-size:12.5px;font-weight:800;border:1px solid var(--line);border-radius:999px;padding:7px 13px;background:#fbfcfe;}
  .chips a span{font-size:10.5px;color:var(--sub);font-weight:700;}
  .sz-nores{display:none;margin-top:14px;text-align:center;color:var(--sub);font-size:13px;background:#fbfcfe;border:1px dashed var(--line);border-radius:12px;padding:18px;}
  details.qa{margin-top:10px;border:1px solid var(--line);border-radius:12px;background:#fbfcfe;padding:0 15px;}
  details.qa[open]{padding-bottom:13px;background:#fff;}
  details.qa summary{cursor:pointer;padding:12px 0;font-size:14px;font-weight:800;list-style:none;}
  details.qa summary::-webkit-details-marker{display:none;}
  details.qa p{font-size:14px;color:#3d4654;margin:4px 0 0;}
  .cta{margin-top:30px;background:linear-gradient(145deg,#e9f3ff,#ffffff 65%,#fff6e6);border:1px solid #cfe4ff;border-radius:18px;padding:26px 24px;text-align:center;}
  .cta h2{font-size:20px;margin-bottom:8px;}
  .cta p{font-size:14px;color:#3d4654;margin-bottom:16px;}
  footer{background:#fbfcfe;border-top:1px solid var(--line);padding:20px 18px 28px;}
  .foot-in{max-width:900px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;font-size:12px;color:var(--sub);}
  .foot-in b{color:var(--ink);font-size:13px;}
  .foot-in a{font-weight:800;text-decoration:none;}
  .foot-in .sp{flex:1;}
  .legalnote{max-width:900px;margin:10px auto 0;font-size:11px;color:#7a8494;line-height:1.6;}
  @media (max-width:720px){
    .page-top{height:60px;padding:0 12px;gap:9px;}
    .brand-icon{width:36px;height:36px;border-radius:11px;}
    .brand-name{font-size:20px;}
    .brand small{display:none;}
    .btn{padding:9px 12px;font-size:12.5px;}
    main{padding:18px 12px 44px;}
    .hero{padding:20px 17px;}
    h1{font-size:22px;}
    section.blk{padding:18px 15px;}
  }
</style>
<script>
(function(){
  var GA_ID = 'G-W0Y7GMPVRK';   /* MiseFits プロパティの測定ID */
  if(!GA_ID) return;
  try{ if(localStorage.getItem('misefitsAnalyticsOptOut')==='1'){ window['ga-disable-'+GA_ID]=true; return; } }catch(e){}
  if(navigator.doNotTrack==='1'||window.doNotTrack==='1'||navigator.globalPrivacyControl===true) return;
  try{ if(String(Intl.DateTimeFormat().resolvedOptions().timeZone).indexOf('Europe/')===0) return; }catch(e){}   /* EU/UK の同意バナー導入までは送らない */
  window.dataLayer=window.dataLayer||[];
  window.gtag=function(){window.dataLayer.push(arguments);};
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, {anonymize_ip:true});
  var s=document.createElement('script');
  s.async=true; s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(GA_ID);
  document.head.appendChild(s);
})();
</script>
</head>
<body>
<header class="page-top">
  <a class="brand" href="./" aria-label="MiseFits home">
    <img class="brand-icon" src="../assets/misefits-icon.png" alt="" width="46" height="46">
    <span>
      <span class="brand-name"><span class="mise">Mise</span><span class="fit">Fits</span><span class="dot"></span></span>
      <small>Floor plan &amp; store layout planner</small>
    </span>
  </a>
  <span class="top-sp"></span>
  <a class="btn" href="../?lang=en">Open the app</a>
</header>

<main>
  <div class="crumb"><a href="./">MiseFits</a> › Fixture sizes</div>
  <div class="hero">
    <div class="kicker">${total} items · millimetres</div>
    <h1>Restaurant, shop and kitchen fixture sizes</h1>
    <p class="lead">The standard footprint of every part in the MiseFits library — dining tables, booths, counters, retail shelving, salon chairs, office desks and commercial kitchen equipment. Each one can be dropped onto your floor plan at real size and resized to the exact model you are buying.</p>
    <a class="btn" href="../?lang=en">Place them on your plan — free</a>
  </div>

  <label class="sz-search"><span aria-hidden="true">🔍</span><input id="szFilter" type="search" placeholder="Filter by name or size (e.g. booth, fridge, 1200)" aria-label="Filter fixtures"></label>
  <div class="chips">
      ${chips}
  </div>
  <div class="sz-nores" id="szNoRes">No matching items. Try another word.</div>
${sections.map((s) => s.html).join('\n')}

  <section class="blk" id="faq">
    <h2>FAQ</h2>
${faqHtml}
  </section>

  <div class="cta">
    <h2>Try them on your own floor plan</h2>
    <p>Load your plan, set the scale from one known length, and drag these fixtures into place.</p>
    <a class="btn" href="../?lang=en">Open MiseFits — free</a>
  </div>
</main>

<footer>
  <div class="foot-in">
    <b>MiseFits</b>
    <span class="sp"></span>
    <a href="./">Home</a>
    <a href="../?lang=en">App</a>
    <a href="restaurant-floor-plan.html">Restaurant floor plans</a>
    <a href="privacy.html">Privacy</a>
    <a href="terms.html">Terms &amp; refunds</a>
    <a href="https://docs.google.com/forms/d/e/1FAIpQLSeqM293xJzyK9ft7QF4lvvim8A679jueHyFA1YDXeUypalYwA/viewform" target="_blank" rel="noopener">Contact</a>
    <a href="../fixture-sizes.html" hreflang="ja">日本語</a>
  </div>
  <p class="legalnote">Sizes are typical planning values, not manufacturer specifications. Check the product you intend to buy, and confirm clearances and code requirements with a qualified local professional.</p>
</footer>
<script>
/* 絞り込み。名前・寸法・カテゴリ名の部分一致で行を出し入れし、行が残らないカテゴリは隠す。 */
(function(){
  var input = document.getElementById('szFilter'), noRes = document.getElementById('szNoRes');
  var cats = Array.prototype.slice.call(document.querySelectorAll('section.cat'));
  input.addEventListener('input', function(){
    var q = input.value.trim().toLowerCase(), any = false;
    cats.forEach(function(sec){
      var catHit = sec.querySelector('h2').textContent.toLowerCase().indexOf(q) >= 0, shown = 0;
      sec.querySelectorAll('tbody tr').forEach(function(tr){
        var hit = !q || catHit || tr.textContent.toLowerCase().indexOf(q) >= 0;
        tr.style.display = hit ? '' : 'none'; if(hit) shown++;
      });
      sec.style.display = shown ? '' : 'none'; if(shown) any = true;
    });
    noRes.style.display = any ? 'none' : 'block';
  });
})();
</script>
<!-- koko-ask-chatgpt -->
<script data-product="misefits">
/* Public-page question handoff. No API, account token, storage or page-body collection. */
(function () {
  'use strict';
  const products = {
    menufits: {
      name: 'MenuFits', origin: 'https://menufits.kokokikaku.com', accent: '#1e1c17', soft: '#f7f5f0',
      ja: { title: 'メニューづくり、もう少し詳しく。', intro: '使い方の疑問を、自分のChatGPTに聞いてみる。', about: 'ブラウザで飲食店のメニューを編集し、A4のPDFを作るツール。無料で試せる範囲と買い切りProがある。料金と機能は公式ページで確認する。', questions: ['初めてメニューを作る手順を教えて', '料理名や価格を更新するときのコツは？', '無料でできることとProの違いは？'], guides: [['使い方', '/guide.html'], ['よくある質問', '/faq.html'], ['料金・機能', '/pro.html']] },
      en: { title: 'A little help with your next menu.', intro: 'Take a question to your own ChatGPT.', about: 'A browser-based restaurant menu editor with A4 PDF output, a free tier and a one-time Pro upgrade. Check the official pages for current features and pricing.', questions: ['How do I make my first menu?', 'How can I keep menu prices easy to update?', 'What can I do for free, and what needs Pro?'], guides: [['Getting started', '/en/'], ['Features and pricing', '/en/']] }
    },
    misefits: {
      name: 'MiseFits', origin: 'https://misefits.kokokikaku.com', accent: '#0066cc', soft: '#e8f2ff',
      ja: { title: '配置の疑問を、ひとつずつ。', intro: '使い方や寸法の考え方を、自分のChatGPTに聞いてみる。', about: 'PDF・画像の図面や白紙の上に、什器を実寸mmで配置するブラウザツール。通路幅や席数を検討できる。法令適合や設計の保証を行うものではない。', questions: ['図面を読み込んで縮尺を合わせるには？', '通路幅や什器の寸法はどう考える？', '配置を保存して見直す手順を教えて'], guides: [['使い方', '/guide.html'], ['よくある質問', '/faq.html'], ['什器の寸法', '/fixture-sizes.html']] },
      en: { title: 'Think through your space.', intro: 'Ask your own ChatGPT about the tool and planning basics.', about: 'A browser tool for placing fixtures at real dimensions in mm on a PDF/image floor plan or a blank sheet. It helps explore layouts; it does not certify building-code compliance or replace a qualified designer.', questions: ['How do I import a floor plan and set its scale?', 'How should I think about aisles and fixture sizes?', 'How do I save and revisit a layout?'], guides: [['Getting started', '/en/'], ['Restaurant floor plans', '/en/restaurant-floor-plan.html'], ['Fixture sizes', '/en/fixture-sizes.html']] }
    },
    pitch: {
      name: 'ピッチの辞書 / PITCH DICTIONARY', origin: 'https://pitch.kokokikaku.com', accent: '#111c36', soft: '#fff8df',
      ja: { title: 'そのプレー、もう少し知りたい。', intro: '用語や戦術の見方を、自分のChatGPTで深める。', about: 'サッカーの用語を短い説明と独自の動く戦術ボードで学べる日英の無料辞書。', questions: ['このページの用語を初心者向けに説明して', '実際のプレーを見るときの注目点は？', '関連する用語も比べながら教えて'], guides: [['用語一覧', '/terms/'], ['英語の用語一覧', '/en/terms/']] },
      en: { title: 'Read the game a little deeper.', intro: 'Explore football terms with your own ChatGPT.', about: 'A free bilingual football glossary with short explanations and original animated tactics boards.', questions: ['Explain the term on this page for a beginner', 'What should I watch for during a match?', 'Compare this with related football terms'], guides: [['Football glossary', '/en/terms/'], ['Japanese glossary', '/terms/']] }
    },
    kabufits: {
      name: 'KabuFits', origin: 'https://kabufits.com', accent: '#0f6e6a', soft: '#eaf6f3',
      ja: { title: 'わからない言葉を、学びに変える。', intro: '用語や制度の一般的な説明を、自分のChatGPTに聞く。', about: '初心者向けの資産運用の学習サイト。用語・制度・架空例の体験ツールを提供する。個別銘柄の推奨や売買判断、個人向けの投資助言は提供しない。', questions: ['このページの内容を初心者向けに説明して', '用語の違いを架空の例で教えて', '理解を確かめる練習問題を出して'], guides: [['はじめる', '/start/'], ['用語集', '/glossary/'], ['制度と税金', '/rules/']] }
    },
    kininarumono: {
      name: '気になるモノ手帖', origin: 'https://kininarumono.jp', accent: '#003eba', soft: '#e4ecff',
      ja: { title: '気になる理由を、言葉にしてみる。', intro: '読みものや選び方を、自分のChatGPTで考える。', about: '日々の暮らしをデザインの視点で見つめる、雑貨・インテリア・ファッションなどのキュレーション媒体。掲載情報は購入や効果を保証するものではなく、現在の仕様は販売元で確認する。', questions: ['このページの選び方のポイントを整理して', '暮らしに取り入れるときの考え方は？', '関連する読みものを探したい'], guides: [['読みもの', '/read/'], ['運営について', '/about']] }
    },
    company: {
      name: 'スタジオここ企画 / Studio Kokokikaku', origin: 'https://kokokikaku.com', accent: '#1d1b1a', soft: '#fdefd8',
      ja: { title: 'ここ企画のサービスを、もっと知る。', intro: '製品の使い分けや記事を、自分のChatGPTに聞いてみる。', about: 'スタジオここ企画の会社・製品紹介サイト。MiseFits、MenuFits、ピッチの辞書などの公開サービスと、業務支援の情報を掲載。問い合わせは公式フォームから行う。', questions: ['MiseFitsとMenuFitsはどう使い分ける？', '自分に合う公開サービスを知りたい', 'このページの内容をわかりやすく説明して'], guides: [['Webサービス', '/services/web'], ['特集記事', '/column/']] },
      en: { title: 'Find the right tool for your idea.', intro: 'Explore our public products with your own ChatGPT.', about: 'Studio Kokokikaku builds browser-based tools including MiseFits, MenuFits and PITCH DICTIONARY. Use the official contact form for inquiries.', questions: ['How are MiseFits and MenuFits different?', 'Which public tool fits my needs?', 'Explain this page in plain language'], guides: [['Products', '/en/']] }
    }
  };
  const ui = {
    ja: { ask: 'ChatGPTに聞く', eyebrow: 'QUESTION GUIDE', heading: '何を知りたいですか？', close: '閉じる', choose: '質問を選ぶ', question: '質問文', placeholder: '聞きたいことを書いてもOK', preview: 'コピーする内容を見る', copy: '1. 質問をコピー', open: '2. ChatGPTを開く ↗', help: 'コピーした文面をChatGPTに貼り付けて送信してください。ログインや利用上限はご自身のアカウントに準じます。', privacy: 'コピーするのは質問文と公開ページの案内です。入力済みのメニュー・図面・学習記録は含みません。', copied: 'コピーしました。ChatGPTで貼り付けて送信できます。', failed: 'コピーできませんでした。下の文面を選択してコピーしてください。', empty: '質問を選ぶか、質問文を入力してください。', manual: '手動コピー用の文面', links: '公式ページで読む', external: 'ChatGPT（外部サービス）に移動します。', terms: 'AIの回答は、元のページと照らし合わせて確認してください。' },
    en: { ask: 'Ask ChatGPT', eyebrow: 'QUESTION GUIDE', heading: 'What would you like to know?', close: 'Close', choose: 'Choose a question', question: 'Your question', placeholder: 'Or write your own question', preview: 'Preview what will be copied', copy: '1. Copy question', open: '2. Open ChatGPT ↗', help: 'Paste the copied text into ChatGPT and send it. Sign-in and usage limits depend on your own account.', privacy: 'Only your question and public page references are copied. Your menu, floor plan and saved learning records are not included.', copied: 'Copied. Paste it into ChatGPT and send when ready.', failed: 'Could not copy. Select and copy the text below instead.', empty: 'Choose a question or enter your own.', manual: 'Text to copy manually', links: 'Read the official guides', external: 'Opens ChatGPT, an external service.', terms: 'Check AI answers against the original pages.' }
  };
  function cleanUrl(value, product) {
    try {
      const url = new URL(value, product.origin);
      if (url.protocol !== 'https:' || url.origin !== product.origin || url.username || url.password) return product.origin + '/';
      url.search = ''; url.hash = '';
      return url.href;
    } catch (_) { return product.origin + '/'; }
  }
  function makePrompt(productId, language, pageUrl, question) {
    const p = products[productId];
    if (!p) throw new Error('Unknown public product');
    const en = language === 'en' && !!p.en;
    const copy = en ? p.en : p.ja;
    const q = String(question || '').trim().slice(0, 600);
    const refs = [[en ? 'Current page' : '今見ている公開ページ', cleanUrl(pageUrl, p)], ...copy.guides.map(([label, path]) => [label, cleanUrl(path, p)])];
    return [
      en ? \`My question about \${p.name}: \${q}\` : \`\${p.name}についての質問：\${q}\`,
      '', copy.about, '',
      en ? 'Official public sources:' : '公式の公開情報：',
      ...refs.map(([label, url]) => \`\${label}: \${url}\`), '',
      en ? 'Read the relevant sources if available. Explain simply and link back to the actual official page for each key point. If you cannot access a source, say so; distinguish general background from facts verified on these pages. Do not invent product features, prices or links.' : '参照できる範囲で公式ページを読み、初心者にもわかるように説明してください。主な説明には対応する公式ページへのリンクを添えてください。ページを読めない場合はその旨を伝え、一般論と確認できた事実を区別してください。機能・料金・URLを推測で補わないでください。',
      productId === 'kabufits' ? '一般的な学習の説明に限り、銘柄の推奨・売買判断や個別の投資相談には踏み込まないでください。' : ''
    ].filter((line, i, arr) => line !== '' || arr[i - 1] !== '').join('\\n').trim();
  }
  function pageContext(productId, language, href, canonical) {
    const p = products[productId];
    const current = new URL(href);
    let url = cleanUrl(canonical || p.origin + current.pathname, p);
    if (language === 'en' && current.pathname === '/') url = p.origin + '/en/';
    return url;
  }
  async function copyPrompt(write, prompt) {
    if (!write) return false;
    try { await write(prompt); return true; } catch (_) { return false; }
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { products, makePrompt, cleanUrl, pageContext, copyPrompt };
    return;
  }
  const script = document.currentScript;
  const productId = script && script.dataset.product;
  const product = products[productId];
  if (!product) return;
  const style = \`
  .koko-ask,.koko-ask-dialog{box-sizing:border-box;color:#20242c;font:inherit;line-height:1.65;text-align:left;letter-spacing:normal}
  .koko-ask *, .koko-ask-dialog *{box-sizing:border-box}
  .koko-ask{width:calc(100% - 32px);max-width:960px;margin:32px auto;padding:24px 28px;background:var(--ask-soft);border:1px solid var(--ask-accent);border-radius:12px;display:flex;align-items:center;gap:24px;justify-content:space-between}
  .koko-ask p{margin:4px 0 0;font-size:14px}.koko-ask h2{font:inherit;font-size:clamp(19px,3vw,24px);font-weight:750;margin:4px 0;color:#20242c;line-height:1.4}
  .koko-ask small,.koko-ask-dialog small{display:block;font-size:11px;font-weight:700;letter-spacing:.14em;color:var(--ask-accent)}
  .koko-ask button,.koko-ask-dialog button,.koko-ask-dialog a.koko-ask-open{appearance:none;font:inherit;cursor:pointer;min-height:44px;border-radius:8px;padding:10px 16px;line-height:1.4;text-decoration:none}
  .koko-ask button,.koko-ask-copy{background:var(--ask-accent);border:1px solid var(--ask-accent);color:#fff;font-weight:700;white-space:nowrap}
  .koko-ask-dialog{width:min(620px,calc(100% - 24px));max-height:calc(100dvh - 40px);padding:26px;border:1px solid #d6d9df;border-radius:16px;background:#fff;box-shadow:0 24px 72px #10182844;overflow:auto;overscroll-behavior:contain;position:fixed;margin:auto}
  .koko-ask-dialog::backdrop{background:#15202b88}
  .koko-ask-dialog h2{font:inherit;font-size:24px;font-weight:750;margin:6px 0 12px;line-height:1.35;color:inherit;padding-right:58px}
  .koko-ask-close{position:absolute;right:14px;top:14px;background:transparent;color:inherit;border:1px solid #d6d9df;font-size:12px!important}
  .koko-ask-dialog>small{padding-right:74px;overflow-wrap:anywhere}
  .koko-ask-questions{display:grid;gap:8px;margin:12px 0 18px}
  .koko-ask-questions button{width:100%;text-align:left;background:var(--ask-soft);border:1px solid #d6d9df;color:#20242c;white-space:normal}
  .koko-ask-questions button[aria-pressed=true]{border-color:var(--ask-accent);box-shadow:inset 4px 0 var(--ask-accent);font-weight:700}
  .koko-ask-dialog label{font-size:13px;font-weight:700;display:block;margin:0 0 6px}
  .koko-ask-dialog textarea{display:block;font:inherit;font-size:16px;line-height:1.5;background:#fff;color:#20242c;border:1px solid #9ba3af;border-radius:8px;padding:12px;width:100%;max-width:100%;min-height:88px;resize:vertical;text-align:left}
  .koko-ask-dialog details{font-size:13px;margin:14px 0}.koko-ask-dialog summary{cursor:pointer;min-height:44px;padding:10px 0;font-weight:700}
  .koko-ask-dialog pre{font:inherit;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f5f7;padding:12px;border-radius:8px;color:#303844}
  .koko-ask-actions{display:flex;flex-wrap:wrap;gap:10px}.koko-ask-dialog a.koko-ask-open{background:#fff;border:1px solid var(--ask-accent);color:var(--ask-accent);display:inline-flex;align-items:center;font-weight:700}
  .koko-ask-dialog a{color:var(--ask-accent)}.koko-ask-status{font-size:13px;min-height:1.7em;margin:10px 0;color:var(--ask-accent);font-weight:700}
  .koko-ask-help,.koko-ask-privacy{font-size:12px;margin:8px 0;color:#46505f}.koko-ask-links{border-top:1px solid #d6d9df;padding-top:14px;margin-top:18px;font-size:13px;display:flex;gap:12px;flex-wrap:wrap}.koko-ask-links a{min-height:44px;display:inline-flex;align-items:center;text-underline-offset:3px}.koko-ask-links b{flex-basis:100%}
  .koko-ask-dialog [hidden]{display:none!important}.koko-ask button:focus-visible,.koko-ask-dialog :is(button,a,textarea,summary):focus-visible{outline:3px solid var(--ask-accent);outline-offset:3px}
  .koko-ask-app-trigger{min-height:44px!important;color:var(--ask-accent)!important;border-color:var(--ask-accent)!important}
  .koko-ask[data-product=kininarumono],.koko-ask-dialog[data-product=kininarumono]{border-radius:6px;box-shadow:4px 4px 0 #282039}
  .koko-ask[data-product=kininarumono] h2,.koko-ask-dialog[data-product=kininarumono] h2{font-family:var(--jp,inherit);font-weight:900}
  .koko-ask[data-product=company],.koko-ask-dialog[data-product=company]{border-top:4px solid #ff5a3c}
  @media(max-width:600px){.koko-ask{padding:20px;display:block;margin-block:24px}.koko-ask button{margin-top:16px;width:100%}.koko-ask-dialog{padding:20px}.koko-ask-actions>*{width:100%;justify-content:center;text-align:center}.koko-ask-dialog h2{font-size:21px}}
  @media(prefers-reduced-motion:reduce){.koko-ask,.koko-ask-dialog,.koko-ask-dialog *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
  \`;
  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }
  function mount() {
    const robots = document.querySelector('meta[name="robots"]');
    if (robots && /noindex/i.test(robots.content)) return;
    if (/\\/(?:pro-unlock|404|google[^/]*)(?:\\.html|\\/|$)/i.test(location.pathname)) return;
    if (document.querySelector('.koko-ask')) return;
    const footer = document.querySelector('footer');
    if (!footer || typeof HTMLDialogElement === 'undefined') return;
    const en = !!product.en && /^en/i.test(document.documentElement.lang);
    const language = en ? 'en' : 'ja', words = ui[language], content = product[language];
    const canonical = document.querySelector('link[rel="canonical"]');
    const page = pageContext(productId, language, location.href, canonical && canonical.href);
    const theme = \`--ask-accent:\${product.accent};--ask-soft:\${product.soft}\`;
    const css = element('style'); css.textContent = style; css.dataset.kokoAskStyle = 'true'; document.head.append(css);
    const root = element('section', 'koko-ask'); root.dataset.product = productId; root.setAttribute('aria-label', words.ask); root.style.cssText = theme;
    const intro = element('div'); intro.append(element('small', '', words.eyebrow), element('h2', '', content.title), element('p', '', content.intro));
    const trigger = element('button', '', words.ask + ' ↗'); trigger.type = 'button'; trigger.setAttribute('aria-haspopup', 'dialog');
    root.append(intro, trigger); footer.before(root);
    const dialog = element('dialog', 'koko-ask-dialog'); dialog.dataset.product = productId; dialog.style.cssText = theme; dialog.id = 'koko-ask-dialog'; dialog.setAttribute('aria-labelledby', 'koko-ask-title');
    trigger.setAttribute('aria-controls', dialog.id);
    const close = element('button', 'koko-ask-close', words.close); close.type = 'button';
    const title = element('h2', '', words.heading); title.id = 'koko-ask-title';
    dialog.append(close, element('small', '', product.name), title);
    const questions = element('div', 'koko-ask-questions'); questions.setAttribute('role', 'group'); questions.setAttribute('aria-label', words.choose);
    const label = element('label', '', words.question); label.htmlFor = 'koko-ask-question';
    const input = element('textarea'); input.id = 'koko-ask-question'; input.maxLength = 600; input.rows = 3; input.placeholder = words.placeholder; input.value = content.questions[0];
    const questionButtons = content.questions.map((q, i) => {
      const button = element('button', '', q); button.type = 'button'; button.setAttribute('aria-pressed', String(i === 0)); questions.append(button);
      button.addEventListener('click', () => { input.value = q; update(); }); return button;
    });
    const details = element('details'); const summary = element('summary', '', words.preview); const preview = element('pre'); details.append(summary, preview);
    const actions = element('div', 'koko-ask-actions'); const copy = element('button', 'koko-ask-copy', words.copy); copy.type = 'button';
    const open = element('a', 'koko-ask-open', words.open); open.href = 'https://chatgpt.com/'; open.target = '_blank'; open.rel = 'noopener noreferrer'; open.referrerPolicy = 'no-referrer'; open.setAttribute('aria-label', words.open + ' — ' + words.external);
    actions.append(copy, open);
    const status = element('p', 'koko-ask-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const manualLabel = element('label', '', words.manual); manualLabel.htmlFor = 'koko-ask-manual'; manualLabel.hidden = true;
    const manual = element('textarea'); manual.id = 'koko-ask-manual'; manual.readOnly = true; manual.rows = 8; manual.hidden = true;
    const links = element('nav', 'koko-ask-links'); links.setAttribute('aria-label', words.links); links.append(element('b', '', words.links));
    content.guides.forEach(([text, path]) => { const a = element('a', '', text); a.href = cleanUrl(path, product); links.append(a); });
    dialog.append(questions, label, input, details, actions, status, manualLabel, manual, element('p', 'koko-ask-help', words.help), element('p', 'koko-ask-privacy', words.privacy), element('p', 'koko-ask-help', words.terms), links);
    document.body.append(dialog);
    function update() {
      preview.textContent = makePrompt(productId, language, page, input.value);
      questionButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(input.value === content.questions[i])));
      status.textContent = ''; manual.hidden = true; manualLabel.hidden = true;
    }
    input.addEventListener('input', update); update();
    let lastTrigger = trigger;
    function show(event) { lastTrigger = event.currentTarget; dialog.showModal(); }
    trigger.addEventListener('click', show);
    const help = productId === 'menufits' && document.getElementById('helpBtn');
    let appTrigger = null;
    if (help) {
      appTrigger = element('button', 'btn koko-ask-app-trigger', words.ask);
      appTrigger.type = 'button'; appTrigger.style.cssText = theme;
      appTrigger.setAttribute('aria-haspopup', 'dialog'); appTrigger.setAttribute('aria-controls', dialog.id);
      help.after(appTrigger); appTrigger.addEventListener('click', show);
    }
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => lastTrigger.focus());
    copy.addEventListener('click', async () => {
      if (!input.value.trim()) { status.textContent = words.empty; input.focus(); return; }
      copy.disabled = true;
      const text = makePrompt(productId, language, page, input.value);
      const writer = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText.bind(navigator.clipboard) : null;
      const ok = await copyPrompt(writer, text); copy.disabled = false;
      if (ok) { status.textContent = words.copied; open.focus(); }
      else { status.textContent = words.failed; manualLabel.hidden = false; manual.hidden = false; manual.value = text; manual.focus(); manual.select(); }
    });
    const observer = new MutationObserver(() => {
      const nextEn = !!product.en && /^en/i.test(document.documentElement.lang);
      if (nextEn === en) return;
      observer.disconnect(); dialog.remove(); root.remove(); css.remove(); if (appTrigger) appTrigger.remove(); mount();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
</script>
</body>
</html>
`;

fs.mkdirSync(path.join(root, 'en'), { recursive: true });
fs.writeFileSync(path.join(root, 'en', 'fixture-sizes.html'), out);
console.log(`en/fixture-sizes.html: ${total} items in ${sections.length} categories`);
