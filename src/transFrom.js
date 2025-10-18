/* transForm.js - Report generator (PDF JP font + solid fallback) */
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
    }catch{/*noop*/}
    if(!items.length) return '画像がないため、要約は省略されました。';
    return `スクリーンショット ${items.length} 件を収集しました。代表例: ${items.slice(0,3).map((_,i)=>`#${i+1}`).join(', ')} ...`;
  }

  // ---------- builders (MD/TXT/HTML) ----------
  function buildMarkdown({title,includeImages,includeTimestamps,includeSummary,summary,items}){
    const L=[]; L.push(`# ${title}`,'',`生成時刻: ${new Date().toLocaleString()}`,`画像数: ${items.length}`,'');
    if(includeSummary){ L.push('## 要約','', summary || '（要約なし）',''); }
    if(includeImages && items.length){
      L.push('## スクリーンショット','');
      items.forEach((img,i)=>{ const cap=includeTimestamps&&img.timestamp?`（${img.timestamp}）`:''; L.push(`### 画像 ${i+1} ${cap}`,`![${img.alt}]( ${img.dataURL} )`, ''); });
    }
    return L.join('\n');
  }
  function buildPlainText({title,includeImages,includeTimestamps,includeSummary,summary,items}){
    const L=[]; L.push(`${title}`,`生成時刻: ${new Date().toLocaleString()}`,`画像数: ${items.length}`,'');
    if(includeSummary){ L.push('【要約】', summary || '（要約なし）',''); }
    if(includeImages && items.length){
      L.push('【スクリーンショット】');
      items.forEach((img,i)=>{ const cap=includeTimestamps&&img.timestamp?`（${img.timestamp}）`:''; L.push(`-- 画像 ${i+1} ${cap}`, img.dataURL, ''); });
    }
    return L.join('\n');
  }
  function buildHTML({title,includeImages,includeTimestamps,includeSummary,summary,items}){
    const esc=(s)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const imgs = includeImages ? items.map((img,i)=> {
      const cap = includeTimestamps&&img.timestamp?`（${esc(img.timestamp)}）`:'';
      return `<h3>画像 ${i+1} ${cap}</h3><img src="${img.dataURL}" alt="${esc(img.alt)}" style="max-width:100%;height:auto;display:block;margin:8px 0;" />`;
    }).join('\n') : '';
    const sum = includeSummary ? `<h2>要約</h2><p>${esc(summary||'（要約なし）')}</p>` : '';
    return `<!doctype html>
<html lang="ja"><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;margin:24px;}
  h1{font-size:1.6rem;margin:0 0 12px;} h2{font-size:1.2rem;margin:20px 0 8px;} .meta{color:#666;margin-bottom:12px;}
</style>
<h1>${esc(title)}</h1>
<div class="meta">生成時刻: ${esc(new Date().toLocaleString())} / 画像数: ${items.length}</div>
${sum}
${includeImages?'<h2>スクリーンショット</h2>':''}
${imgs}
</html>`;
  }

  // ---------- PDF（日本語フォント埋め込み + 確実なフォールバック） ----------

  // UTF-8 用の日本語TTF（IPAexGothic）をCORS可のミラーから取得 → jsPDFへ埋め込み
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
      doc.addFileToVFS('IPAexGothic.ttf', b64);              // VFSに登録
      doc.addFont('IPAexGothic.ttf', 'IPAexGothic', 'normal'); // 名称紐付け
      doc.setFont('IPAexGothic', 'normal');                   // 使用指定
      return true;
    }catch{ return false; }
  }

  // HTML断片を作成（フォールバック用：画像化して貼る）
  function buildHTMLFragmentForPDF({ title, includeImages, includeTimestamps, includeSummary, summary, items }) {
    const esc = (s)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const parts=[];
    parts.push(`<div style="font-family: system-ui, -apple-system, 'Noto Sans JP','Yu Gothic','Meiryo',sans-serif; line-height:1.6; padding:0; margin:0;">`);
    parts.push(`<h1 style="font-size:20px;margin:0 0 12px;">${esc(title)}</h1>`);
    parts.push(`<div style="color:#444;margin-bottom:8px;">生成時刻: ${esc(new Date().toLocaleString())} / 画像数: ${items.length}</div>`);
    if (includeSummary){
      parts.push(`<h2 style="font-size:16px;margin:16px 0 6px;">要約</h2>`);
      parts.push(`<div>${esc(summary||'（要約なし）')}</div>`);
    }
    if (includeImages && items.length){
      parts.push(`<h2 style="font-size:16px;margin:16px 0 6px;">スクリーンショット</h2>`);
      items.forEach((img,i)=>{
        const cap=includeTimestamps&&img.timestamp?`（${esc(img.timestamp)}）`:'';
        parts.push(`<h3 style="font-size:14px;margin:12px 0 6px;">画像 ${i+1} ${cap}</h3>`);
        parts.push(`<img src="${img.dataURL}" alt="${esc(img.alt)}" style="max-width:100%;height:auto;display:block;margin:6px 0;" />`);
      });
    }
    parts.push(`</div>`);
    return parts.join('');
  }

  async function buildDOCX({ title, includeImages, includeTimestamps, includeSummary, summary, items }) {
    await loadScript('https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.iife.js');
    const { Document, Packer, Paragraph, HeadingLevel, AlignmentType, ImageRun } = window.docx;
    const children = [
      new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: `生成時刻: ${new Date().toLocaleString()} / 画像数: ${items.length}` }),
    ];
    if(includeSummary){ children.push(new Paragraph({ text:'要約', heading:HeadingLevel.HEADING_2 })); children.push(new Paragraph({ text: summary||'（要約なし）' })); }
    if(includeImages && items.length){
      children.push(new Paragraph({ text:'スクリーンショット', heading:HeadingLevel.HEADING_2 }));
      for(let i=0;i<items.length;i++){
        const img=items[i]; const cap=includeTimestamps&&img.timestamp?`画像 ${i+1} （${img.timestamp}）`:`画像 ${i+1}`;
        children.push(new Paragraph({ text: cap, heading: HeadingLevel.HEADING_3 }));
        const bytes = dataURLtoUint8(img.dataURL);
        const maxW=500; const ratio=img.width?Math.min(1,maxW/img.width):1;
        const w=Math.round((img.width||maxW)*ratio), h=Math.round((img.height||maxW)*ratio);
        children.push(new Paragraph({ alignment: AlignmentType.LEFT, children:[ new ImageRun({ data: bytes, transformation:{ width:w, height:h } }) ] }));
      }
    }
    const doc = new Document({ sections:[{ children }] });
    return await Packer.toBlob(doc);
  }

  // ---- ここが修正ポイント：白紙を確実に回避するPDF生成 ----
  async function buildPDF(pack) {
    // jsPDF本体
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/3.0.3/jspdf.umd.min.js');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'pt', format:'a4', compress:true });
    const page = { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight(), margin: 40 };

    // 1) まずはベクトル文字（日本語フォント埋め込み）で描画
    const fontOK = await attachJPFont(doc); // UTF-8にはカスタムTTFが必要。:contentReference[oaicite:2]{index=2}
    if (fontOK) {
      doc.setFontSize(16); doc.text(pack.title, page.margin, page.margin);
      doc.setFontSize(11); doc.text(`生成時刻: ${new Date().toLocaleString()} / 画像数: ${pack.items.length}`, page.margin, page.margin+18);

      let y = page.margin + 40;
      if (pack.includeSummary) {
        doc.setFontSize(12); doc.text('要約', page.margin, y); y += 16;
        doc.setFontSize(11);
        const split = doc.splitTextToSize(pack.summary || '（要約なし）', page.w - page.margin*2);
        doc.text(split, page.margin, y); y += split.length*14 + 10;
      }
      if (pack.includeImages && pack.items.length) {
        doc.setFontSize(12); doc.text('スクリーンショット', page.margin, y); y += 18;
        for (let i=0;i<pack.items.length;i++){
          const img=pack.items[i];
          const cap = pack.includeTimestamps && img.timestamp ? `画像 ${i+1} （${img.timestamp}）` : `画像 ${i+1}`;
          doc.setFontSize(11); doc.text(cap, page.margin, y); y += 14;
          const maxW = page.w - page.margin*2;
          const imgH = (maxW * (img.height || 9)) / (img.width || 16);
          if (y + imgH + 20 > page.h - page.margin) { doc.addPage(); y = page.margin; }
          const mime = (img.dataURL.split(';')[0].split(':')[1] || '').toUpperCase().includes('JPEG') ? 'JPEG' : 'PNG';
          doc.addImage(img.dataURL, mime, page.margin, y, maxW, imgH, undefined, 'FAST');
          y += imgH + 18;
          if (i < pack.items.length-1 && y > page.h - page.margin - 60) { doc.addPage(); y = page.margin; }
        }
      }
      return doc.output('blob');
    }

    // 2) フォント取得失敗時のフォールバック：
    //    html2canvasで画像化して“確実に”出力（doc.htmlは使わない＝白紙回避）:contentReference[oaicite:3]{index=3}
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');

    // A4のpt→px 換算（96dpi想定）
    const pxPerPt = 96/72;
    const work = document.createElement('div');
    work.style.position = 'fixed';
    work.style.left = '-10000px';
    work.style.top = '0';
    work.style.background = '#ffffff';
    work.style.width = Math.round((page.w - page.margin*2) * pxPerPt) + 'px';
    work.innerHTML = buildHTMLFragmentForPDF(pack);
    document.body.appendChild(work);

    const canvas = await window.html2canvas(work, { backgroundColor:'#ffffff', scale: 2, useCORS: true });
    work.remove();

    // 1枚の巨大画像を、位置シフト手法でマルチページ化（定番レシピ）:contentReference[oaicite:4]{index=4}
    const imgData = canvas.toDataURL('image/png');
    const imgWpt = page.w - page.margin*2;
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
