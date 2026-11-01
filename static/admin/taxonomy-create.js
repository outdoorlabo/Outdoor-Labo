// OUTDOOR LABO — 記事編集中にタグ／カテゴリーを新規作成する拡張（taxonomy-create.js）
// 記事の編集画面（#/collections/posts/new, .../entries/...）の右下に小さなパネルを出し、
// GitHub API で content/tag/<slug>/_index.md / content/category/<slug>/_index.md を
// Decap が編集中のブランチへ直接作る。作成後は欄で検索して選べる（内部データの都合で
// 出てこない場合は記事を開き直す）。認証トークンは Decap のログイン情報から借りる。
(function () {
  'use strict';

  var SLUG_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
  var cachedSettings = null;

  function getToken() {
    var keys = ['decap-cms-user', 'netlify-cms-user'];
    var stores = [window.localStorage, window.sessionStorage];
    for (var s = 0; s < stores.length; s++) {
      if (!stores[s]) continue;
      for (var k = 0; k < keys.length; k++) {
        try {
          var raw = stores[s].getItem(keys[k]);
          if (!raw) continue;
          var user = JSON.parse(raw);
          if (user && user.token) return user.token;
        } catch (e) { /* try next */ }
      }
    }
    return null;
  }

  function loadSettings() {
    if (cachedSettings) return Promise.resolve(cachedSettings);
    return fetch('config.yml', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('config.yml を読めませんでした');
        return res.text();
      })
      .then(function (text) {
        var repoMatch = text.match(/^\s*repo:\s*(\S+)\s*$/m);
        var branchMatch = text.match(/^\s*branch:\s*(\S+)\s*$/m);
        if (!repoMatch) throw new Error('config.yml に repo が見つかりません');
        cachedSettings = {
          repo: repoMatch[1],
          branch: branchMatch ? branchMatch[1] : 'main'
        };
        return cachedSettings;
      });
  }

  function api(settings, token, path, options) {
    var url = 'https://api.github.com/repos/' + settings.repo + '/contents/' +
      path.split('/').map(encodeURIComponent).join('/');
    var opts = options || {};
    opts.headers = {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
    if (opts.method === 'PUT' || opts.method === 'GET') {
      url += (url.indexOf('?') >= 0 ? '&' : '?') + 'ref=' + encodeURIComponent(settings.branch);
      if (opts.method === 'PUT') url = url.split('?')[0]; // PUT はクエリではなく body の branch で指定
    }
    return fetch(url, opts);
  }

  function b64utf8(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  function yamlQuoted(value) {
    return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  function decodeContent(json) {
    if (!json || !json.content) return '';
    var bin = atob(json.content.replace(/\n/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function askSlug(kindLabel) {
    var slug = window.prompt(
      kindLabel + 'の URL スラッグを入力してください。\n' +
      '英小文字・数字・ハイフン（またはアンダースコア）のみ。日本語は使えません。\n' +
      '例: camp-gear, mt_takao'
    );
    if (slug === null) return null;
    slug = slug.trim();
    if (!SLUG_RE.test(slug)) {
      window.alert('スラッグの形式が正しくありません。\n英小文字・数字・ハイフン（またはアンダースコア）のみで、区切り文字は先頭・末尾に置けません。');
      return undefined;
    }
    return slug;
  }

  function createEntry(kind) {
    var isTag = kind === 'tag';
    var kindLabel = isTag ? 'タグ' : 'カテゴリー';
    var title = window.prompt('新しい' + kindLabel + 'の表示名を入力してください。');
    if (title === null) return;
    title = title.trim();
    if (!title) { window.alert('表示名が空です。'); return; }
    var slug = askSlug(kindLabel);
    if (slug === null || slug === undefined) return;

    var parentSlug = '';
    if (!isTag) {
      var parentInput = window.prompt(
        '親カテゴリーのスラッグ（なければ空のまま OK を押してください）。\n' +
        '例: hiking-mountaineering', ''
      );
      if (parentInput === null) return;
      parentSlug = parentInput.trim();
      if (parentSlug && !SLUG_RE.test(parentSlug)) {
        window.alert('親カテゴリーのスラッグの形式が正しくありません。');
        return;
      }
    }

    Promise.all([loadSettings(), Promise.resolve(getToken())])
      .then(function (pair) {
        var settings = pair[0];
        var token = pair[1];
        if (!token) throw new Error('ログイン情報（トークン）が見つかりません。一度ログアウトして再ログインしてから試してください。');
        var dir = (isTag ? 'content/tag/' : 'content/category/') + slug;
        var path = dir + '/_index.md';

        var chain = Promise.resolve(null);
        if (parentSlug) {
          chain = api(settings, token, 'content/category/' + parentSlug + '/_index.md', { method: 'GET' })
            .then(function (res) {
              if (res.status === 404) throw new Error('親カテゴリー「' + parentSlug + '」が見つかりません。スラッグを確認してください。');
              if (!res.ok) throw new Error('親カテゴリーの確認に失敗しました（GitHub API ' + res.status + '）');
              return res.json();
            })
            .then(function (json) {
              var text = decodeContent(json);
              var bc = text.match(/^breadcrumb:\s*"([^"]*)"\s*$/m);
              var pt = text.match(/^title:\s*"([^"]*)"\s*$/m);
              var parentCrumb = bc ? bc[1] : (pt ? pt[1] : parentSlug);
              return parentCrumb;
            });
        }

        return chain.then(function (parentCrumb) {
          return api(settings, token, path, { method: 'GET' }).then(function (res) {
            if (res.status === 200) {
              window.alert('そのスラッグの' + kindLabel + 'は既にあります。\n欄をクリックして検索し、既存のものを選んでください。');
              return null;
            }
            if (res.status !== 404) throw new Error('既存チェックに失敗しました（GitHub API ' + res.status + '）');

            var lines = ['---', 'title: ' + yamlQuoted(title)];
            if (!isTag) {
              if (parentSlug) lines.push('parent: ' + yamlQuoted(parentSlug));
              var crumb = parentSlug ? parentCrumb + ' > ' + title : title;
              lines.push('breadcrumb: ' + yamlQuoted(crumb));
            }
            lines.push('---', '');
            var content = lines.join('\n');
            return api(settings, token, path, {
              method: 'PUT',
              body: JSON.stringify({
                message: kindLabel + '「' + slug + '」を作成',
                content: b64utf8(content),
                branch: settings.branch
              })
            }).then(function (putRes) {
              if (!putRes.ok) {
                return putRes.json().catch(function () { return {}; }).then(function (payload) {
                  throw new Error('作成に失敗しました（GitHub API ' + putRes.status + (payload.message ? ': ' + payload.message : '') + '）');
                });
              }
              window.alert(
                kindLabel + '「' + title + '」を作成しました。\n\n' +
                'この記事の' + kindLabel + '欄をクリックして検索すると選べます。\n' +
                '出てこない場合は、一度記事を閉じて開き直してください。'
              );
              return null;
            });
          });
        });
      })
      .catch(function (error) {
        console.error('[Outdoor Labo taxonomy-create]', error);
        window.alert(error.message || String(error));
      });
  }

  // ---- パネル表示（記事エディタのルートにいるときだけ） ----
  var panel = null;
  var dismissed = false;

  function buildPanel() {
    var box = document.createElement('div');
    box.id = 'oltc-panel';
    box.setAttribute('style',
      'position:fixed;right:16px;bottom:16px;z-index:99990;background:#fff;color:#222;' +
      'border:1px solid #ccc;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.18);' +
      'padding:10px 12px;font:13px/1.5 system-ui,sans-serif;display:flex;gap:8px;align-items:center');
    var label = document.createElement('span');
    label.textContent = '分類を足す:';
    label.setAttribute('style', 'color:#555');
    var tagBtn = document.createElement('button');
    tagBtn.type = 'button';
    tagBtn.textContent = '＋ 新規タグ';
    var catBtn = document.createElement('button');
    catBtn.type = 'button';
    catBtn.textContent = '＋ 新規カテゴリー';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.title = 'この画面では隠す';
    [tagBtn, catBtn, closeBtn].forEach(function (b) {
      b.setAttribute('style', 'border:1px solid #bbb;background:#fff;border-radius:5px;padding:6px 10px;cursor:pointer;font:inherit');
    });
    tagBtn.addEventListener('click', function () { createEntry('tag'); });
    catBtn.addEventListener('click', function () { createEntry('category'); });
    closeBtn.addEventListener('click', function () { dismissed = true; syncPanel(); });
    box.append(label, tagBtn, catBtn, closeBtn);
    return box;
  }

  function inPostEditor() {
    return /^#\/collections\/posts\/(new|entries\/)/.test(window.location.hash || '');
  }

  function syncPanel() {
    var show = inPostEditor() && !dismissed;
    if (show && !panel) {
      panel = buildPanel();
      document.body.appendChild(panel);
    }
    if (panel) panel.style.display = show ? 'flex' : 'none';
    if (!inPostEditor()) dismissed = false;
  }

  window.addEventListener('hashchange', syncPanel);
  setInterval(syncPanel, 800);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncPanel);
  } else {
    syncPanel();
  }
})();
