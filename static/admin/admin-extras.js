// OUTDOOR LABO — Decap 管理画面の拡張（admin-extras.js）
// 本文エディタに「商品リンク」挿入ボタンを追加する。
// 挿入されるのは Hugo ショートコード {{< aff ... >}} で、テーマ側
// layouts/shortcodes/aff.html が Rinker 風カードに描画する。仕様は SPEC.md §S5。
(function () {
  if (!window.CMS) return;

  function parseAttrs(text) {
    var obj = {};
    var re = /([a-z]+)="([^"]*)"/g;
    var m;
    while ((m = re.exec(text)) !== null) obj[m[1]] = m[2];
    return obj;
  }

  function buildBlock(obj) {
    var keys = ['title', 'kw', 'img', 'asin', 'rakuten', 'yahoo'];
    var parts = [];
    keys.forEach(function (k) {
      var v = (obj[k] || '').trim();
      if (v) parts.push(k + '="' + v.replace(/"/g, '') + '"');
    });
    return '{{< aff ' + parts.join(' ') + ' >}}';
  }

  CMS.registerEditorComponent({
    id: 'affiliate-card',
    label: '商品リンク',
    icon: 'link',
    fields: [
      {
        name: 'title', label: '商品名', widget: 'string', required: true,
        hint: 'カードに表示される名前です。二重引用符（"）は使えません。'
      },
      {
        name: 'kw', label: '検索キーワード（任意）', widget: 'string', required: false,
        hint: '各ストアで検索する語。空のときは商品名で検索します。例：シマノ チェーン CN-HG701'
      },
      {
        name: 'img', label: '商品画像（任意）', widget: 'image', required: false,
        hint: 'メディアライブラリから選ぶか、画像のURLを貼ります。空でもカードは表示されます。'
      },
      {
        name: 'asin', label: 'Amazon ASIN（任意）', widget: 'string', required: false,
        hint: '入れると Amazon ボタンがその商品ページへの直リンクになります。商品URLの /dp/ の後ろにある10文字です。'
      },
      {
        name: 'rakuten', label: '楽天の商品ページURL（任意）', widget: 'string', required: false,
        hint: '入れると楽天ボタンと画像のリンク先がその商品ページになります。'
      },
      {
        name: 'yahoo', label: 'Yahoo!ショッピングの商品ページURL（任意）', widget: 'string', required: false,
        hint: '入れると Yahoo ボタンがその商品ページになります。'
      }
    ],
    pattern: /{{< aff ([^>]*) >}}/,
    fromBlock: function (match) {
      return parseAttrs(match[1]);
    },
    toBlock: function (obj) {
      return buildBlock(obj);
    },
    toPreviewBlock: function (obj) {
      var label = '🛒 商品リンク：' + (obj.title || '（商品名未設定）');
      if (typeof h === 'function') {
        return h('div', {
          style: {
            border: '1px solid #d9d9d9', borderRadius: '4px',
            padding: '10px 12px', fontSize: '14px', background: '#fafafa'
          }
        }, label);
      }
      return label;
    }
  });
})();
