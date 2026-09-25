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
  ['Why millimetres?', 'Floor plans in Australia, Singapore, the UAE, the UK and most of the world are drawn in millimetres. Inches are shown rounded to the nearest whole inch for reference only.'],
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
<meta name="description" content="Standard sizes in millimetres for ${total} restaurant, café, retail, salon, office and commercial kitchen fixtures — tables, booths, counters, shelving, sinks, fridges, fryers and more. Drop any of them onto your floor plan at real size.">
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
  if(navigator.doNotTrack==='1'||window.doNotTrack==='1') return;
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
</body>
</html>
`;

fs.mkdirSync(path.join(root, 'en'), { recursive: true });
fs.writeFileSync(path.join(root, 'en', 'fixture-sizes.html'), out);
console.log(`en/fixture-sizes.html: ${total} items in ${sections.length} categories`);
