/* transForm.js — 完全統合版
   - PDF: 日本語フォント埋め込み + html2canvasフォールバック
   - 要約: /report/summary → 失敗時は #isCapturing をHTML→Markdown化
   - 画像: #screenshotGallery 優先 / 空なら #isCapturing の <img> を dataURL化
           それも不可なら #isCapturing をスナップして1枚画像化して挿入
   - TXT/MD では画像は出力しない
*/
(() => {
  'use strict';

  // ---------------- small utils ----------------
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  async function loadScript(src) {
    if (document.querySelector(`script[data-dynamic="${src}"]`)) return;
    await new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = src; el.async = true; el.defer = true;
      el.dataset.dynamic = src;
      el.onload = res; el.onerror = () => rej(new Error(`Failed to load ${src}`));
      document.head.appendChild(el);
    });
  }
  function downloadBlob(filename, mime, data) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.download = filename; a.href = url; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  }
  const blobToDataURL = (blob) => new Promise((r) => {
    const fr = new FileReader(); fr.onloadend = () => r(fr.result); fr.readAsDataURL(blob);
  });
  function dataURLtoUint8(dataURL) {
    const arr = dataURL.split(','), bstr = atob(arr[1]); const u8 = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i); return u8;
  }
  function arrayBufferToBase64(buf) {
    const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s);
  }
  async function toDataURL(input) {
    if (typeof input === 'string') {
      if (input.startsWith('data:')) return input;
      const bl = await fetch(input).then((r) => r.blob());
      return await blobToDataURL(bl);
    }
    if (input instanceof Blob) return await blobToDataURL(input);
    throw new Error('Unsupported input for toDataURL');
  }
  function nowStamp() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }
  function extractTimestampFromSrc(src) {
    try {
      const m = decodeURIComponent(src).match(/(\d{4}[-_]\d{2}[-_]\d{2})[T_\-\s]?(\d{2})?(\d{2})?(\d{2})?/);
      if (!m) return '';
      const [_, d, hh = '00', mm = '00', ss = '00'] = m;
      return `${d.replace(/_/g, '-')} ${hh}:${mm}:${ss}`;
    } catch { return ''; }
  }

  // ---------------- HTML -> Markdown (minimal) ----------------
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
        case 'strong': case 'b': return `**${content}**`;
        case 'em': case 'i': return `*${content}*`;
        case 'ul': return `${Array.from(node.children).map(li => `- ${walk(li)}\n`).join('')}\n`;
        case 'ol': return `${Array.from(node.children).map((li,i)=> `${i+1}. ${walk(li)}\n`).join('')}\n`;
        case 'li': return `${content}`;
        case 'a': {
          const href = node.getAttribute('href') || '';
          return href ? `[${content}](${href})` : content;
        }
        case 'img':
          queueInlineImage(node.getAttribute('src') || '', node.getAttribute('alt') || 'inline');
          return ''; // 文中画像はギャラリーへ
        default: return content;
      }
    };
    return walk(root).replace(/\n{3,}/g, '\n\n').trim();
  }

  // ---------------- images: gallery + inline + snapshot ----------------
  const inlineImgQueue = new Map(); // src -> Promise<dataURL>

  async function convertToDataURL(src) {
    if (!src) return '';
    if (src.startsWith('data:')) return src;
    // 1) fetch → blob
    try {
      const r = await fetch(src, { mode: 'cors' });
      if (r.ok) return await blobToDataURL(await r.blob());
    } catch {/* try canvas */}
    // 2) crossOrigin=anonymous で <img> → canvas → dataURL
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      const p = new Promise((resolve, reject) => {
        img.onload = () => {
          const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
          const g = c.getContext('2d'); g.drawImage(img, 0, 0);
          resolve(c.toDataURL('image/png'));
        };
        img.onerror = reject;
      });
      img.src = src;
      return await p;
    } catch { return src; } // どうしてもダメならそのまま（後でスナップに頼る）
  }
  function queueInlineImage(src, alt='inline') {
    if (!src || inlineImgQueue.has(src)) return;
    inlineImgQueue.set(src, convertToDataURL(src).then((d)=>({ dataURL:d, alt })));
  }
  async function flushInlineImagesToGallery() {
    const g = $('#screenshotGallery') || (() => {
      const d = document.createElement('div'); d.id = 'screenshotGallery'; d.style.display = 'none'; document.body.appendChild(d); return d;
    })();
    for (const [, p] of inlineImgQueue.entries()) {
      try {
        const { dataURL, alt } = await p;
        if (!dataURL) continue;
        const dup = [...g.querySelectorAll('img')].some(i => (i.currentSrc || i.src) === dataURL);
        if (dup) continue;
        const wrap = document.createElement('div'); wrap.className = 'thumb';
        const img  = new Image(); img.alt = alt; img.src = dataURL;
        wrap.appendChild(img); g.appendChild(wrap);
      } catch { /* skip */ }
    }
    inlineImgQueue.clear();
  }
  async function snapshotIsCapturingIntoGallery() {
    const root = $('#isCapturing'); if (!root) return;
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      const canvas = await window.html2canvas(root, { useCORS:true, scale:2, backgroundColor:'#ffffff' });
      const dataURL = canvas.toDataURL('image/png');
      queueInlineImage(dataURL, 'snapshot');
      await flushInlineImagesToGallery();
    } catch { /* noop */ }
  }

  // gallery → items
  async function collectScreenshots() {
    const g = $('#screenshotGallery');
    if (!g || g.querySelectorAll('img').length === 0) {
      // inline 画像を投入してから再収集
      const host = $('#isCapturing');
      if (host) host.querySelectorAll('img').forEach(img => queueInlineImage(img.currentSrc || img.src, img.alt || 'inline'));
      await flushInlineImagesToGallery();
    }
    // まだ無い → スナップ保険
    const after = $('#screenshotGallery');
    if (!after || after.querySelectorAll('img').length === 0) {
      await snapshotIsCapturingIntoGallery();
    }

    const imgs = Array.from(($('#screenshotGallery')||document.createElement('div')).querySelectorAll('img'));
    const list = [];
    for (const img of imgs) {
      const src = img.currentSrc || img.src;
      const dataURL = await toDataURL(src);
      list.push({
        alt: img.alt || 'screenshot',
        dataURL,
        timestamp: img.dataset.timestamp || extractTimestampFromSrc(src),
        width: img.naturalWidth || 0,
        height: img.naturalHeight || 0,
      });
    }
    return list;
  }

  // ---------------- summary fetch (with local fallback) ----------------
  async function tryFetchAISummary(items) {
    try {
      const r = await fetch('http://127.0.0.1:5001/report/summary', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ images: items.map((i,idx)=>({ index:idx, timestamp:i.timestamp||null })) })
      });
      if (!r.ok) throw new Error('HTTP '+r.status);
      const j = await r.json();
      if (j && typeof j.summary === 'string') return j.summary;
    } catch {/* fallback below */}

    // ローカルフォールバック：#isCapturing -> Markdown
    const host = $('#isCapturing');
    if (host) {
      window.__SC_SUMMARY_HTML__ = host.innerHTML; // PDF画像フォールバック用
      try {
        const md = htmlToMarkdown(host.cloneNode(true));
        if (md && md.trim()) return md;
      } catch {/* ignore */}
      // 素のテキスト
      const plain = host.innerText || host.textContent || '';
      if (plain && plain.trim()) return plain;
    }
    if (!items.length) return '画像がないため、要約は省略されました。';
    return `スクリーンショット ${items.length} 件を収集しました。`;
  }

  // ---------------- builders: MD/TXT/HTML ----------------
  function buildMarkdown({ title, includeSummary, summary }) {
    const L = [];
    L.push(`# ${title}`, '', `生成時刻: ${new Date().toLocaleString()}`, '');
    if (includeSummary) { L.push('## 要約', '', summary || '（要約なし）'); }
    return L.join('\n');
  }
  function buildPlainText({ title, includeSummary, summary }) {
    const L = [];
    L.push(`${title}`, `生成時刻: ${new Date().toLocaleString()}`, '');
    if (includeSummary) { L.push('【要約】', summary || '（要約なし）'); }
    return L.join('\n');
  }
  function buildHTML({ title, includeImages, includeTimestamps, includeSummary, summary, items }) {
    const esc=(s)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const summaryHTML = includeSummary
      ? `<h2>要約</h2><pre class="summary-text">${esc(summary || '（要約なし）')}</pre>` : '';
    const imagesHTML = includeImages && items.length
      ? items.map((img,i)=>{
          const cap = includeTimestamps && img.timestamp ? `（${esc(img.timestamp)}）` : '';
          return `<figure style="margin:12px 0;">
                    <img src="${img.dataURL}" alt="${esc(img.alt)}" style="max-width:100%;height:auto;display:block;" />
                    <figcaption style="color:#666;font-size:.9rem;">画像 ${i+1} ${cap}</figcaption>
                  </figure>`;
        }).join('\n') : '';
    return `<!doctype html>
<html lang="ja"><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Noto Sans JP","Yu Gothic","Meiryo",sans-serif;line-height:1.6;margin:24px;}
  h1{font-size:1.6rem;margin:0 0 12px;} h2{font-size:1.2rem;margin:20px 0 8px;}
  .meta{color:#666;margin-bottom:12px;}
  .summary-text{white-space:pre-wrap; font-family:inherit;}
</style>
<h1>${esc(title)}</h1>
<div class="meta">生成時刻: ${esc(new Date().toLocaleString())}</div>
${summaryHTML}
${imagesHTML}
</html>`;
  }

  // ---------------- DOCX ----------------
  async function buildDOCX({ title, includeImages, includeTimestamps, includeSummary, summary, items }) {
    await loadScript('https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.iife.js');
    const { Document, Packer, Paragraph, HeadingLevel, AlignmentType, ImageRun } = window.docx;
    const kids = [
      new Paragraph({ text: title || 'レポート', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: `生成時刻: ${new Date().toLocaleString()}` }),
    ];
    if (includeSummary) {
      kids.push(new Paragraph({ text:'要約', heading: HeadingLevel.HEADING_2 }));
      String(summary || '（要約なし）').split(/\r?\n/).forEach(line => {
        kids.push(new Paragraph({ text: line || ' ' }));
      });
    }
    if (includeImages && items.length) {
      for (let i = 0; i < items.length; i++) {
        const img = items[i];
        const cap = includeTimestamps && img.timestamp ? `画像 ${i+1} （${img.timestamp}）` : `画像 ${i+1}`;
        kids.push(new Paragraph({ text: cap, heading: HeadingLevel.HEADING_3 }));
        const bytes = dataURLtoUint8(img.dataURL);
        const maxW = 500; const ratio = img.width ? Math.min(1, maxW / img.width) : 1;
        const w = Math.round((img.width || maxW) * ratio), h = Math.round((img.height || maxW) * ratio);
        kids.push(new Paragraph({ alignment: AlignmentType.LEFT, children: [ new ImageRun({ data: bytes, transformation: { width: w, height: h } }) ] }));
      }
    }
    const doc = new Document({ sections: [{ children: kids }] });
    return await Packer.toBlob(doc);
  }

  // ---------------- PDF (jsPDF + JP font + html2canvas fallback) ----------------
  const JP_FONT_URLS = [
    'https://ctan.math.washington.edu/tex-archive/fonts/ipaex/ipaexg.ttf',
    'https://mirror.twds.com.tw/CTAN/fonts/ipaex/ipaexg.ttf'
  ];
  let jpFontB64Cache = null;
  async function fetchJPFontB64(){
    if (jpFontB64Cache) return jpFontB64Cache;
    for (const u of JP_FONT_URLS){
      try {
        const ab = await fetch(u, { mode:'cors' }).then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); });
        jpFontB64Cache = arrayBufferToBase64(ab); return jpFontB64Cache;
      } catch {/* try next */}
    }
    return null;
  }
  async function attachJPFont(doc){
    try{
      const b64 = await fetchJPFontB64(); if(!b64) return false;
      doc.addFileToVFS('IPAexGothic.ttf', b64);
      doc.addFont('IPAexGothic.ttf', 'IPAexGothic', 'normal');
      doc.setFont('IPAexGothic', 'normal');
      return true;
    } catch { return false; }
  }
  function renderMarkdownToPDF(doc, markdown, x, y, maxWidth) {
    const baseLH = 14;
    const drawPara = (txt, size) => {
      doc.setFontSize(size);
      const wrapped = doc.splitTextToSize(String(txt), maxWidth);
      wrapped.forEach(seg => { doc.text(seg, x, y); y += Math.round(size * 0.85); });
      y += 4;
      return y;
    };
    for (let raw of String(markdown||'').split(/\r?\n/)) {
      if (!raw.trim()) { y += baseLH; continue; }
      if (raw.startsWith('### ')) { y = drawPara(raw.replace(/^###\s*/, ''), 12); continue; }
      if (raw.startsWith('## '))  { y = drawPara(raw.replace(/^##\s*/, ''), 14); continue; }
      if (raw.startsWith('# '))   { y = drawPara(raw.replace(/^#\s*/, ''), 16); continue; }
      y = drawPara(raw, 11);
    }
    return y;
  }
  function buildHTMLFragmentForPDF({ title, includeImages, includeTimestamps, includeSummary, summary, items }) {
    const esc = (s)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const parts = [];
    parts.push(`<div style="font-family: system-ui, -apple-system, 'Noto Sans JP','Yu Gothic','Meiryo',sans-serif; line-height:1.6; padding:0; margin:0;">`);
    parts.push(`<h1 style="font-size:20px;margin:0 0 12px;">${esc(title)}</h1>`);
    parts.push(`<div style="color:#444;margin-bottom:8px;">生成時刻: ${esc(new Date().toLocaleString())}</div>`);
    if (includeSummary) {
      parts.push(`<h2 style="font-size:16px;margin:16px 0 6px;">要約</h2>`);
      parts.push(`<pre style="white-space:pre-wrap; font-family:inherit; margin:0;">${esc(summary||'（要約なし）')}</pre>`);
    }
    if (includeImages && items.length) {
      for (let i = 0; i < items.length; i++) {
        const img = items[i];
        const cap = includeTimestamps && img.timestamp ? `（${esc(img.timestamp)}）` : '';
        parts.push(`<figure style="margin:12px 0;"><img src="${img.dataURL}" alt="${esc(img.alt)}" style="max-width:100%;height:auto;display:block;" /><figcaption style="color:#666;font-size:.9rem;">画像 ${i+1} ${cap}</figcaption></figure>`);
      }
    }
    parts.push(`</div>`);
    return parts.join('');
  }
  async function buildPDF(pack) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/3.0.3/jspdf.umd.min.js');
    const { jsPDF } = window.jspdf;
    const doc  = new jsPDF({ unit:'pt', format:'a4', compress:true });
    const page = { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight(), margin: 40 };
    const maxW = page.w - page.margin*2;

    const fontOK = await attachJPFont(doc); // UTF-8 日本語フォント

    if (fontOK) {
      // ヘッダ
      const title = pack.title && pack.title.trim() ? pack.title.trim() : 'レポート';
      doc.setFontSize(16); doc.text(title, page.margin, page.margin);
      doc.setFontSize(11); doc.text(`生成時刻: ${new Date().toLocaleString()}`, page.margin, page.margin + 18);

      // 本文
      let y = page.margin + 42;

      if (pack.includeSummary) {
        doc.setFontSize(12); doc.text('要約', page.margin, y); y += 18;
        y = renderMarkdownToPDF(doc, pack.summary || '（要約なし）', page.margin, y, maxW);
        y += 4;
      }

      if (pack.includeImages && pack.items.length) {
        for (let i = 0; i < pack.items.length; i++) {
          const img = pack.items[i];
          const caption = pack.includeTimestamps && img.timestamp ? `画像 ${i+1} （${img.timestamp}）` : `画像 ${i+1}`;
          const imgW = maxW;
          const imgH = img.width ? (imgW * img.height / img.width) : (imgW * 9 / 16);
          if (y + imgH + 28 > page.h - page.margin) { doc.addPage(); y = page.margin; }
          doc.setFontSize(11); doc.text(caption, page.margin, y); y += 14;
          const mime = (img.dataURL.split(';')[0].split(':')[1] || '').toUpperCase().includes('JPEG') ? 'JPEG' : 'PNG';
          doc.addImage(img.dataURL, mime, page.margin, y, imgW, imgH, undefined, 'FAST');
          y += imgH + 14;
        }
      }
      return doc.output('blob');
    }

    // --- フォント取れない等の保険：html2canvas でレンダリング画像化 ---
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    // summary を HTML で再構築（#isCapturing のHTMLがあれば最優先）
    const htmlFrag = window.__SC_SUMMARY_HTML__
      ? `<div>${window.__SC_SUMMARY_HTML__}</div>`
      : buildHTMLFragmentForPDF(pack);
    const pxPerPt = 96/72;
    const work = document.createElement('div');
    work.style.position = 'fixed'; work.style.left = '-10000px'; work.style.top = '0';
    work.style.background = '#fff';
    work.style.width = Math.round((maxW) * pxPerPt) + 'px';
    work.innerHTML = htmlFrag; document.body.appendChild(work);

    const canvas = await window.html2canvas(work, { backgroundColor:'#ffffff', scale: 2, useCORS: true });
    work.remove();

    const imgData = canvas.toDataURL('image/png');
    const imgWpt = maxW;
    const imgHpt = imgWpt * (canvas.height / canvas.width);

    let heightLeft = imgHpt;
    let y = page.margin;

    doc.addImage(imgData, 'PNG', page.margin, y, imgWpt, imgHpt, undefined, 'FAST');
    heightLeft -= (page.h - page.margin*2);

    while (heightLeft > 0) {
      doc.addPage();
      y = page.margin - (imgHpt - heightLeft);
      doc.addImage(imgData, 'PNG', page.margin, y, imgWpt, imgHpt, undefined, 'FAST');
      heightLeft -= (page.h - page.margin*2);
    }
    return doc.output('blob');
  }

  // ---------------- main handler ----------------
  async function onGenerate() {
    const btn   = $('#generateReportBtn');
    const fmtEl = $('#reportFormat');
    const titleEl = $('#reportTitle');
    const includeImages     = $('#includeImages')?.checked ?? true;
    const includeTimestamps = $('#includeTimestamps')?.checked ?? true;
    const includeSummary    = $('#includeSummary')?.checked ?? true;
    const dataCountEl = $('#reportDataCount');
    const activityLog = $('#activityLog');

    btn.disabled = true; btn.textContent = '生成中...';
    try {
      const items   = await collectScreenshots();
      if (dataCountEl) dataCountEl.textContent = String(items.length);
      const title   = titleEl?.value?.trim() || `作業記録_${nowStamp()}`;
      const summary = includeSummary ? await tryFetchAISummary(items) : '';

      const pack = { title, includeImages, includeTimestamps, includeSummary, summary, items };
      const fmt  = (fmtEl?.value || 'html').toLowerCase();

      if      (fmt === 'html') { const html = buildHTML(pack); downloadBlob(`${title}.html`, 'text/html;charset=utf-8', html); }
      else if (fmt === 'docx') { const b = await buildDOCX(pack); downloadBlob(`${title}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', b); }
      else if (fmt === 'pdf')  { const b = await buildPDF(pack);  downloadBlob(`${title}.pdf`,  'application/pdf', b); }
      else if (fmt === 'markdown' || fmt === 'md') { const md = buildMarkdown(pack); downloadBlob(`${title}.md`, 'text/markdown;charset=utf-8', md); }
      else if (fmt === 'txt') { const txt = buildPlainText(pack); downloadBlob(`${title}.txt`, 'text/plain;charset=utf-8', txt); }
      else { throw new Error(`未対応の形式: ${fmt}`); }

      if (activityLog) {
        const row = document.createElement('div'); row.className = 'activity-item';
        row.innerHTML = `<span class="activity-time">${new Date().toLocaleTimeString()}</span>
                         <span class="activity-message">レポート(${fmt.toUpperCase()})を生成しました</span>`;
        activityLog.prepend(row);
      }
    } catch (err) {
      console.error('[transForm] generate error:', err);
      alert(`レポート生成に失敗しました: ${err.message}`);
    } finally {
      btn.disabled = false; btn.textContent = 'レポート生成';
    }
  }

  function initWhenReady() {
    const btn = $('#generateReportBtn'); if (!btn) return;
    if (!btn.dataset.trFormBound) {
      btn.addEventListener('click', onGenerate);
      btn.dataset.trFormBound = '1';
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhenReady, { once:true });
  } else { initWhenReady(); }

  // optional debug handle
  Object.defineProperty(window, 'SCReport', { value: { collectScreenshots, tryFetchAISummary }, writable: false });
})();
