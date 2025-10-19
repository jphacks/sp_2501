// src/lib/transForm.client.ts
// Report generator（外部画像は自動除外）＋必要に応じてラスタ PDF にフォールバック

type Item = { alt: string; dataURL: string; timestamp?: string; width?: number; height?: number };
type Pack = {
  title: string;
  includeImages: boolean;
  includeTimestamps: boolean;
  includeSummary: boolean;
  summary: string;
  items: Item[];
};

const JP_FONT_URLS = [
  'https://ctan.math.washington.edu/tex-archive/fonts/ipaex/ipaexg.ttf',
  'https://mirror.twds.com.tw/CTAN/fonts/ipaex/ipaexg.ttf',
];
let jpFontB64Cache: string | null = null;

export function initTransFormIntegration() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if ((window as any).__SC_TRANS_INITED__) return;
  (window as any).__SC_TRANS_INITED__ = true;

  // ---------- tiny DOM helpers ----------
  const $ = (sel: string) => document.querySelector(sel) as HTMLElement | null;

  function downloadBlob(filename: string, mime: string, data: Blob | string) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = filename;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }
  async function loadScript(src: string) {
    if (document.querySelector(`script[data-dynamic="${src}"]`)) return;
    await new Promise<void>((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.defer = true;
      (s as any).dataset.dynamic = src;
      s.onload = () => res();
      s.onerror = () => rej(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }
  function arrayBufferToBase64(buf: ArrayBuffer) {
    const b = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function nowStamp() {
    const d = new Date(),
      p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  async function fetchJPFontB64() {
    if (jpFontB64Cache) return jpFontB64Cache;
    for (const u of JP_FONT_URLS) {
      try {
        const ab = await fetch(u, { mode: 'cors' }).then((r) => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.arrayBuffer();
        });
        jpFontB64Cache = arrayBufferToBase64(ab);
        return jpFontB64Cache;
      } catch {
        /* try next */
      }
    }
    return null;
  }

  // ---- collect from hidden gallery (data: だけ) or snapshot fallback ----
  async function ensureHtml2Canvas() {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  }
  async function snapshotFallback(): Promise<Item[]> {
    const root = document.getElementById('isCapturing') as HTMLElement | null;
    if (!root) return [];
    try {
      await ensureHtml2Canvas();
      const canvas = await (window as any).html2canvas(root, {
        useCORS: true,
        backgroundColor: '#ffffff',
        scale: 2,
        // proxy: '/api/html2canvas-proxy' // 用意できるなら有効化。:contentReference[oaicite:5]{index=5}
      });
      return [{ alt: 'snapshot', dataURL: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }];
    } catch (e) {
      console.warn('snapshotFallback failed', e);
      return [];
    }
  }
  async function collectScreenshots(): Promise<Item[]> {
    const g = document.getElementById('screenshotGallery');
    const fromGallery: Item[] = g
      ? (Array.from(g.querySelectorAll('img')) as HTMLImageElement[])
          .map((img, i) => ({
            alt: img.alt || `screenshot-${i + 1}`,
            dataURL: img.currentSrc || img.src,
            width: img.naturalWidth || 0,
            height: img.naturalHeight || 0,
          }))
          .filter((x) => x.dataURL.startsWith('data:')) // ここが重要：外部URLは除外
      : [];

    if (fromGallery.length > 0) return fromGallery;

    // ギャラリーが空なら、その場でスナップして 1 枚返す
    const snap = await snapshotFallback();
    return snap;
  }

  // ---- optional AI summary (/report/summary は refering.client がモック応答) ----
  async function tryFetchAISummary(items: any[]) {
    try {
      const r = await fetch('http://127.0.0.1:5001/report/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: items.map((_: any, idx: number) => ({ index: idx })) }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j && typeof j.summary === 'string') return j.summary;
    } catch {
      /* noop */
    }
    if (!items.length) return '画像がないため、要約は省略されました。';
    return `スクリーンショット ${items.length} 件を収集しました。`;
  }

  // ---- builders (MD/TXT omit images) ----
  function buildMarkdown({ title, includeSummary, summary }: Pack) {
    const L: string[] = [];
    L.push(`# ${title}`, '', `生成時刻: ${new Date().toLocaleString()}`, '');
    if (includeSummary) {
      L.push('## 要約', '', summary || '（要約なし）');
    }
    return L.join('\n');
  }
  function buildPlainText({ title, includeSummary, summary }: Pack) {
    const L: string[] = [];
    L.push(`${title}`, `生成時刻: ${new Date().toLocaleString()}`, '');
    if (includeSummary) {
      L.push('【要約】', summary || '（要約なし）');
    }
    return L.join('\n');
  }
  function buildHTML({ title, includeImages, includeTimestamps, includeSummary, summary, items }: Pack) {
    const esc = (s: any) =>
      String(s).replace(/[&<>"]/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const summaryHTML = includeSummary
      ? `<h2>要約</h2><pre class="summary-text" style="white-space:pre-wrap;font-family:inherit;">${esc(
          summary || '（要約なし）'
        )}</pre>`
      : '';
    const imagesHTML =
      includeImages && items.length
        ? items
            .map((img, i) => {
              return `<figure style="margin:12px 0;">
                        <img src="${img.dataURL}" alt="${esc(img.alt)}" style="max-width:100%;height:auto;display:block;" />
                        <figcaption style="color:#666;font-size:.9rem;">画像 ${i + 1}</figcaption>
                      </figure>`;
            })
            .join('\n')
        : '';
    return `<!doctype html>
<html lang="ja"><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Noto Sans JP","Yu Gothic","Meiryo",sans-serif;line-height:1.6;margin:24px;}h1{font-size:1.6rem;margin:0 0 12px;}h2{font-size:1.2rem;margin:20px 0 8px;}.meta{color:#666;margin-bottom:12px;}</style>
<h1>${esc(title)}</h1><div class="meta">生成時刻: ${esc(new Date().toLocaleString())}</div>${summaryHTML}${imagesHTML}</html>`;
  }

  async function attachJPFont(doc: any) {
    try {
      const b64 = await fetchJPFontB64();
      if (!b64) return false;
      doc.addFileToVFS('IPAexGothic.ttf', b64);
      doc.addFont('IPAexGothic.ttf', 'IPAexGothic', 'normal');
      doc.setFont('IPAexGothic', 'normal');
      return true;
    } catch {
      return false;
    }
  }

  function renderPDFMultilineText(doc: any, text: string, x: number, y: number, maxWidth: number, lineH: number) {
    const lines = String(text || '').split(/\r?\n/);
    for (const raw of lines) {
      if (raw === '') {
        y += lineH;
        continue;
      }
      const wrapped = doc.splitTextToSize(raw, maxWidth);
      for (const seg of wrapped) {
        doc.text(seg, x, y);
        y += lineH;
      }
    }
    return y;
  }

  async function buildDOCX(pack: Pack) {
    await loadScript('https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.iife.js');
    const { Document, Packer, Paragraph, HeadingLevel, AlignmentType, ImageRun } = (window as any).docx;

    const children: any[] = [
      new Paragraph({ text: pack.title, heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: `生成時刻: ${new Date().toLocaleString()}` }),
    ];
    if (pack.includeSummary) {
      children.push(new Paragraph({ text: '要約', heading: HeadingLevel.HEADING_2 }));
      String(pack.summary || '（要約なし）')
        .split(/\r?\n/)
        .forEach((line) => children.push(new Paragraph({ text: line })));
    }
    // data: 画像のみ埋め込み
    for (let i = 0; i < pack.items.length; i++) {
      const img = pack.items[i];
      if (!img.dataURL.startsWith('data:')) continue;
      children.push(new Paragraph({ text: `画像 ${i + 1}`, heading: HeadingLevel.HEADING_3 }));
      const bytes = dataURLtoUint8(img.dataURL);
      const maxW = 500;
      const ratio = img.width ? Math.min(1, maxW / (img.width as number)) : 1;
      const w = Math.round((img.width || maxW) * ratio),
        h = Math.round((img.height || maxW) * ratio);
      children.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [new ImageRun({ data: bytes, transformation: { width: w, height: h } })],
        })
      );
    }
    const doc = new Document({ sections: [{ children }] });
    return await Packer.toBlob(doc);
  }

  // jsPDF ベクタ PDF（画像は data: 限定）
  async function buildPDFVector(pack: Pack) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/3.0.3/jspdf.umd.min.js');
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const page = { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight(), margin: 40 };
    const maxW = page.w - page.margin * 2;
    const lineH = 14;

    const fontOK = await attachJPFont(doc);
    if (!fontOK) return null; // フォント失敗は外でラスタに切替

    doc.setFontSize(16);
    doc.text(pack.title, page.margin, page.margin);
    doc.setFontSize(11);
    doc.text(`生成時刻: ${new Date().toLocaleString()}`, page.margin, page.margin + 18);
    let y = page.margin + 40;

    if (pack.includeSummary) {
      doc.setFontSize(12);
      doc.text('要約', page.margin, y);
      y += 18;
      doc.setFontSize(11);
      y = renderPDFMultilineText(doc, pack.summary || '（要約なし）', page.margin, y, maxW, lineH);
      y += 6;
    }
    for (let i = 0; i < pack.items.length; i++) {
      const img = pack.items[i];
      if (!img.dataURL.startsWith('data:')) continue; // 外部URLは無視（jsPDF は base64 data URL 前提）:contentReference[oaicite:6]{index=6}
      const imgW = maxW;
      const imgH = img.width && img.height ? (imgW * (img.height as number)) / (img.width as number) : (imgW * 9) / 16;
      if (y + imgH + 28 > page.h - page.margin) {
        doc.addPage();
        y = page.margin;
      }
      doc.setFontSize(11);
      doc.text(`画像 ${i + 1}`, page.margin, y);
      y += 14;
      const mime = (img.dataURL.split(';')[0].split(':')[1] || '').toUpperCase().includes('JPEG') ? 'JPEG' : 'PNG';
      doc.addImage(img.dataURL, mime, page.margin, y, imgW, imgH, undefined, 'FAST');
      y += imgH + 14;
    }
    return doc.output('blob');
  }

  // html2canvas でラスタ PDF（外部画像が混ざる/画像0件時の保険）:contentReference[oaicite:7]{index=7}
  async function buildPDFRaster(pack: Pack) {
    await ensureHtml2Canvas();
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/3.0.3/jspdf.umd.min.js');
    const { jsPDF } = (window as any).jspdf;

    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const page = { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight(), margin: 40 };
    const maxW = page.w - page.margin * 2;

    // 既に refering.client が __SC_SUMMARY_HTML__ を用意している想定
    const raw = (window as any).__SC_SUMMARY_HTML__ || '';
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-10000px';
    host.style.top = '0';
    host.style.background = '#fff';
    host.style.width = Math.round(maxW * (96 / 72)) + 'px'; // pt→px
    host.innerHTML = `<div style="font-family: system-ui, -apple-system, 'Noto Sans JP','Yu Gothic','Meiryo',sans-serif; line-height:1.6;">
      <h1 style="font-size:20px;margin:0 0 12px;">${pack.title}</h1>
      <div style="color:#444;margin-bottom:8px;">生成時刻: ${new Date().toLocaleString()}</div>
      ${pack.includeSummary ? `<h2 style="font-size:16px;margin:16px 0 6px;">要約</h2><pre style="white-space:pre-wrap;margin:0;">${pack.summary || '（要約なし）'}</pre>` : ''}
    </div>`;
    document.body.appendChild(host);

    const canvas = await (window as any).html2canvas(host, { useCORS: true, backgroundColor: '#ffffff', scale: 2 });
    host.remove();

    const imgData = canvas.toDataURL('image/png');
    const imgWpt = maxW;
    const imgHpt = imgWpt * (canvas.height / canvas.width);

    let heightLeft = imgHpt;
    let y = page.margin;

    doc.addImage(imgData, 'PNG', page.margin, y, imgWpt, imgHpt, undefined, 'FAST');
    heightLeft -= page.h - page.margin * 2;

    while (heightLeft > 0) {
      doc.addPage();
      y = page.margin - (imgHpt - heightLeft);
      doc.addImage(imgData, 'PNG', page.margin, y, imgWpt, imgHpt, undefined, 'FAST');
      heightLeft -= page.h - page.margin * 2;
    }
    return doc.output('blob');
  }

  function dataURLtoUint8(dataURL: string) {
    const arr = dataURL.split(','),
      bstr = atob(arr[1] || '');
    const u8 = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
    return u8;
  }

  // ---- click handler for #generateReportBtn ----
  async function onGenerate() {
    const btn = $('#generateReportBtn') as HTMLButtonElement | null;
    const fmtSel = $('#reportFormat') as HTMLSelectElement | null;
    const titleEl = $('#reportTitle') as HTMLInputElement | null;
    const includeTimestamps = (document.getElementById('includeTimestamps') as HTMLInputElement | null)?.checked ?? true;
    const includeSummary = (document.getElementById('includeSummary') as HTMLInputElement | null)?.checked ?? true;
    const includeImages = true;

    if (!btn) return;
    btn.disabled = true;
    btn.textContent = '生成中...';
    try {
      let items = await collectScreenshots(); // ここで data: 以外は除外済み
      const title = titleEl?.value?.trim() || `作業記録_${nowStamp()}`;
      const summary = includeSummary ? await tryFetchAISummary(items) : '';

      // data: 画像が 0 の場合は、ラスタ PDF/HTML などの安全ルートを使う
      const pack: Pack = { title, includeImages, includeTimestamps, includeSummary, summary, items };

      const fmt = (fmtSel?.value || 'markdown').toLowerCase();
      if (fmt === 'markdown') return downloadBlob(`${title}.md`, 'text/markdown;charset=utf-8', buildMarkdown(pack));
      if (fmt === 'txt') return downloadBlob(`${title}.txt`, 'text/plain;charset=utf-8', buildPlainText(pack));
      if (fmt === 'html') return downloadBlob(`${title}.html`, 'text/html;charset=utf-8', buildHTML(pack));

      if (fmt === 'docx') {
        // DOCX も data: 画像のみ対応。0件なら snapshot を先に追加
        if (pack.items.length === 0) {
          pack.items = await snapshotFallback();
        }
        const b = await buildDOCX(pack);
        return downloadBlob(`${title}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', b);
      }

      if (fmt === 'pdf') {
        // ベクタPDF（フォントOK＆画像が data: の時）を優先。無理ならラスタPDFへ。
        let blob: Blob | null = null;
        if (pack.items.length > 0) {
          blob = await buildPDFVector(pack);
        }
        if (!blob) {
          blob = await buildPDFRaster(pack);
        }
        return downloadBlob(`${title}.pdf`, 'application/pdf', blob);
      }

      throw new Error(`未対応の形式: ${fmt}`);
    } catch (err: any) {
      console.error('[transForm] generate error:', err);
      alert(`レポート生成に失敗しました: ${err?.message || String(err)}`);
    } finally {
      btn.textContent = 'レポート生成';
      btn.disabled = false;

      const log = $('#activityLog');
      if (log) {
        const row = document.createElement('div');
        row.className = 'activity-item';
        row.innerHTML = `<span class="activity-time">${new Date().toLocaleTimeString()}</span>
                         <span class="activity-message">レポート生成処理を実行しました</span>`;
        log.prepend(row);
      }
    }
  }

  // ---- AI ドット（「AI分析」の真下に 3 ドット） ----
  function ensureAIDotsUnderAIStatus() {
    const aiRow = document.getElementById('aiStatusRow') || document.getElementById('aiStatus');
    if (!aiRow) return;
    if (document.getElementById('aiDotsContainer')) return;

    const style = document.createElement('style');
    style.textContent = `
      .ai-dots-line{display:flex;justify-content:flex-end;gap:8px;margin-top:.35rem;min-height:12px}
      .ai-dot{width:8px;height:8px;border-radius:50%;background:#7dd3fc;opacity:.5;transition:opacity .15s,transform .15s}
      .ai-dot.on{opacity:1;transform:scale(1.15)}
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.id = 'aiDotsContainer';
    container.className = 'ai-dots-line';
    container.innerHTML = `<span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span>`;
    (aiRow as HTMLElement).insertAdjacentElement('afterend', container);

    let timer: any = null,
      idx = 0;
    const start = () => {
      stop();
      timer = setInterval(() => {
        container.querySelectorAll('.ai-dot').forEach((d, i) => d.classList.toggle('on', i === idx));
        idx = (idx + 1) % 3;
      }, 300);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      container.querySelectorAll('.ai-dot').forEach((d) => d.classList.remove('on'));
      timer = null;
    };

    const startBtn = document.getElementById('btn-start');
    const stopBtn = document.getElementById('btn-stop');
    if (startBtn) startBtn.addEventListener('click', start);
    if (stopBtn) stopBtn.addEventListener('click', stop);
  }

  // 初期バインド
  const genBtn = $('#generateReportBtn');
  if (genBtn && !(genBtn as any).__scBound) {
    genBtn.addEventListener('click', onGenerate);
    (genBtn as any).__scBound = true;
  }
  ensureAIDotsUnderAIStatus();
}
