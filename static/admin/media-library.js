(() => {
  'use strict';

  const PLUGIN_NAME = 'outdoor-labo-folder-library';
  const MEDIA_ROOT = 'static/wp-content/uploads';
  const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp|ico)$/i;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function addStyles() {
    if (document.getElementById('olml-style')) return;
    const style = element('style');
    style.id = 'olml-style';
    style.textContent = `
      .olml-overlay{position:fixed;inset:0;z-index:100000;background:#0009;display:flex;align-items:center;justify-content:center;padding:18px}
      .olml-modal{width:min(1000px,96vw);height:min(760px,92vh);background:#fff;color:#222;border-radius:10px;display:flex;flex-direction:column;box-shadow:0 12px 50px #0005;overflow:hidden;font:14px/1.5 system-ui,sans-serif}
      .olml-head,.olml-tools,.olml-foot{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #ddd}
      .olml-head{justify-content:space-between;font-weight:700}.olml-tools{flex-wrap:wrap}.olml-tools input{flex:1;min-width:180px;padding:8px;border:1px solid #bbb;border-radius:5px}
      .olml-body{padding:16px;overflow:auto;flex:1}.olml-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:12px}
      .olml-item{border:1px solid #ddd;border-radius:6px;padding:8px;cursor:pointer;min-width:0}.olml-item.selected{border:2px solid #2878d0;background:#eef6ff;padding:7px}
      .olml-thumb{height:105px;background:#f2f2f2;display:flex;align-items:center;justify-content:center;margin-bottom:7px;overflow:hidden;border-radius:4px;font-size:30px}
      .olml-thumb img{width:100%;height:100%;object-fit:contain}.olml-name{overflow-wrap:anywhere;font-size:12px}
      .olml-button{border:1px solid #bbb;background:#fff;border-radius:5px;padding:7px 11px;cursor:pointer}.olml-button.primary{background:#245fa8;color:#fff;border-color:#245fa8}.olml-button.danger{color:#a12622;border-color:#d7a5a2}
      .olml-crumb{display:flex;gap:6px;align-items:center;flex:1;flex-wrap:wrap}.olml-crumb button{border:0;background:none;color:#245fa8;cursor:pointer;padding:2px}
      .olml-status{color:#666;margin-right:auto}.olml-empty,.olml-loading{padding:40px;text-align:center;color:#666}
      @media(max-width:600px){.olml-overlay{padding:5px}.olml-modal{width:100%;height:96vh}.olml-grid{grid-template-columns:repeat(auto-fill,minmax(110px,1fr))}.olml-thumb{height:80px}}
    `;
    document.head.appendChild(style);
  }

  const mediaLibrary = {
    name: PLUGIN_NAME,
    async init({ handleInsert, getMediaLibraryContext }) {
      if (typeof getMediaLibraryContext !== 'function') {
        throw new Error('Decap CMS media library context is unavailable.');
      }
      const context = await getMediaLibraryContext();
      const backend = context.backendConfig || {};
      const token = context.token;
      const repo = backend.repo;
      const branch = backend.branch || 'main';
      if (!token || !repo || !/^[-a-zA-Z0-9_.]+\/[-a-zA-Z0-9_.]+$/.test(repo)) {
        throw new Error('GitHub repository or OAuth token is unavailable to the media library.');
      }
      const apiBase = 'https://api.github.com/repos/' + repo;
      const headers = {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28'
      };

      let files = [];
      let currentPath = '';
      let selected = null;
      let loading = false;
      let errorMessage = '';
      let search = '';

      async function loadFiles() {
        loading = true;
        errorMessage = '';
        render();
        try {
          const response = await fetch(apiBase + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1', { headers });
          if (!response.ok) throw new Error('GitHub API returned ' + response.status);
          const result = await response.json();
          if (result.truncated) throw new Error('GitHub returned an incomplete file tree.');
          const prefix = MEDIA_ROOT + '/';
          files = (result.tree || [])
            .filter(item => item.type === 'blob' && item.path.startsWith(prefix) && IMAGE_EXT.test(item.path))
            .map(item => ({ path: item.path, name: item.path.split('/').pop(), sha: item.sha }))
            .sort((a,b) => a.path.localeCompare(b.path));
        } catch (error) {
          console.error('[Outdoor Labo media library]', error);
          errorMessage = '画像一覧を取得できませんでした。' + error.message;
          files = [];
        }
        loading = false;
        render();
      }

      const overlay = element('div','olml-overlay');
      overlay.hidden = true;
      const modal = element('div','olml-modal');
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      function relative(path) {
        return path.startsWith(MEDIA_ROOT + '/') ? path.slice(MEDIA_ROOT.length + 1) : path;
      }

      function visibleItems() {
        const prefix = currentPath ? currentPath + '/' : '';
        const folders = new Set();
        const visibleFiles = [];
        for (const file of files) {
          const rel = relative(file.path);
          if (!rel.startsWith(prefix)) continue;
          const rest = rel.slice(prefix.length);
          const slash = rest.indexOf('/');
          if (slash >= 0) folders.add(rest.slice(0, slash));
          else visibleFiles.push(file);
        }
        const q = search.trim().toLowerCase();
        return {
          folders: [...folders].filter(v => !q || v.toLowerCase().includes(q)).sort(),
          files: visibleFiles.filter(v => !q || v.name.toLowerCase().includes(q) || relative(v.path).toLowerCase().includes(q))
        };
      }

      function breadcrumb() {
        const wrap = element('div','olml-crumb');
        const parts = currentPath ? currentPath.split('/') : [];
        const items = [{label:'すべての画像',path:''}];
        parts.forEach((part,index)=>items.push({label:part,path:parts.slice(0,index+1).join('/')}));
        items.forEach((item,index)=>{
          if(index) wrap.appendChild(element('span','','›'));
          const button=element('button','',item.label);
          button.addEventListener('click',()=>{currentPath=item.path;selected=null;render();});
          wrap.appendChild(button);
        });
        return wrap;
      }

      function render() {
        modal.replaceChildren();
        const head=element('div','olml-head');
        head.append(breadcrumb());
        const close=element('button','olml-button','閉じる');
        close.addEventListener('click',()=>{overlay.hidden=true;});
        head.appendChild(close);
        modal.appendChild(head);

        const tools=element('div','olml-tools');
        const searchBox=element('input');
        searchBox.type='search';
        searchBox.placeholder='ファイル名・フォルダ名で検索';
        searchBox.value=search;
        searchBox.addEventListener('input',()=>{search=searchBox.value;const pos=search.length;render();const next=modal.querySelector('input[type=search]');if(next){next.focus();next.setSelectionRange(pos,pos);}});
        tools.appendChild(searchBox);
        modal.appendChild(tools);

        const body=element('div','olml-body');
        if(loading) body.appendChild(element('div','olml-loading','画像一覧を読み込み中…'));
        else if(errorMessage) body.appendChild(element('div','olml-empty',errorMessage));
        else {
          const items=visibleItems();
          if(!items.folders.length&&!items.files.length) body.appendChild(element('div','olml-empty','このフォルダに画像はありません。'));
          else {
            const grid=element('div','olml-grid');
            items.folders.forEach(name=>{
              const card=element('div','olml-item');
              card.append(element('div','olml-thumb','📁'),element('div','olml-name',name+'/'));
              card.addEventListener('click',()=>{currentPath=currentPath?currentPath+'/'+name:name;selected=null;render();});
              grid.appendChild(card);
            });
            items.files.forEach(file=>{
              const card=element('div','olml-item'+(selected===file.path?' selected':''));
              const thumb=element('div','olml-thumb');
              const img=element('img');img.alt=file.name;img.loading='lazy';
              img.src=window.location.origin + '/wp-content/uploads/' + relative(file.path);
              thumb.appendChild(img);
              card.append(thumb,element('div','olml-name',file.name));
              card.title=relative(file.path);
              card.addEventListener('click',()=>{selected=file.path;render();});
              card.addEventListener('dblclick',()=>insertSelected());
              grid.appendChild(card);
            });
            body.appendChild(grid);
          }
        }
        modal.appendChild(body);

        const foot=element('div','olml-foot');
        foot.appendChild(element('span','olml-status',files.length+' 件の画像'+(selected?' / 1 件選択':'')));
        const cancel=element('button','olml-button','キャンセル');
        cancel.addEventListener('click',()=>{overlay.hidden=true;});
        const remove=element('button','olml-button danger','選択画像を削除');
        remove.disabled=!selected || loading || branch !== 'test/decap-category-hierarchy';
        remove.addEventListener('click',deleteSelected);
        const insert=element('button','olml-button primary','この画像を選択');
        insert.disabled=!selected || loading;
        insert.addEventListener('click',insertSelected);
        foot.append(cancel,remove,insert);
        modal.appendChild(foot);
      }

      async function deleteSelected() {
        if (branch !== 'test/decap-category-hierarchy') {
          errorMessage = '安全のため、画像削除はテストブランチでのみ有効です。';
          render();
          return;
        }
        if (!selected) return;
        const file = files.find(item => item.path === selected);
        if (!file) return;
        const rel = relative(file.path);
        if (!window.confirm('この画像をテストブランチから削除します。\\n' + rel + '\\n\\n記事本文から参照されている場合、画像が表示されなくなります。続けますか？')) return;

        loading = true;
        errorMessage = '';
        render();
        try {
          const apiPath = file.path.split('/').map(encodeURIComponent).join('/');
          const response = await fetch(apiBase + '/contents/' + apiPath, {
            method: 'DELETE',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: 'Delete media: ' + rel,
              sha: file.sha,
              branch
            })
          });
          if (!response.ok) {
            let detail = '';
            try {
              const payload = await response.json();
              detail = payload.message || '';
            } catch (_) {}
            throw new Error('GitHub API ' + response.status + (detail ? ': ' + detail : ''));
          }
          files = files.filter(item => item.path !== file.path);
          selected = null;
        } catch (error) {
          console.error('[Outdoor Labo media library] delete failed', error);
          errorMessage = '画像を削除できませんでした。' + error.message;
        }
        loading = false;
        render();
      }

      function insertSelected() {
        if (!selected) return;
        const path=relative(selected);
        handleInsert('/wp-content/uploads/' + path);
        overlay.hidden=true;
      }

      function show() {
        currentPath='';
        selected=null;
        search='';
        overlay.hidden=false;
        if (!files.length) loadFiles();
        else render();
      }

      addStyles();
      return {
        show,
        hide:()=>{overlay.hidden=true;},
        onClearControl:()=>{},
        onRemoveControl:()=>{},
        enableStandalone:()=>true
      };
    }
  };

  if (window.CMS && typeof window.CMS.registerMediaLibrary === 'function') {
    window.CMS.registerMediaLibrary(mediaLibrary);
  } else {
    console.error('[Outdoor Labo media library] CMS.registerMediaLibrary is unavailable.');
  }
})();