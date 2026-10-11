/* MiseFits 広告スロット（A8.net / もしもアフィリエイト 兼用）
 *
 * ASPのタグを貼るまでは AD_TAGS が空なので、広告枠は DOM ごと消える
 * （外部への通信もラベル表示も一切発生しない）。残りの作業は2つだけ。
 *
 *  1. 下の AD_TAGS に、ASPの管理画面からコピーしたタグをそのまま貼る。
 *  2. 実際に広告が出ているページで DevTools の Console に
 *     CSP 違反が出ていないことを確認する。
 *
 * CSP は A8.net 向け（img-src https://*.a8.net）を掲載8ページに追記済み。
 * もしもアフィリエイトの「かんたんリンク」を使う場合は、JS で商品画像を差し込むため
 * 追加で script-src https://af.moshimo.com と
 * img-src https://image.moshimo.com https://i.moshimo.com https://m.media-amazon.com
 *         https://thumbnail.image.rakuten.co.jp が必要になる。
 *
 * 掲載面のルール（AGENTS.md にも記載）:
 *   - 出すのは集客ページ（madori-2d / layout-* / aisle-width / fixture-sizes / guide / faq）だけ。
 *     アプリ本体（/）と課金導線（pro.html / pro-unlock.html）には出さない。
 *   - Proライセンスを持っている人には出さない（下の isProUser）。
 *   - 「広告」ラベルを必ず併記する（景品表示法のステマ規制対応、およびA8の広告表示義務）。
 *     ラベルはこのファイルが自動で付けるので、ページ側に書く必要はない。
 */
