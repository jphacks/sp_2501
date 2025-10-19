// src/lib/refering.client.ts
// #isCapturing → ギャラリー/要約連携（外部画像は data: 化できない場合はスキップ＋全体スナップ）

export function initReferingIntegration() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if ((window as any).__SC_REF_INITED__) return;
  (window as any).__SC_REF_INITED__ = true;

  // ---- minimal mock (Electronなし) ----
  if (!(window as any).api) {
    (window as any).api = {
      selectFolder: async () => {
        const p = prompt('モック: 保存先フォルダのパスを入力', 'C:\\path\\to\\folder');
        return p || null;
      },
    };
  }

  // browseFolderBtn 連携（存在すれば）
  const browseFolderBtn = document.getElementById('browseFolderBtn');
  const savePathInput = document.getElementById('savePathInput') as HTMLInputElement | null;
  if (browseFolderBtn && savePathInput) {
    browseFolderBtn.addEventListener('click', async () => {
      try {
        const folderPath = await (window as any).api.selectFolder();
        if (folderPath) savePathInput.value = folderPath;
      } catch (e) {
        console.error(e);
      }
    });
  }

  // ---------- utils ----------
  const $ = (s: string) => document.querySelector(s) as HTMLElement | null;

  async function loadScript(src: string) {
    if (document.querySelector(`script[data-dynamic="${src}"]`)) return;
    await new Promise<void>((res, rej) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.defer = true;
      (el as any).dataset.dynamic = src;
      el.onload = () => res();
      el.onerror = () => rej(new Error('load fail: ' + src));
      document.head.appendChild(el);
    });
  }

  const blobToDataURL = (blob: Blob) =>
    new Promise<string>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.readAsDataURL(blob);
    });

  function ensureGallery() {
    let g = document.getElementById('screenshotGallery');
    if (g) return g;
    g = document.createElement('div');
    g.id = 'screenshotGallery';
    g.style.display = 'none';
    document.body.appendChild(g);
    return g;
  }

  function addLog(msg: string) {
    const box = $('#activityLog');
    if (!box) return;
    const row = document.createElement('div');
    row.className = 'activity-item';
    row.innerHTML = `<span class="activity-time">${new Date().toLocaleTimeString()}</span>
                     <span class="activity-message">${msg}</span>`;
    box.prepend(row);
  }

  // --- HTML→Markdown（見出し/段落/改行維持）
  function htmlToMarkdown(root: Node): string {
    const walk = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue || '').replace(/\s+/g, ' ');
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const content = Array.from(el.childNodes).map(walk).join('');
      switch (tag) {
        case 'h1':
          return `# ${content}\n\n`;
        case 'h2':
          return `## ${content}\n\n`;
        case 'h3':
          return `### ${content}\n\n`;
        case 'p':
          return `${content}\n\n`;
        case 'br':
          return `\n`;
        case 'strong':
        case 'b':
          return `**${content}**`;
        case 'em':
        case 'i':
          return `*${content}*`;
        case 'ul':
          return `${Array.from(el.children)
            .map((li) => `- ${walk(li)}\n`)
            .join('')}\n`;
        case 'ol':
          return `${Array.from(el.children)
            .map((li, i) => `${i + 1}. ${walk(li)}\n`)
            .join('')}\n`;
        case 'li':
          return `${content}`;
        case 'a': {
          const href = el.getAttribute('href') || '';
          return href ? `[${content}](${href})` : content;
        }
        case 'img':
          queueImage(el.getAttribute('src') || '', el.getAttribute('alt') || 'inline');
          return '';
        default:
          return content;
      }
    };
    return walk(root).replace(/\n{3,}/g, '\n\n').trim();
  }

  // --- 画像キュー（src -> Promise）
  const pendingImgs = new Map<string, Promise<{ dataURL: string; alt: string; w: number; h: number }>>();
  function queueImage(src: string, alt = 'inline') {
    if (!src || pendingImgs.has(src)) return;
    pendingImgs.set(
      src,
      convertToDataURL(src).then(({ dataURL, w, h }) => ({ dataURL, alt, w, h }))
    );
  }

  // 外部画像は CORS が無いと dataURL 化できない（失敗時は「元URLのまま」扱い）
  async function convertToDataURL(src: string) {
    if (src.startsWith('data:')) {
      return { dataURL: src, w: 0, h: 0 };
    }
    // 1) fetch → blob → dataURL（CORS 許可 images のみ成功）
    try {
      const r = await fetch(src, { mode: 'cors' });
      if (r.ok) {
        const b = await r.blob();
        const dataURL = await blobToDataURL(b);
        const size = await readNaturalSize(dataURL);
        return { dataURL, ...size };
      }
    } catch {}
    // 2) crossOrigin=anonymous + canvas → CORS ヘッダが無ければ tainted で失敗する可能性あり
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      (img as any).referrerPolicy = 'no-referrer';
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = rej;
        img.src = src;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      const dataURL = c.toDataURL('image/png'); // tainted なら例外
      return { dataURL, w: img.naturalWidth, h: img.naturalHeight };
    } catch {
      // どうしても無理なら「外部URLのまま」返す（後段でフィルタ）
      return { dataURL: src, w: 0, h: 0 };
    }
  }

  const readNaturalSize = (dataURL: string) =>
    new Promise<{ w: number; h: number }>((res) => {
      const i = new Image();
      i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
      i.src = dataURL;
    });

  // ギャラリーへ反映（data: だけ投入）＋ window.__SC_INLINE_IMAGES__ にも渡す
  async function flushImagesToGallery() {
    const g = ensureGallery();
    const collected: Array<{ dataURL: string; alt: string; width: number; height: number }> = [];
    for (const p of Array.from(pendingImgs.values())) {
      try {
        const { dataURL, alt, w, h } = await p;
        if (!dataURL.startsWith('data:')) {
          // 外部URLは後段で使わない（PDF/DOCX で失敗するため）
          continue;
        }
        const dup = Array.from(g.querySelectorAll('img')).some(
          (i) => ((i as HTMLImageElement).currentSrc || (i as HTMLImageElement).src) === dataURL
        );
        if (!dup) {
          const wrap = document.createElement('div');
          wrap.className = 'thumb';
          const img = new Image();
          img.alt = alt;
          img.src = dataURL;
          wrap.appendChild(img);
          g.appendChild(wrap);
        }
        collected.push({ dataURL, alt, width: w, height: h });
      } catch {}
    }
    (window as any).__SC_INLINE_IMAGES__ = collected;
    pendingImgs.clear();
  }

  // #isCapturing を 1枚スナップ（保険）。CORS 画像でも画面見た目を 1 枚にできる（proxy を使えば精度向上）。:contentReference[oaicite:3]{index=3}
  async function snapshotIsCapturing() {
    const root = $('#isCapturing');
    if (!root) return;
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      const canvas = await (window as any).html2canvas(root, {
        useCORS: true, // サーバ側が CORS 対応なら外部画像も反映
        backgroundColor: '#ffffff',
        scale: 2,
        // proxy: '/api/html2canvas-proxy' // もし用意できるなら有効化。:contentReference[oaicite:4]{index=4}
      });
      const dataURL = canvas.toDataURL('image/png');
      queueImage(dataURL, 'snapshot');
      await flushImagesToGallery();
    } catch (e) {
      console.warn('snapshot failed', e);
    }
  }

  async function buildFromIsCapturing() {
    const el = $('#isCapturing');
    if (!el) return { markdown: '', imageCount: 0 };
    (window as any).__SC_SUMMARY_HTML__ = el.innerHTML;

    // #isCapturing 内の <img> をキュー（data: 化できた分だけギャラリーへ）
    el.querySelectorAll('img').forEach((img) =>
      queueImage((img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src, (img as HTMLImageElement).alt || 'inline')
    );

    await flushImagesToGallery();
    // 何も data: が取れない場合でも 1 枚は確保
    const g = document.getElementById('screenshotGallery');
    if (!g || g.querySelectorAll('img').length === 0) {
      await snapshotIsCapturing();
    }

    const md = htmlToMarkdown(el.cloneNode(true));
    return { markdown: md, imageCount: el.querySelectorAll('img').length };
  }

  // /report/summary をモック応答（transForm 側がここを叩く）
  (function interceptSummaryFetch() {
    const orig = window.fetch.bind(window);
    window.fetch = async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input && input.url;
      if (url && url.includes('/report/summary')) {
        const { markdown } = await buildFromIsCapturing();
        return new Response(JSON.stringify({ summary: markdown || '' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return orig(input, init);
    };
  })();

  // 生成ボタンクリックの都度、同期
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement | null)?.closest?.('#generateReportBtn');
    if (btn) buildFromIsCapturing();
  });

  // DOM 変化も監視
  const target = $('#isCapturing');
  if (target && 'MutationObserver' in window) {
    const mo = new MutationObserver(() => {
      buildFromIsCapturing();
    });
    mo.observe(target, { childList: true, subtree: true, attributes: true, characterData: true });
  }

  addLog('refering.client.ts 初期化完了（data: 画像＋スナップ連携）');
}
