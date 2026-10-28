(function () {
  // モバイルのメニュー開閉
  var btn = document.querySelector('.nav-toggle');
  var menu = document.getElementById('global-menu');
  if (btn && menu) {
    btn.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.querySelectorAll('li.has-children > a').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (window.innerWidth > 900) return;
        var li = a.parentElement;
        if (!li.classList.contains('expanded')) { e.preventDefault(); li.classList.add('expanded'); }
      });
    });
  }
  // カテゴリー・アーカイブのプルダウン
  document.querySelectorAll('select[data-nav]').forEach(function (s) {
    s.addEventListener('change', function () { if (s.value) location.href = s.value; });
  });
  // トップへ戻るボタン
  var top = document.querySelector('.go-top');
  if (top) {
    var toggle = function () { top.hidden = window.scrollY < 300; };
    window.addEventListener('scroll', toggle, { passive: true });
    toggle();
    top.addEventListener('click', function (e) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }
  // Instagram フィード (Behold の JSON フィードを読み込む)
  var grid = document.querySelector('.ig-grid[data-feed]');
  if (grid && window.fetch) {
    fetch(grid.dataset.feed)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        (d.posts || []).slice(0, 12).forEach(function (p) {
          var u = (p.sizes && p.sizes.small && p.sizes.small.mediaUrl) || p.thumbnailUrl || p.mediaUrl;
          if (!u || !p.permalink) return;
          var a = document.createElement('a');
          a.href = p.permalink; a.target = '_blank'; a.rel = 'noopener';
          var i = document.createElement('img');
          i.src = u; i.alt = ''; i.loading = 'lazy';
          a.appendChild(i); grid.appendChild(a);
        });
      })
      .catch(function () { /* 失敗時は何も出さない(フォローボタンは残る) */ });
  }
  // お問い合わせフォーム (Web3Forms)
  var form = document.getElementById('contact-form');
  if (form && window.fetch) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var st = form.querySelector('.form-status');
      var btn = form.querySelector('button[type=submit]');
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      btn.disabled = true; st.className = 'form-status'; st.textContent = '送信中…';
      fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.success) throw new Error(j.message || 'error');
          st.className = 'form-status ok';
          st.textContent = '送信しました。ありがとうございます。内容を確認のうえ、ご連絡します。';
          form.reset();
        })
        .catch(function () {
          st.className = 'form-status ng';
          st.textContent = '送信できませんでした。時間をおいて、もう一度お試しください。';
        })
        .then(function () { btn.disabled = false; });
    });
  }
})();
