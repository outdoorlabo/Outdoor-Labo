(() => {
  'use strict';

  const MEDIA_FOLDER = 'static/wp-content/uploads';
  const PUBLIC_FOLDER = '/wp-content/uploads';
  const INCOMING_FOLDER = MEDIA_FOLDER + '/_incoming';
  const PLUGIN_NAME = 'outdoor-labo-folder-library';

  function getStore() {
    return window.CMS_STORE || window.__store || null;
  }

  function getBackend() {
    const store = getStore();
    if (!store || typeof store.getState !== 'function') return null;
    return store.getState().backend || null;
  }

  function prepareRecursiveListing(backend) {
    const api = backend && backend.api;
    if (!api || typeof api.listFiles !== 'function') {
      throw new Error('GitHub backend API is not available.');
    }
    if (api.__outdoorLaboRecursiveMedia) return;
    const original = api.listFiles.bind(api);
    api.listFiles = (path, options = {}) =>
      original(path, { ...options, depth: 100 });
    api.__outdoorLaboRecursiveMedia = true;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function isImage(file) {
    return /\.(jpe?g|png|gif|webp|avif|svg|bmp|ico)$/i.test(file.name || '');
  }

  function relativePath(path) {
    const prefix = MEDIA_FOLDER + '/';
    return path.startsWith(prefix) ? path.slice(prefix.length) : path;
  }

  function installStyles() {
    if (document.getElementById('outdoor-labo-media-style')) return;
    const style = el('style');
    style.id = 'outdoor-labo-media-style';
    style.textContent = `
      .olml-overlay{position:fixed;inset:0;z-index:100000;background:#0009;display:flex;align-items:center;justify-content:center;padding:20px}
      .olml-modal{width:min(1000px,96vw);height:min(760px,92vh);background:#fff;color:#222;border-radius:10px;display:flex;flex-direction:column;box-shadow:0 12px 50px #0005;font:14px/1.5 system-ui,sans-serif;overflow:hidden}
      .olml-head,.olml-tools,.olml-foot{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #ddd}
      .olml-head{justify-content:space-between;font-weight:700}.olml-tools{flex-wrap:wrap}.olml-tools input[type=search]{flex:1;min-width:180px;padding:8px;border:1px solid #bbb;border-radius:5px}
      .olml-body{padding:16px;overflow:auto;flex:1}.olml-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:12px}
      .olml-item{border:1px solid #ddd;border-radius:6px;padding:8px;cursor:pointer;min-width:0}.olml-item.selected{border:2px solid #2878d0;background:#eef6ff;padding:7px}
      .olml-thumb{height:105px;background:#f2f2f2;display:flex;align-items:center;justify-content:center;margin-bottom:7px;overflow:hidden;border-radius:4px;font-size:30px}
      .olml-thumb img{width:100%;height:100%;object-fit:contain}.olml-name{overflow-wrap:anywhere;font-size:12px}
      .olml-button{border:1px solid #bbb;background:#fff;border-radius:5px;padding:7px 11px;cursor:pointer}.olml-button.primary{background:#245fa8;color:#fff;border-color:#245fa8}.olml-button:disabled{opacity:.45;cursor:not-allowed}
      .olml-crumb{display:flex;gap:6px;align-items:center;flex:1;min-width:0;flex-wrap:wrap}.olml-crumb button{border:0;background:none;color:#245fa8;cursor:pointer;padding:2px}
      .olml-status{color:#666;margin-right:auto}.olml-empty,.olml-loading{padding:40px;text-align:center;color:#666}
      @media(max-width:600px){.olml-overlay{padding:5px}.olml-modal{width:100%;height:96vh}.olml-grid{grid-template-columns:repeat(auto-fill,minmax(110px,1fr))}.olml-thumb{height:80px}}
    `;
    document.head.appendChild(style);
  }

  const mediaLibrary = {
    name: PLUGIN_NAME,
    async init({ handleInsert }) {
      const backend = getBackend();
      if (!backend || typeof backend.getMedia !== 'function') {
        throw new Error('Decap CMS backend is not ready for the media library.');
      }
      prepareRecursiveListing(backend);
      installStyles();

      let files = [];
      let currentPath = '';
      let selected = new Set();
      let allowMultiple = true;
      let imagesOnly = false;
      let search = '';
      let loading = false;

      const overlay = el('div', 'olml-overlay');
      overlay.hidden = true;
      const modal = el('div', 'olml-modal');
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      async function refresh() {
        loading = true;
        render();
        try {
          files = await backend.getMedia(MEDIA_FOLDER);
        } catch (error) {
          console.error('[Outdoor Labo media library] Could not load media', error);
          files = [];
        }
        loading = false;
        render();
      }

      function currentItems() {
        const prefix = currentPath ? currentPath + '/' : '';
        let folders = new Set();
        let visibleFiles = [];
        for (const file of files) {
          const rel = relativePath(file.path);
          if (!rel.startsWith(prefix)) continue;
          const remainder = rel.slice(prefix.length);
          const slash = remainder.indexOf('/');
          if (slash >= 0) folders.add(remainder.slice(0, slash));
          else if (!imagesOnly || isImage(file)) visibleFiles.push(file);
        }
        const q = search.trim().toLowerCase();
        if (q) {
          folders = new Set([...folders].filter(name => name.toLowerCase().includes(q)));
          visibleFiles = visibleFiles.filter(file => file.name.toLowerCase().includes(q) || relativePath(file.path).toLowerCase().includes(q));
        }
        return { folders: [...folders].sort(), files: visibleFiles.sort((a,b) => a.name.localeCompare(b.name)) };
      }

      function breadcrumb() {
        const wrap = el('div', 'olml-crumb');
        const parts = currentPath ? currentPath.split('/') : [];
        const all = [{ label: 'すべての画像', path: '' }];
        parts.forEach((part, index) => all.push({ label: part, path: parts.slice(0,index+1).join('/') }));
        all.forEach((item, index) => {
          if (index) wrap.appendChild(el('span', '', '›'));
          const button = el('button', '', item.label);
          button.addEventListener('click', () => { currentPath = item.path; selected.clear(); render(); });
          wrap.appendChild(button);
        });
        return wrap;
      }

      function render() {
        modal.replaceChildren();
        const head = el('div', 'olml-head');
        head.appendChild(breadcrumb());
        const close = el('button', 'olml-button', '閉じる');
        close.addEventListener('click', () => { overlay.hidden = true; });
        head.appendChild(close);
        modal.appendChild(head);

        const tools = el('div', 'olml-tools');
        const upload = el('button', 'olml-button', '画像をアップロード');
        const input = el('input');
        input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.hidden = true;
        upload.addEventListener('click', () => input.click());
        input.addEventListener('change', async () => {
          if (!input.files || !input.files.length) return;
          const chosen = [...input.files];
          loading = true; render();
          const occupied = new Set(files.map(item => item.path));
          for (const file of chosen) {
            const dot = file.name.lastIndexOf('.');
            const stem = dot > 0 ? file.name.slice(0, dot) : file.name;
            const ext = dot > 0 ? file.name.slice(dot) : '';
            let uploadName = file.name;
            let suffix = 2;
            while (occupied.has(INCOMING_FOLDER + '/' + uploadName)) {
              uploadName = stem + '-' + suffix + ext;
              suffix += 1;
            }
            const path = INCOMING_FOLDER + '/' + uploadName;
            occupied.add(path);
            try {
              await backend.persistMedia({ file, path }, { commitMessage: 'Upload ' + uploadName + ' to Decap incoming media' });
            } catch (error) {
              console.error('[Outdoor Labo media library] Upload failed', file.name, error);
              alert(file.name + ' のアップロードに失敗しました。詳細はブラウザのコンソールを確認してください。');
            }
          }
          input.value = '';
          await refresh();
        });
        tools.append(upload, input);
        const searchBox = el('input');
        searchBox.type = 'search'; searchBox.placeholder = 'ファイル名・フォルダ名で検索'; searchBox.value = search;
        searchBox.addEventListener('input', () => { search = searchBox.value; render(); const next=modal.querySelector('input[type=search]'); if(next){next.focus();next.setSelectionRange(search.length,search.length);} });
        tools.appendChild(searchBox);
        modal.appendChild(tools);

        const body = el('div', 'olml-body');
        if (loading) body.appendChild(el('div', 'olml-loading', '画像一覧を読み込み中…'));
        else {
          const { folders, files: visibleFiles } = currentItems();
          if (!folders.length && !visibleFiles.length) body.appendChild(el('div','olml-empty','このフォルダに画像はありません。'));
          else {
            const grid = el('div','olml-grid');
            folders.forEach(name => {
              const item=el('div','olml-item');
              item.appendChild(el('div','olml-thumb','📁'));
              item.appendChild(el('div','olml-name',name+'/'));
              item.addEventListener('click',()=>{currentPath=currentPath?currentPath+'/'+name:name;selected.clear();render();});
              grid.appendChild(item);
            });
            visibleFiles.forEach(file => {
              const rel=relativePath(file.path);
              const item=el('div','olml-item'+(selected.has(file.path)?' selected':''));
              const thumb=el('div','olml-thumb');
              if(isImage(file)){
                const img=el('img'); img.alt=file.name; img.loading='lazy'; thumb.appendChild(img);
                const display=typeof file.displayURL==='string'?Promise.resolve(file.displayURL):
                  (backend.getMediaDisplayURL?backend.getMediaDisplayURL(file.displayURL):Promise.resolve(''));
                display.then(url=>{if(url)img.src=url;}).catch(()=>{});
              } else thumb.textContent='📄';
              item.appendChild(thumb);
              item.appendChild(el('div','olml-name',file.name));
              item.title=rel;
              item.addEventListener('click',()=>{
                if(!allowMultiple) selected.clear();
                if(selected.has(file.path)) selected.delete(file.path); else selected.add(file.path);
                render();
              });
              item.addEventListener('dblclick',()=>{selected.clear();selected.add(file.path);insertSelected();});
              grid.appendChild(item);
            });
            body.appendChild(grid);
          }
        }
        modal.appendChild(body);

        const foot=el('div','olml-foot');
        foot.appendChild(el('span','olml-status',files.length+' 件のファイル / '+selected.size+' 件選択'));
        const cancel=el('button','olml-button','キャンセル'); cancel.addEventListener('click',()=>{overlay.hidden=true;});
        const insert=el('button','olml-button primary','選択した画像を挿入'); insert.disabled=!selected.size; insert.addEventListener('click',insertSelected);
        foot.append(cancel,insert); modal.appendChild(foot);
      }

      function insertSelected() {
        const urls=[...selected].map(path=>PUBLIC_FOLDER+'/'+relativePath(path));
        if(urls.length) handleInsert(allowMultiple && urls.length>1 ? urls : urls[0]);
        overlay.hidden=true;
      }

      function show(options={}) {
        allowMultiple=options.allowMultiple!==false;
        imagesOnly=options.imagesOnly!==false;
        currentPath=''; selected.clear(); search='';
        overlay.hidden=false;
        refresh();
      }

      return {
        show,
        hide: () => { overlay.hidden=true; },
        onClearControl: () => {},
        onRemoveControl: () => {},
        enableStandalone: () => true
      };
    }
  };

  if (window.CMS && typeof window.CMS.registerMediaLibrary === 'function') {
    window.CMS.registerMediaLibrary(mediaLibrary);
  } else {
    console.error('[Outdoor Labo media library] CMS.registerMediaLibrary is unavailable.');
  }
})();