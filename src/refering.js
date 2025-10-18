/* refering.js — #isCapturing → transForm.js 連携（完全統合版）
   - #isCapturing の HTML→Markdown（見出し/段落/改行維持）
   - <img> を dataURL 化（fetch→blob→dataURL → 失敗時 crossOrigin+canvas）＋ギャラリー投入
   - 最終保険：#isCapturing を html2canvas で1枚スナップしてギャラリーへ
   - /report/summary をモックして Markdown を返す（バックエンド不要）
   - window.__SC_INLINE_IMAGES__ / window.__SC_SUMMARY_HTML__ を transForm.js 側へ提供
*/

/* --- フォルダ参照: ブラウザ単体テスト用モック（Electron なし） --- */
if (!window.api) {
  window.api = {
    selectFolder: async () => {
      const p = prompt('モック: 保存先フォルダのパスを入力', 'C:\\path\\to\\folder');
      return p || null;
    }
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const browseFolderBtn = document.getElementById('browseFolderBtn');
  const savePathInput   = document.getElementById('savePathInput');
  if (browseFolderBtn && savePathInput) {
    browseFolderBtn.addEventListener('click', async () => {
      try {
        const folderPath = await window.api.selectFolder();
        if (folderPath) savePathInput.value = folderPath;
      } catch (e) { console.error(e); }
    });
  }
});

