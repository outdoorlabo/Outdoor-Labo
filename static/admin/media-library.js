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
      .olml-overlay[hidden]{display:none}
      .olml-modal{width:min(1000px,96vw);height:min(760px,92vh);background:#fff;color:#222;border-radius:10px;display:flex;flex-direction:column;box-shadow:0 12px 50px #0005;overflow:hidden;font:14px/1.5 system-ui,sans-serif}
      .olml-head,.olml-tools,.olml-foot{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #ddd}
      .olml-head{justify-content:space-between;font-weight:700}.olml-tools{flex-wrap:wrap}.olml-tools input{flex:1;min-width:180px;padding:8px;border:1px solid #bbb;border-radius:5px}
      .olml-body{padding:16px;overflow:auto;flex:1}.olml-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:12px}
      .olml-item{border:1px solid #ddd;border-radius:6px;padding:8px;cursor:pointer;min-width:0}.olml-item.selected{border:2px solid #2878d0;background:#eef6ff;padding:7px}
      .olml-thumb{height:105px;background:#f2f2f2;display:flex;align-items:center;justify-content:center;margin-bottom:7px;overflow:hidden;border-radius:4px;font-size:30px}
      .olml-thumb img{width:100%;height:100%;object-fit:contain}.olml-name{overflow-wrap:anywhere;font-size:12px}
      .olml-button{border:1px solid #bbb;background:#fff;border-radius:5px;padding:7px 11px;cursor:pointer}.olml-button.primary{background:#245fa8;color:#fff;border-color:#245fa8}
      .olml-crumb{display:flex;gap:6px;align-items:center;flex:1;flex-wrap:wrap}.olml-crumb button{border:0;background:none;color:#245fa8;cursor:pointer;padding:2px}
      .olml-status{color:#666;margin-right:auto}.olml-empty,.olml-loading{padding:40px;text-align:center;color:#666}
      @media(max-width:600px){.olml-overlay{padding:5px}.olml-modal{width:100%;height:96vh}.olml-grid{grid-template-columns:repeat(auto-fill,minmax(110px,1fr))}.olml-thumb{height:80px}}
    `;
    document.head.appendChild(style);
  }

  const mediaLibrary = {
    name: PLUGIN_NAME,
    async init({ handleInsert, getMediaLibraryContext }) {
      const repo = 'outdoorlabo/Outdoor-Labo';
      const branch = 'test/oauth-preview-origin-allowlist';
      const apiBase = 'https://api.github.com/repos/' + repo;
      const headers = {
        Accept: 'application/vnd.github+json',
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
            .map(item => ({ path: item.path, name: item.path.split('/').pop() }))
            .sort((a,b) => a.path.localeCompare(b.path));
        } catch (error) {
          console.error('[Outdoor Labo media library]', error);
          errorMessage = '画像一覧を取得できませんでした。' + error.message;
          files = [];
        }
        loading = false;
        render();
      }

      const fileInput = element('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/jpeg,image/png,image/gif,image/webp,image/avif,image/svg+xml,image/bmp,image/x-icon';
      fileInput.hidden = true;
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (file) await uploadSelected(file);
      });

      const overlay = element('div','olml-overlay');
      overlay.hidden = true;
      const modal = element('div','olml-modal');
      overlay.appendChild(modal);
      document.body.append(fileInput, overlay);

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
        const copyButton = element('button', 'olml-button', 'Copy');
        copyButton.disabled = !selected;
        copyButton.addEventListener('click', copySelected);
        tools.appendChild(copyButton);

        const downloadButton = element('button', 'olml-button', 'Download');
        downloadButton.disabled = !selected;
        downloadButton.addEventListener('click', downloadSelected);
        tools.appendChild(downloadButton);

        const uploadButton = element('button', 'olml-button', 'Upload');
        uploadButton.addEventListener('click', () => fileInput.click());
        tools.appendChild(uploadButton);
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
        const insert=element('button','olml-button primary','この画像を選択');
        insert.disabled=!selected;
        insert.addEventListener('click',insertSelected);
        foot.append(cancel,insert);
        modal.appendChild(foot);
      }

      function insertSelected() {
        if (!selected) return;
        const path = relative(selected);
        handleInsert('/wp-content/uploads/' + path);
        overlay.hidden = true;
      }

      async function uploadSelected(file) {
        const MAX_FILE_SIZE = 20 * 1024 * 1024;
        const allowedTypes = new Set([
          'image/jpeg', 'image/png', 'image/gif', 'image/webp',
          'image/avif', 'image/svg+xml', 'image/bmp', 'image/x-icon'
        ]);

        if (!allowedTypes.has(file.type) || !IMAGE_EXT.test(file.name)) {
          alert('対応している画像形式を選択してください。');
          return;
        }
        if (file.size > MAX_FILE_SIZE) {
          alert('画像サイズは20MB以下にしてください。');
          return;
        }

        try {
          const context = await getMediaLibraryContext();
          const config = context && context.backendConfig;
          if (
            context?.backendName !== 'github' ||
            config?.repo !== repo ||
            config?.branch !== branch ||
            !context.token
          ) {
            throw new Error('GitHubの認証情報または保存先ブランチを確認できません。再ログインしてください。');
          }

          const dateParts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit'
          }).formatToParts(new Date());
          const year = dateParts.find(part => part.type === 'year').value;
          const month = dateParts.find(part => part.type === 'month').value;

          const safeName = file.name
            .replace(/[\\/\\:\\*?"<>|\\x00-\\x1F]/g, '-')
            .replace(/^\\.+/, '')
            .trim();
          if (!safeName) throw new Error('ファイル名を使用できません。');

          const reader = new FileReader();
          const dataUrl = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('画像ファイルを読み込めませんでした。'));
            reader.readAsDataURL(file);
          });
          const base64 = String(dataUrl).split(',')[1];
          if (!base64) throw new Error('画像データを読み込めませんでした。');

          const headers = {
            ...Object.fromEntries(Object.entries({
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              Authorization: 'Bearer ' + context.token
            }))
          };

          let filename = safeName;
          let attempt = 1;
          while (attempt <= 100) {
            const path = MEDIA_ROOT + '/' + year + '/' + month + '/' + filename;
            const response = await fetch(apiBase + '/contents/' + path.split('/').map(encodeURIComponent).join('/'), {
              method: 'PUT',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: 'Upload media: ' + filename,
                content: base64,
                branch
              })
            });

            if (response.ok) {
              selected = path;
              currentPath = year + '/' + month;
              search = '';
              await loadFiles();
              alert('画像をアップロードしました。');
              return;
            }

            const detail = await response.json().catch(() => ({}));
            if (response.status === 422 && /already exists|sha/i.test(detail.message || '')) {
              attempt += 1;
              const dot = safeName.lastIndexOf('.');
              filename = dot > 0
                ? safeName.slice(0, dot) + '-' + attempt + safeName.slice(dot)
                : safeName + '-' + attempt;
              continue;
            }
            throw new Error(detail.message || 'GitHub API returned ' + response.status);
          }
          throw new Error('同名ファイルが多すぎるため保存できませんでした。');
        } catch (error) {
          console.error('[Outdoor Labo media upload]', error);
          alert('アップロードに失敗しました。\\n' + error.message);
        }
      }

      async function copySelected() {
        if (!selected) return;

        const url = window.location.origin + '/wp-content/uploads/' + relative(selected);

        try {
          await navigator.clipboard.writeText(url);
          alert('Image URL copied.');
        } catch (error) {
          alert('Copy failed.');
          console.error(error);
        }
      }

      async function downloadSelected() {
        if (!selected) return;

        const url = window.location.origin + '/wp-content/uploads/' + relative(selected);
        const filename = selected.split('/').pop();

        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error('Download failed');

          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');

          link.href = objectUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();

          setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        } catch (error) {
          alert('Download failed.');
          console.error(error);
        }
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