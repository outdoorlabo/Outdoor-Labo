// OUTDOOR LABO — Decap 管理画面の拡張（admin-extras.js）
// 1) プレビュー画面に実サイトの本文デザインを当てる（registerPreviewStyle）
// 2) 本文エディタに挿入ボタンを追加する：
//    - 商品リンク（Hugo ショートコード aff、Rinker 風カード。仕様は SPEC.md §S5）
//    - ブログカード（テーマ内蔵ショートコード blogcard）
//    - YouTube（Hugo 内蔵ショートコード youtube）
(function () {
  if (!window.CMS) return;

  CMS.registerPreviewStyle('/admin/preview.css');

  function parseAttrs(text) {
    var obj = {};
    var re = /([a-z]+)="([^"]*)"/g;
    var m;
    while ((m = re.exec(text)) !== null) obj[m[1]] = m[2];
    return obj;
  }

  function buildAttrs(obj, keys) {
    var parts = [];
    keys.forEach(function (k) {
      var v = (obj[k] || '').trim();
      if (v) parts.push(k + '="' + v.replace(/"/g, '') + '"');
    });
    return parts.join(' ');
  }

  function previewBox(label) {
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

  // ---- 商品リンク（アフィリエイト） ----
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
      return '{{< aff ' + buildAttrs(obj, ['title', 'kw', 'img', 'asin', 'rakuten', 'yahoo']) + ' >}}';
    },
    toPreviewBlock: function (obj) {
      return previewBox('🛒 商品リンク：' + (obj.title || '（商品名未設定）'));
    }
  });

  // ---- ブログカード ----
  CMS.registerEditorComponent({
    id: 'blog-card',
    label: 'ブログカード',
    icon: 'link',
    fields: [
      {
        name: 'url', label: 'リンク先URL', widget: 'string', required: true,
        hint: '紹介したいページのURL。'
      },
      {
        name: 'title', label: 'タイトル（任意）', widget: 'string', required: false,
        hint: '空のときはURLがそのまま表示されます。'
      },
      {
        name: 'desc', label: '説明文（任意）', widget: 'string', required: false
      },
      {
        name: 'image', label: 'サムネイル画像（任意）', widget: 'image', required: false
      }
    ],
    pattern: /{{< blogcard ([^>]*) >}}/,
    fromBlock: function (match) {
      return parseAttrs(match[1]);
    },
    toBlock: function (obj) {
      return '{{< blogcard ' + buildAttrs(obj, ['url', 'title', 'desc', 'image']) + ' >}}';
    },
    toPreviewBlock: function (obj) {
      return previewBox('🔗 ブログカード：' + (obj.title || obj.url || ''));
    }
  });

  // ---- YouTube ----
  function youtubeId(v) {
    v = (v || '').trim();
    var m = v.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/);
    if (m) return m[1];
    return v;
  }

  CMS.registerEditorComponent({
    id: 'youtube-embed',
    label: 'YouTube',
    icon: 'link',
    fields: [
      {
        name: 'id', label: '動画IDまたはURL', widget: 'string', required: true,
        hint: '動画ページのURLをそのまま貼っても大丈夫です。'
      }
    ],
    pattern: /{{< youtube "?([\w-]+)"? >}}/,
    fromBlock: function (match) {
      return { id: match[1] };
    },
    toBlock: function (obj) {
      return '{{< youtube "' + youtubeId(obj.id) + '" >}}';
    },
    toPreviewBlock: function (obj) {
      var id = youtubeId(obj.id);
      if (typeof h === 'function' && id) {
        return h('img', {
          src: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
          style: { maxWidth: '320px', display: 'block' }
        });
      }
      return previewBox('▶ YouTube：' + id);
    }
  });

  // ---- M4: 記事プレビューを実レイアウトに寄せる ----
  function fmtDate(v) {
    if (!v) return '';
    var s = String(v).slice(0, 10);
    return s.replace(/-/g, '.');
  }
  function PostPreview(props) {
    var entry = props.entry;
    var title = entry.getIn(['data', 'title']) || '';
    var date = entry.getIn(['data', 'date']);
    var lastmod = entry.getIn(['data', 'lastmod']);
    var image = entry.getIn(['data', 'image']);
    var imageAlt = entry.getIn(['data', 'imageAlt']) || '';
    var tags = entry.getIn(['data', 'tag']);
    var imgUrl = null;
    if (image && typeof props.getAsset === 'function') {
      try { imgUrl = props.getAsset(image).toString(); } catch (e) { imgUrl = null; }
    }
    var children = [];
    children.push(h('h1', { className: 'article-title', key: 't' }, title));
    if (imgUrl) {
      children.push(h('figure', { className: 'eyecatch', key: 'e' },
        h('img', { src: imgUrl, alt: imageAlt })));
    }
    var dateLine = '投稿日 : ' + fmtDate(date);
    children.push(h('div', { className: 'article-date', key: 'd' },
      dateLine + (lastmod && String(lastmod).slice(0, 10) !== String(date || '').slice(0, 10)
        ? '　更新日 : ' + fmtDate(lastmod) : '')));
    children.push(h('div', { className: 'entry-content', key: 'b' }, props.widgetFor('body')));
    if (tags && tags.size) {
      children.push(h('div', { className: 'article-tags', key: 'tags' },
        tags.toJS().map(function (t, i) {
          return h('a', { key: i, href: '#' }, String(t));
        })));
    }
    return h('article', { className: 'article' }, children);
  }
  CMS.registerPreviewTemplate('posts', PostPreview);

  // ---- M3(b): alt を書ける画像コンポーネント（通常の Markdown 画像と相互変換） ----
  CMS.registerEditorComponent({
    id: 'image-with-alt',
    label: '画像（alt付き）',
    icon: 'image',
    fields: [
      { name: 'src', label: '画像', widget: 'image', required: true },
      {
        name: 'alt', label: '代替テキスト（alt）', widget: 'string', required: false,
        hint: '画像が見えないときに表示される説明文。内容を短く表す言葉を入れると SEO とアクセシビリティに効きます。'
      }
    ],
    pattern: /^!\[([^\]]*)\]\((\S+)\)$/,
    fromBlock: function (match) {
      return { alt: match[1], src: match[2] };
    },
    toBlock: function (obj) {
      return '![' + (obj.alt || '') + '](' + (obj.src || '') + ')';
    },
    toPreviewBlock: function (obj) {
      if (typeof h === 'function' && obj.src) {
        return h('img', { src: obj.src, alt: obj.alt || '', style: { maxWidth: '100%' } });
      }
      return previewBox('🖼 画像：' + (obj.alt || obj.src || ''));
    }
  });
})();
