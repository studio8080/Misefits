#!/usr/bin/env node
/*
 * ルートの index.html（MiseFits Web版・単一ソース）を読み込み、iOSアプリ同梱用に
 * 以下だけを変換した mobile/assets/webapp/index.html を生成する。
 *   - CDN(cdnjs)のFabric.js/pdf.js/jsPDFをローカルの vendor/*.bin に差し替え
 *     （拡張子は .bin: Metro に「実行するJSモジュール」ではなく「同梱アセット」として
 *       扱わせるため。WebView実行時のファイル名は vendor/*.js に戻す）
 *   - CSPメタタグを削除（WebViewはfile://オリジンで動くためcdnjs許可は不要）
 *   - GA_IDを空にして解析を無効化（App Store審査でのATT判定リスクを避けるため）
 * ロジック（Pro機能のフラグ受信など）は index.html 側に直接書かれているため、
 * ここでは一切のロジック注入はしない＝Web版とアプリ版で同じソースを共有する。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const ROOT_HTML = path.join(__dirname, '..', '..', 'index.html');
const OUT_DIR = path.join(__dirname, '..', 'assets', 'webapp');
const VENDOR_DIR = path.join(OUT_DIR, 'vendor');
const FORCE = process.argv.includes('--force');

const VENDOR_LIBS = [
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js',
    integrity: 'sha384-sLpuECXYCB5TUyTbC06pftm/rgurDambREZmV4eRHwEqJzCQtU6lxI2Ve00z4XW5',
    out: 'fabric.min.bin',
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    integrity: 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e',
    out: 'pdf.min.bin',
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    integrity: null, // 本体HTMLにはこのファイルのintegrity記載が無いため検証はスキップ
    out: 'pdf.worker.min.bin',
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    integrity: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk',
    out: 'jspdf.umd.min.bin',
  },
];

function download(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        resolve(download(res.headers.location, redirectsLeft - 1));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`GET ${url} -> HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function sha384Base64(buf) {
  return 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
}

async function fetchVendorLibs() {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  for (const lib of VENDOR_LIBS) {
    const dest = path.join(VENDOR_DIR, lib.out);
    if (fs.existsSync(dest) && !FORCE) {
      console.log(`skip (exists): ${lib.out}`);
      continue;
    }
    console.log(`downloading: ${lib.url}`);
    const buf = await download(lib.url);
    if (lib.integrity) {
      const actual = sha384Base64(buf);
      if (actual !== lib.integrity) {
        throw new Error(
          `integrity mismatch for ${lib.url}\n  expected: ${lib.integrity}\n  actual:   ${actual}`
        );
      }
    }
    fs.writeFileSync(dest, buf);
    console.log(`saved: ${lib.out} (${buf.length} bytes)${lib.integrity ? ' [integrity OK]' : ''}`);
  }
}

function transformHtml(html) {
  let out = html;

  // 1) CDN <script> タグ3つ → ローカル vendor/*.js 参照へ（属性は落とす）
  const scriptReplacements = [
    [/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/fabric\.js\/5\.3\.1\/fabric\.min\.js"[\s\S]*?crossorigin="anonymous" referrerpolicy="no-referrer"><\/script>/, '<script src="vendor/fabric.min.js"></script>'],
    [/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/3\.11\.174\/pdf\.min\.js"[\s\S]*?crossorigin="anonymous" referrerpolicy="no-referrer"><\/script>/, '<script src="vendor/pdf.min.js"></script>'],
    [/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\/2\.5\.1\/jspdf\.umd\.min\.js"[\s\S]*?crossorigin="anonymous" referrerpolicy="no-referrer"><\/script>/, '<script src="vendor/jspdf.umd.min.js"></script>'],
  ];
  for (const [pattern, replacement] of scriptReplacements) {
    if (pattern.test(out)) {
      out = out.replace(pattern, replacement);
      continue;
    }
    // pdf.js / jsPDF はWeb版では必要時に読み込む。遅延読み込みのURLも同梱先へ変換する。
    const localSrc = replacement.match(/src="([^"]+)"/)[1];
    const lib = VENDOR_LIBS.find((entry) => `vendor/${entry.out.replace(/\.bin$/, '.js')}` === localSrc);
    if (!lib || !out.includes(`src:'${lib.url}'`)) {
      throw new Error(`script or lazy library not found in index.html: ${localSrc}`);
    }
    out = out.split(lib.url).join(localSrc);
  }

  // 2) pdf.worker のCDN URL文字列 → ローカルパス
  const workerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  if (!out.includes(workerUrl)) throw new Error('pdf.worker CDN URL not found in index.html');
  out = out.split(workerUrl).join('vendor/pdf.worker.min.js');

  // 3) CSPメタタグを削除（WebViewのfile://コンテキストでは不要・かえって邪魔）
  const cspPattern = /<meta http-equiv="Content-Security-Policy"[^>]*>\n?/;
  if (!cspPattern.test(out)) throw new Error('CSP meta tag not found in index.html');
  out = out.replace(cspPattern, '');

  // 4) GA_IDを空にしてアプリ版では解析を無効化（ATT判定リスク回避）
  const gaPattern = /var GA_ID = 'G-[A-Z0-9]+';/;
  if (!gaPattern.test(out)) throw new Error('GA_ID assignment not found in index.html');
  out = out.replace(gaPattern, "var GA_ID = ''; /* アプリ版では無効化（build-webapp-bundle.jsが変換） */");

  // 5) isApp:trueを同期的に注入。Web版の「ライセンスキー入力」UI（Web限定・買い切り販売用）が
  //    ネイティブからのentitlementメッセージ到着まで一瞬表示されてしまうチラつきを防ぐ。
  //    アプリ内の課金はApple IAP（RevenueCat）経由なのでこのUIは常に非表示にしてよい。
  const nativeInitPattern = "window.MiseFitsNative = window.MiseFitsNative || { isApp:false, pro:false, uid:null };";
  if (!out.includes(nativeInitPattern)) throw new Error('MiseFitsNative init not found in index.html');
  out = out.replace(
    nativeInitPattern,
    "window.MiseFitsNative = { isApp:true, pro:false, uid:null }; /* アプリ版はisAppを同期初期化（build-webapp-bundle.jsが変換） */"
  );

  return out;
}

async function main() {
  if (!fs.existsSync(ROOT_HTML)) throw new Error(`root index.html not found: ${ROOT_HTML}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  await fetchVendorLibs();

  const srcHtml = fs.readFileSync(ROOT_HTML, 'utf8');
  const outHtml = transformHtml(srcHtml);
  const outPath = path.join(OUT_DIR, 'index.html');
  fs.writeFileSync(outPath, outHtml, 'utf8');
  console.log(`wrote: ${path.relative(process.cwd(), outPath)} (${outHtml.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
