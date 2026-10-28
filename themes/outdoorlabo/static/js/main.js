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
})();
