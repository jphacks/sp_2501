/* transForm.js - Report generator (PDF JP font + robust fallback)
   - Markdownの改行を厳密保持
   - 画像は要約（Markdown）と同じセクション内に連続配置
   - TXT/MD 出力では画像を完全に出力しない
*/
(() => {
  'use strict';

  // ---------- tiny utils ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  async function loadScript(src) {
    if (document.querySelector(`script[data-dynamic="${src}"]`)) return;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.defer = true;
      s.dataset.dynamic = src;
      s.onload = res; s.onerror = () => rej(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }
  function downloadBlob(filename, mime, data) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = filename; a.href = url; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },0);
  }
  function blobToDataURL(blob){
    return new Promise(r=>{ const fr=new FileReader(); fr.onloadend=()=>r(fr.result); fr.readAsDataURL(blob); });
  }
  function dataURLtoUint8(dataURL){
    const arr=dataURL.split(','), bstr=atob(arr[1]); const u8=new Uint8Array(bstr.length);
    for(let i=0;i<bstr.length;i++) u8[i]=bstr.charCodeAt(i); return u8;
  }
  function arrayBufferToBase64(buf){
    const b=new Uint8Array(buf); let s=''; for(let i=0;i<b.length;i++) s+=String.fromCharCode(b[i]); return btoa(s);
  }
  async function toDataURL(input){
    if (typeof input==='string'){ if(input.startsWith('data:')) return input; const bl=await fetch(input).then(r=>r.blob()); return await blobToDataURL(bl); }
    if (input instanceof Blob) return await blobToDataURL(input);
    throw new Error('Unsupported input for toDataURL');
  }
  function nowStamp(){ const d=new Date(),p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }
  function extractTimestampFromSrc(src){ try{ const m=decodeURIComponent(src).match(/(\d{4}[-_]\d{2}[-_]\d{2})[T_\-\s]?(\d{2})?(\d{2})?(\d{2})?/); if(!m) return ''; const [_,d,hh='00',mm='00',ss='00']=m; return `${d.replace(/_/g,'-')} ${hh}:${mm}:${ss}`; }catch{return '';} }

  // ---------- gather screenshots ----------
  async function collectScreenshots(){
    const g = $('#screenshotGallery'); if(!g) return [];
    const imgs = Array.from(g.querySelectorAll('img')); const list=[];
    for(const img of imgs){
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

  // ---------- optional AI summary ----------
  async function tryFetchAISummary(items){
    try{
      const r = await fetch('http://127.0.0.1:5001/report/summary',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ images: items.map((i,idx)=>({index:idx,timestamp:i.timestamp||null})) })
      });
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j = await r.json(); if(j && typeof j.summary==='string') return j.summary;
    }catch{/* noop */}
    if(!items.length) return '画像がないため、要約は省略されました。';
    return `スクリーンショット ${items.length} 件を収集しました。代表例: ${items.slice(0,3).map((_,i)=>`#${i+1}`).join(', ')} ...`;
  }

  // ---------- builders ----------
  // NOTE: TXT / MD は画像を出力しない仕様に変更
  function buildMarkdown({title, includeSummary, summary}){
    const L=[]; 
    L.push(`# ${title}`,'', `生成時刻: ${new Date().toLocaleString()}`, '');
    if(includeSummary){ L.push('## 要約','', summary || '（要約なし）'); }
    return L.join('\n');
  }
  function buildPlainText({title, includeSummary, summary}){
    const L=[]; 
    L.push(`${title}`, `生成時刻: ${new Date().toLocaleString()}`, '');
    if(includeSummary){ L.push('【要約】', summary || '（要約なし）'); }
    return L.join('\n');
  }

  function buildHTML({title, includeImages, includeTimestamps, includeSummary, summary, items}){
    const esc=(s)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    // 改行保持は pre-wrap を使用（改行も長文折返しも維持）: MDN
    // https://developer.mozilla.org/en-US/docs/Web/CSS/white-space
    const summaryHTML = includeSummary
      ? `<h2>要約</h2>
         <pre class="summary-text">${esc(summary || '（要約なし）')}</pre>`
      : '';
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

  // ---------- PDF（日本語フォント埋め込み + 確実なフォールバック） ----------
  const JP_FONT_URLS = [
    'https://ctan.math.washington.edu/tex-archive/fonts/ipaex/ipaexg.ttf',
    'https://mirror.twds.com.tw/CTAN/fonts/ipaex/ipaexg.ttf'
  ];
  let jpFontB64Cache = null;
  async function fetchJPFontB64(){
    if (jpFontB64Cache) return jpFontB64Cache;
    for (const u of JP_FONT_URLS){
      try{
        const ab = await fetch(u, { mode:'cors' }).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); });
        jpFontB64Cache = arrayBufferToBase64(ab); return jpFontB64Cache;
      }catch{ /* try next */ }
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
    }catch{ return false; }
  }

  // 要約の改行を保持しつつ折返す描画
  // 各行ごとに splitTextToSize を適用して複数行化（公式API）:
  // https://artskydj.github.io/jsPDF/docs/module-split_text_to_size.html
  function renderPDFMultilineText(doc, text, x, y, maxWidth, lineH){
    const lines = String(text || '').split(/\r?\n/);
    for (let i=0;i<lines.length;i++){
      const raw = lines[i];
      if (raw === '') { y += lineH; continue; } // 空行
      const wrapped = doc.splitTextToSize(raw, maxWidth); // 折返し配列
      for (const seg of wrapped){ doc.text(seg, x, y); y += lineH; }
    }
    return y;
  }

  function buildHTMLFragmentForPDF({ title, includeImages, includeTimestamps, includeSummary, summary, items }) {
    const esc = (s)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const parts=[];
    parts.push(`<div style="font-family: system-ui, -apple-system, 'Noto Sans JP','Yu Gothic','Meiryo',sans-serif; line-height:1.6; padding:0; margin:0;">`);
    parts.push(`<h1 style="font-size:20px;margin:0 0 12px;">${esc(title)}</h1>`);
    parts.push(`<div style="color:#444;margin-bottom:8px;">生成時刻: ${esc(new Date().toLocaleString())}</div>`);
    if (includeSummary){
      parts.push(`<h2 style="font-size:16px;margin:16px 0 6px;">要約</h2>`);
      // 改行保持（pre-wrap）
      parts.push(`<pre style="white-space:pre-wrap; font-family:inherit; margin:0;">${esc(summary||'（要約なし）')}</pre>`);
    }
    if (includeImages && items.length){
      for (let i=0;i<items.length;i++){
        const img = items[i];
        const cap = includeTimestamps && img.timestamp ? `（${esc(img.timestamp)}）` : '';
        parts.push(`<figure style="margin:12px 0;"><img src="${img.dataURL}" alt="${esc(img.alt)}" style="max-width:100%;height:auto;display:block;" /><figcaption style="color:#666;font-size:.9rem;">画像 ${i+1} ${cap}</figcaption></figure>`);
      }
    }
    parts.push(`</div>`);
    return parts.join('');
  }

  async function buildDOCX({ title, includeImages, includeTimestamps, includeSummary, summary, items }) {
    await loadScript('https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.iife.js');
    const { Document, Packer, Paragraph, HeadingLevel, AlignmentType, ImageRun } = window.docx;

    const children = [
      new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: `生成時刻: ${new Date().toLocaleString()}` }),
    ];
    if(includeSummary){
      children.push(new Paragraph({ text:'要約', heading:HeadingLevel.HEADING_2 }));
      // 改行保持：\n で段落化
      String(summary || '（要約なし）').split(/\r?\n/).forEach(line=>{
        children.push(new Paragraph({ text: line }));
      });
    }
    if(includeImages && items.length){
      for(let i=0;i<items.length;i++){
        const img=items[i];
        const caption = includeTimestamps && img.timestamp ? `画像 ${i+1} （${img.timestamp}）` : `画像 ${i+1}`;
        children.push(new Paragraph({ text: caption, heading: HeadingLevel.HEADING_3 }));
        const bytes = dataURLtoUint8(img.dataURL);
        const maxW=500; const ratio=img.width?Math.min(1,maxW/img.width):1;
        const w=Math.round((img.width||maxW)*ratio), h=Math.round((img.height||maxW)*ratio);
        children.push(new Paragraph({
          alignment: AlignmentType.LEFT,
          children:[ new ImageRun({ data: bytes, transformation:{ width:w, height:h } }) ]
        }));
      }
    }
    const doc = new Document({ sections:[{ children }] });
    return await Packer.toBlob(doc);
  }

  async function buildPDF(pack) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/3.0.3/jspdf.umd.min.js');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'pt', format:'a4', compress:true });
    const page = { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight(), margin: 40 };
    const maxW = page.w - page.margin*2;
    const lineH = 14;

    // 日本語フォント（UTF-8文字を描画するにはカスタムTTFの組込みが必要）
    const fontOK = await attachJPFont(doc);

    if (fontOK) {
      doc.setFontSize(16); doc.text(pack.title, page.margin, page.margin);
      doc.setFontSize(11); doc.text(`生成時刻: ${new Date().toLocaleString()}`, page.margin, page.margin+18);

      let y = page.margin + 40;

      // 要約（改行保持 + 折返し）
      if (pack.includeSummary) {
        doc.setFontSize(12); doc.text('要約', page.margin, y); y += 18;
        doc.setFontSize(11);
        y = renderPDFMultilineText(doc, pack.summary || '（要約なし）', page.margin, y, maxW, lineH);
        y += 6;
      }

      // 画像を同じセクション内に続けて配置
      if (pack.includeImages && pack.items.length) {
        for (let i=0;i<pack.items.length;i++){
          const img=pack.items[i];
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

    // フォント取得失敗時：html2canvas で画像化（白紙回避）
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    const frag = buildHTMLFragmentForPDF(pack);
    const pxPerPt = 96/72;
    const work = document.createElement('div');
    work.style.position = 'fixed'; work.style.left = '-10000px'; work.style.top = '0';
    work.style.background = '#fff';
    work.style.width = Math.round((maxW) * pxPerPt) + 'px';
    work.innerHTML = frag; document.body.appendChild(work);

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

  // ---------- main handler ----------
  async function onGenerate(){
    const btn=$('#generateReportBtn'), fmtSel=$('#reportFormat'), titleEl=$('#reportTitle');
    const includeImages = $('#includeImages')?.checked ?? true;
    const includeTimestamps = $('#includeTimestamps')?.checked ?? true;
    const includeSummary = $('#includeSummary')?.checked ?? true;
    const dataCountEl=$('#reportDataCount'), activityLog=$('#activityLog');

    btn.disabled=true; btn.textContent='生成中...';
    try{
      const items = await collectScreenshots(); if(dataCountEl) dataCountEl.textContent=String(items.length);
      const title = titleEl?.value?.trim() || `作業記録_${nowStamp()}`;
      const summary = includeSummary ? await tryFetchAISummary(items) : '';

      const pack = { title, includeImages, includeTimestamps, includeSummary, summary, items };
      const fmt = (fmtSel?.value || 'markdown').toLowerCase();

      if (fmt==='markdown') downloadBlob(`${title}.md`, 'text/markdown;charset=utf-8', buildMarkdown(pack));
      else if (fmt==='txt') downloadBlob(`${title}.txt`, 'text/plain;charset=utf-8', buildPlainText(pack));
      else if (fmt==='html') downloadBlob(`${title}.html`, 'text/html;charset=utf-8', buildHTML(pack));
      else if (fmt==='docx') { const b=await buildDOCX(pack); downloadBlob(`${title}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', b); }
      else if (fmt==='pdf')  { const b=await buildPDF(pack);  downloadBlob(`${title}.pdf`, 'application/pdf', b); }
      else throw new Error(`未対応の形式: ${fmt}`);

      if(activityLog){
        const row=document.createElement('div'); row.className='activity-item';
        row.innerHTML=`<span class="activity-time">${new Date().toLocaleTimeString()}</span><span class="activity-message">レポート(${fmt.toUpperCase()})を生成しました</span>`;
        activityLog.prepend(row);
      }
    }catch(err){
      console.error('[transForm] generate error:', err);
      alert(`レポート生成に失敗しました: ${err.message}`);
    }finally{
      btn.disabled=false; btn.textContent='レポート生成';
    }
  }

  function initWhenReady(){
    const btn=$('#generateReportBtn'); if(!btn) return;
    if(!btn.dataset.transformBound){ btn.addEventListener('click', onGenerate); btn.dataset.transformBound='1'; }
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', initWhenReady, { once:true }); }
  else { initWhenReady(); }

  Object.defineProperty(window,'SCReport',{ value:{ collectScreenshots, tryFetchAISummary }, writable:false });
})();
// transForm.js
document.addEventListener('DOMContentLoaded', () => {
  const btnStart = document.getElementById('btn-start');
  const systemStatus = document.getElementById('systemStatus');
  const aiStatus = document.getElementById('aiStatus');
  const apiStatus = document.getElementById('apiStatus');
  const activityLog = document.getElementById('activityLog');

  // 初期表示
  [['ai', aiStatus, '準備完了', 'badge-success'],
   ['api', apiStatus, '接続済み', 'badge-success'],
   ['sys', systemStatus, '待機中', 'badge-success']].forEach(([, el, text, klass])=>{
    el.classList.remove('badge-success','badge-info','badge-warning');
    el.classList.add(klass);
    el.textContent = text;
  });

  // === AI分析ドット：バッジの“真下”に置く ===
  const aiStatusItem = aiStatus.closest('.status-item');            // AI分析の項目
  const aiHeader = aiStatusItem.querySelector('.status-header');    // ラベル＋バッジの行

  const aiDotsContainer = document.createElement('div');
  aiDotsContainer.className = 'ai-dots-container';
  const dots = Array.from({length:3}, () => {
    const d = document.createElement('span');
    d.className = 'ai-dot';
    aiDotsContainer.appendChild(d);
    return d;
  });

  // ← ここが肝：同じ .status-item 内で、ヘッダ行の直後に追加（縦に1段下がる）
  aiHeader.insertAdjacentElement('afterend', aiDotsContainer);

  // スタイル（CSSは触らない前提でJS注入）
  const style = document.createElement('style');
  style.textContent = `
    /* ドット行は .status-item の中で右端（=バッジの列）に寄せる */
    .status-item { display: flex; flex-direction: column; }
    .ai-dots-container {
      display: flex;
      justify-content: flex-end;   /* 右寄せ＝バッジ直下に揃う */
      gap: 8px;
      margin-top: .4rem;
      min-height: 12px;
    }
    .ai-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--border); opacity: .5;
      transition: opacity .15s, transform .15s, background-color .15s;
    }
    .ai-dot.on { background: var(--success); opacity: 1; transform: scale(1.2); }
  `;
  document.head.appendChild(style);

  // ドットアニメ制御
  let isRecording = false, timer = null, idx = 0;
  const startDots = () => {
    stopDots(); idx = 0;
    timer = setInterval(() => {
      dots.forEach((d,i)=>d.classList.toggle('on', i===idx));
      idx = (idx+1)%dots.length;
    }, 300);
  };
  const stopDots = () => {
    if (timer) clearInterval(timer);
    dots.forEach(d=>d.classList.remove('on'));
    timer = null;
  };

  // ユーティリティ
  const setBadge = (el, text, colorClass) => {
    el.classList.remove('badge-success','badge-info','badge-warning');
    el.classList.add(colorClass);
    el.textContent = text;
  };
  const addLog = (msg) => {
    if (!activityLog) return;
    const row = document.createElement('div');
    row.className = 'activity-item';
    row.innerHTML = `<span class="activity-time">${new Date().toLocaleTimeString()}</span>
                     <span class="activity-message">${msg}</span>`;
    activityLog.prepend(row);
  };

  // 録画トグル
  btnStart.addEventListener('click', () => {
    isRecording = !isRecording;
    if (isRecording) {
      setBadge(systemStatus, '稼働中', 'badge-info');   // 水色
      setBadge(aiStatus, '稼働中', 'badge-info');       // 水色
      setBadge(apiStatus, '接続済み', 'badge-success'); // 緑
      startDots();
      addLog('録画を開始しました');
    } else {
      setBadge(systemStatus, '待機中', 'badge-success'); // 緑
      setBadge(aiStatus, '準備完了', 'badge-success');   // 緑
      setBadge(apiStatus, '接続済み', 'badge-success');  // 緑
      stopDots();
      addLog('録画を停止しました');
    }
  });
});