(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);

  async function loadScript(src) {
    if (document.querySelector(`script[data-dynamic="${src}"]`)) return;
    await new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = src; el.async = true; el.defer = true;
      el.dataset.dynamic = src;
      el.onload = res; el.onerror = () => rej(new Error('load fail: '+src));
      document.head.appendChild(el);
    });
  }

  const blobToDataURL = (blob) => new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(blob);
  }); // FileReader の result は data:URL を返す。:contentReference[oaicite:1]{index=1}

  function ensureGallery() {
    let g = $('#screenshotGallery');
    if (g) return g;
    g = document.createElement('div');
    g.id = 'screenshotGallery';
    g.style.display = 'none';
    document.body.appendChild(g);
    return g;
  }

  function addLog(msg) {
    const box = $('#activityLog'); if (!box) return;
    const row = document.createElement('div');
    row.className = 'activity-item';
    row.innerHTML = `<span class="activity-time">${new Date().toLocaleTimeString()}</span>
                     <span class="activity-message">${msg}</span>`;
    box.prepend(row);
  }

  // --- HTML → Markdown（見出し/段落/改行維持）
  function htmlToMarkdown(root) {
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.replace(/\s+/g, ' ');
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName.toLowerCase();
      const content = Array.from(node.childNodes).map(walk).join('');
      switch (tag) {
        case 'h1': return `# ${content}\n\n`;
        case 'h2': return `## ${content}\n\n`;
        case 'h3': return `### ${content}\n\n`;
        case 'p' : return `${content}\n\n`;
        case 'br': return `\n`;
        case 'strong':
        case 'b' : return `**${content}**`;
        case 'em':
        case 'i' : return `*${content}*`;
        case 'ul': return `${Array.from(node.children).map(li=>`- ${walk(li)}\n`).join('')}\n`;
        case 'ol': return `${Array.from(node.children).map((li,i)=>`${i+1}. ${walk(li)}\n`).join('')}\n`;
        case 'li': return `${content}`;
        case 'a' : {
          const href = node.getAttribute('href') || '';
          return href ? `[${content}](${href})` : content;
        }
        case 'img':
          queueImage(node.getAttribute('src')||'', node.getAttribute('alt')||'inline');
          return '';
        default: return content;
      }
    };
    return walk(root).replace(/\n{3,}/g, '\n\n').trim();
  }

  // --- 画像の dataURL キュー
  const pendingImgs = new Map(); // src -> Promise<{dataURL, alt, w, h}>
  function queueImage(src, alt='inline') {
    if (!src || pendingImgs.has(src)) return;
    pendingImgs.set(src, convertToDataURL(src).then(({dataURL,w,h}) => ({dataURL, alt, w, h})));
  }

  // fetch→blob→dataURL → 失敗時 crossOrigin+canvas（CORS 回避）
  async function convertToDataURL(src) {
    if (src.startsWith('data:')) {
      // サイズ不明だが後段で <img> に読み込んで naturalWidth を拾う
      return { dataURL: src, w: 0, h: 0 };
    }
    // 1) fetch 経由
    try {
      const r = await fetch(src, { mode: 'cors' });
      if (r.ok) {
        const b = await r.blob();
        const dataURL = await blobToDataURL(b);
        // 幅高は別読み込みで取得
        const size = await readNaturalSize(dataURL);
        return { dataURL, ...size };
      }
    } catch {}

    // 2) crossOrigin=anonymous + canvas
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      const dataURL = c.toDataURL('image/png');
      return { dataURL, w: img.naturalWidth, h: img.naturalHeight };
    } catch {
      // 最終的にそのまま返す（PDF側はフォールバックで担保）
      return { dataURL: src, w: 0, h: 0 };
    }
  }

  const readNaturalSize = (dataURL) => new Promise((res) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.src = dataURL;
  });

  async function flushImagesToGallery() {
    const g = ensureGallery();
    const collected = [];
    for (const [, p] of pendingImgs.entries()) {
      try {
        const { dataURL, alt, w, h } = await p;
        // 重複回避
        const dup = [...g.querySelectorAll('img')].some(i => (i.currentSrc||i.src) === dataURL);
        if (!dup) {
          const wrap = document.createElement('div'); wrap.className = 'thumb';
          const img = new Image(); img.alt = alt; img.src = dataURL;
          wrap.appendChild(img); g.appendChild(wrap);
        }
        collected.push({ dataURL, alt, width: w, height: h });
      } catch {}
    }
    // transForm.js へ直接も渡す（ギャラリーが空でも拾えるように）
    window.__SC_INLINE_IMAGES__ = collected;
    pendingImgs.clear();
  }

  // 最終保険：#isCapturing を 1枚にスナップ
  async function snapshotIsCapturing() {
    const root = $('#isCapturing'); if (!root) return;
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      const canvas = await window.html2canvas(root, { useCORS: true, scale: 2, backgroundColor: '#ffffff' });
      const dataURL = canvas.toDataURL('image/png');
      queueImage(dataURL, 'snapshot');
      await flushImagesToGallery();
    } catch {}
  }

  // #isCapturing → Markdown/画像
  async function buildFromIsCapturing() {
    const el = $('#isCapturing');
    if (!el) return { markdown: '', imageCount: 0 };
    window.__SC_SUMMARY_HTML__ = el.innerHTML; // フォールバックPDFで使う

    // <img> をキュー
    el.querySelectorAll('img').forEach(img => queueImage(img.currentSrc || img.src, img.alt || 'inline'));

    const md = htmlToMarkdown(el.cloneNode(true));
    await flushImagesToGallery();
    await snapshotIsCapturing();
    return { markdown: md, imageCount: el.querySelectorAll('img').length };
  }

  // /report/summary を置き換え（transForm.js がここを叩く）
  (function interceptSummaryFetch() {
    const orig = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url);
      if (url && url.includes('/report/summary')) {
        const { markdown } = await buildFromIsCapturing();
        return new Response(JSON.stringify({ summary: markdown || '' }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        });
      }
      return orig(input, init);
    };
  })();

  // 生成ボタン時も同期しておく
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('#generateReportBtn');
    if (btn) buildFromIsCapturing();
  });

  // 動的変更に追従（MutationObserver）
  const target = $('#isCapturing');
  if (target && 'MutationObserver' in window) {
    const mo = new MutationObserver(() => { buildFromIsCapturing(); });
    mo.observe(target, { childList: true, subtree: true, attributes: true, characterData: true });
  }

  addLog('refering.js を初期化（要約/画像/スナップ連携）');
})();