(function(){
  'use strict';

  /* ===== ここにASPのタグを貼る（貼るまでは広告枠は出ない） =====
     キーは「どの広告主か」。A8の広告リンク生成で、掲載サイトに MiseFits を
     選んでから出力したタグを、そのまま文字列として貼ること。 */
  /* heading と lead は**こちらで書いた紹介文**。tag は A8 が生成したものをそのまま。
     tag の中（URL・rel・アンカーテキスト）は絶対に書き換えないこと（A8の規約違反）。
     見せ方を変えたいときは heading / lead / CSS 側だけを触る。
     紹介文は広告主のPR文の範囲を超えないこと（誇大表示は景表法の問題になる）。 */
  var AD_TAGS = {
    /* 家具350（株式会社イーナ）… 住まい寄りの madori-2d 用。素材ID 025（テキスト）。 */
    'kagu350': {
      heading: '寸法が決まったら、実物を探す',
      lead: '幅と奥行きが決まれば、そのサイズで探せます。ソファ・ベッド・収納などを扱う家具通販です。',
      tag:
        '<a href="https://px.a8.net/svt/ejp?a8mat=4BA2HE+6QBFZM+20EY+C2102" rel="nofollow">家具350</a>'
        + '<img border="0" width="1" height="1" src="https://www19.a8.net/0.gif?a8mat=4BA2HE+6QBFZM+20EY+C2102" alt="">'
    },
    /* オフィスコム（オフィス家具通販）… 店舗・オフィス什器の文脈が近い集客ページ用。素材ID 001（テキスト）。 */
    'officecom': {
      heading: '什器の実物を探すなら',
      lead: '机・椅子・収納など、店舗やオフィスの什器を20万点以上から探せます。サイズが決まっていれば、そのまま比較できます。',
      tag:
        '<a href="https://px.a8.net/svt/ejp?a8mat=4BC36L+FUYT02+53JI+BWVTE" rel="nofollow">机や椅子などのオフィス家具通販【オフィスコム】</a>'
        + '<img border="0" width="1" height="1" src="https://www16.a8.net/0.gif?a8mat=4BC36L+FUYT02+53JI+BWVTE" alt="">'
    }
  };

  /* どのページのどの枠に、どの広告主を出すか。
     キーはページのファイル名、'default' は指定のないページ。
     ページ側は <div data-ad="<枠名>"></div> のままでよく、出し分けはここだけで変えられる。
     'article-mid' は寸法表の直後に置いている（文脈が一致する位置）。
     guide / faq は案内役のページなので、意図的に1枠だけにしてある。 */
  var SLOTS = {
    'article-mid': {
      'madori-2d.html': 'kagu350',
      'default': 'officecom'
    },
    'article-bottom': {
      'madori-2d.html': 'kagu350',
      'default': 'officecom'
    }
  };

  function pageKey(){
    try{
      var last = location.pathname.split('/').pop();
      return last || 'index.html';
    }catch(e){ return 'index.html'; }
  }

  /* 枠名 → その枠に出す広告主の定義（該当なしなら null） */
  function adForSlot(slot){
    var plan = SLOTS[slot];
    if(!plan) return null;
    var key = plan[pageKey()] || plan['default'];
    var ad = key && AD_TAGS[key];
    return (ad && ad.tag) ? {id: key, heading: ad.heading, lead: ad.lead, tag: ad.tag} : null;
  }

  /* 広告を出すときだけ privacy.html に差し込む説明文。
     タグが空のあいだは「広告は出していない」が事実なので、何も表示しない。 */
  var AD_DISCLOSURE =
    '<p>本サイトの一部のページには、アフィリエイトプログラム（A8.net／株式会社ファンコミュニケーションズ）による'
    + '広告を掲載しています。広告の表示や広告経由での遷移にあたり、広告配信事業者がCookie等を用いて'
    + '閲覧情報を取得する場合があります。取得される情報の範囲と利用目的は、各広告配信事業者の'
    + 'プライバシーポリシーに従います。<strong>読み込んだ図面やレイアウトの内容が広告配信事業者へ'
    + '送信されることはありません。</strong>また、MiseFits Pro のライセンスを認証済みの端末では、'
    + '広告は表示されません。</p>';

  /* Proを持っている人には出さない。
     - iOSアプリ内は window.MiseFitsNative.pro
     - Webは pro-unlock.html / アプリ本体でキー認証したときの localStorage キー
     どちらも index.html の isPro() と同じ判定に揃えてある。 */
  function isProUser(){
    try{ if(window.MiseFitsNative && window.MiseFitsNative.pro) return true; }catch(e){}
    try{ if(localStorage.getItem('misefitsWebLicense')) return true; }catch(e){}
    return false;
  }

  function hasAnyTag(){
    for(var k in AD_TAGS){ if(AD_TAGS[k] && AD_TAGS[k].tag) return true; }
    return false;
  }

  function injectStyle(){
    if(document.getElementById('adSlotStyle')) return;
    var s = document.createElement('style');
    s.id = 'adSlotStyle';
    s.textContent =
      /* 本文のセクションより一段はっきりさせて、広告だと見て分かるようにする。 */
      '.ad-slot{margin:26px auto 0;max-width:900px;background:#f4f9ff;'
      + 'border:1px solid #cfe4ff;border-radius:16px;padding:16px 20px 20px;}'
      + '.ad-slot__label{display:inline-block;font-size:10.5px;font-weight:900;letter-spacing:.08em;'
      + 'color:#5b6b7f;background:#fff;border:1px solid #cfe4ff;border-radius:5px;'
      + 'padding:1px 7px;margin-bottom:12px;}'
      + '.ad-slot__heading{font-size:15px;font-weight:800;line-height:1.5;color:#102033;margin:0 0 6px;}'
      + '.ad-slot__lead{font-size:13px;line-height:1.75;color:#3d4654;margin:0 0 14px;}'
      /* A8のタグはそのまま入れ、見た目だけCSSでボタンにする。 */
      + '.ad-slot__body{font-size:13px;line-height:1.7;}'
      + '.ad-slot__body a{display:inline-block;background:#0066cc;color:#fff;border:1px solid #0066cc;'
      + 'border-radius:10px;padding:11px 18px;font-size:13.5px;font-weight:800;text-decoration:none;'
      + 'line-height:1.5;max-width:100%;}'
      + '.ad-slot__body a:hover{background:#004f9f;border-color:#004f9f;}'
      + '.ad-slot__body a::after{content:" \\2192";font-weight:900;}'
      /* 計測用の1x1が余白を作らないように */
      + '.ad-slot__body img{max-width:100%;height:auto;vertical-align:middle;}'
      + '@media (max-width:720px){.ad-slot{padding:14px 15px 16px;}'
      + '.ad-slot__body a{display:block;text-align:center;}}';
    document.head.appendChild(s);
  }

  function drop(el){ if(el && el.parentNode) el.parentNode.removeChild(el); }

  function run(){
    var slots = document.querySelectorAll('[data-ad]');
    var disclosure = document.querySelector('[data-ad-disclosure]');
    var pro = isProUser();
    var live = hasAnyTag() && !pro;

    if(live) injectStyle();

    for(var i = slots.length - 1; i >= 0; i--){
      var el = slots[i];
      var ad = adForSlot(el.getAttribute('data-ad'));
      if(!live || !ad){ drop(el); continue; }
      el.className = (el.className ? el.className + ' ' : '') + 'ad-slot';

      var label = document.createElement('span');
      label.className = 'ad-slot__label';
      label.textContent = '広告';
      el.appendChild(label);

      /* heading と lead は自前の文章なので textContent で入れる（HTMLとして解釈させない）。 */
      if(ad.heading){
        var h = document.createElement('p');
        h.className = 'ad-slot__heading';
        h.textContent = ad.heading;
        el.appendChild(h);
      }
      if(ad.lead){
        var p = document.createElement('p');
        p.className = 'ad-slot__lead';
        p.textContent = ad.lead;
        el.appendChild(p);
      }

      var body = document.createElement('div');
      body.className = 'ad-slot__body';
      body.setAttribute('data-revenue', 'affiliate');
      body.setAttribute('data-revenue-id', ad.id);
      body.setAttribute('data-revenue-provider', 'a8');
      body.setAttribute('data-revenue-placement', el.getAttribute('data-ad'));
      body.innerHTML = ad.tag;
      el.appendChild(body);
    }

    if(disclosure){
      /* プライバシーポリシーの記載は「実際に広告を出しているか」に合わせる。
         Pro判定では消さない（掲載している事実は変わらないため）。 */
      if(hasAnyTag()) disclosure.innerHTML = AD_DISCLOSURE;
      else drop(disclosure);
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
