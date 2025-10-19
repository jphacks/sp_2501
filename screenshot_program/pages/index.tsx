'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import Image from 'next/image';

// --- サンプル ---
const SAMPLE_REPORTS = [
  { id: 'r1', title: 'サンプルレポート 1', date: '2025-10-18', imageCount: 12, path: './reports/r1.docx' },
  { id: 'r2', title: 'サンプルレポート 2', date: '2025-10-17', imageCount: 8, path: './reports/r2.pdf' },
];
const SAMPLE_ACTIVITY = [
  { time: '09:00:00', action: 'システム起動完了' },
  { time: '09:05:12', action: '設定読み込み' },
];

// ====== Electron preload API 型 ======
type PersonalSettings = {
  interval: number;
  resolution: number | string;
  statusText: string;
  isRecording: boolean;
};
declare global {
  interface Window {
    api?: {
      startRecording: (settings: { interval: number; resolution: number; savePath?: string }) => Promise<any>;
      stopRecording: () => Promise<any>;
      readSettings: () => Promise<PersonalSettings>;
      writeSettings: (obj: Partial<PersonalSettings & { savePath?: string }>) => Promise<{ ok: boolean; error?: string }>;
      getScreenshotStats?: () => Promise<{ totalShots: number; totalSize: number; deletedCount: number }>;
      listScreenshots?: () => Promise<string[]>;
      onSettingsChanged: (cb: (data: any) => void) => () => void;
      closeWindow?: () => Promise<any>;
    };
    html2canvas?: (el: HTMLElement, opts?: any) => Promise<HTMLCanvasElement>;
    jspdf?: any; // jsPDF UMD
    docx?: any;  // docx IIFE
  }
}

// ====== ここから完全統合ユーティリティ ======
const JP_FONT_URLS = [
  'https://ctan.math.washington.edu/tex-archive/fonts/ipaex/ipaexg.ttf',
  'https://mirror.twds.com.tw/CTAN/fonts/ipaex/ipaexg.ttf',
];
let jpFontB64Cache: string | null = null;

async function loadScript(src: string) {
  if (typeof document === 'undefined') return;
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
function downloadBlob(filename: string, mime: string, data: Blob | string) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = filename; a.href = url; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}
function nowStamp() {
  const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function dataURLtoUint8(dataURL: string) {
  const arr = dataURL.split(','), bstr = atob(arr[1] || '');
  const u8 = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
  return u8;
}
async function fetchJPFontB64() {
  if (jpFontB64Cache) return jpFontB64Cache;
  for (const u of JP_FONT_URLS) {
    try {
      const ab = await fetch(u, { mode: 'cors' }).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      });
      const b = new Uint8Array(ab);
      let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      jpFontB64Cache = btoa(s);
      return jpFontB64Cache;
    } catch { /* try next */ }
  }
  return null;
}
async function attachJPFont(doc: any) {
  try {
    const b64 = await fetchJPFontB64();
    if (!b64) return false;
    doc.addFileToVFS('IPAexGothic.ttf', b64);
    doc.addFont('IPAexGothic.ttf', 'IPAexGothic', 'normal'); // jsPDF の VFS 経由フォント登録
    doc.setFont('IPAexGothic', 'normal');
    return true;
  } catch { return false; }
}
function renderPDFMultilineText(doc: any, text: string, x: number, y: number, maxWidth: number, lineH: number) {
  const lines = String(text || '').split(/\r?\n/);
  for (const raw of lines) {
    if (raw === '') { y += lineH; continue; }
    const wrapped = doc.splitTextToSize(raw, maxWidth);
    for (const seg of wrapped) { doc.text(seg, x, y); y += lineH; }
  }
  return y;
}

// #isCapturing 内の <img> を dataURL 化（CORS 許可のみ成功）
async function collectDataImagesFromIsCapturing(rootEl: HTMLElement) {
  const imgs = Array.from(rootEl.querySelectorAll('img')) as HTMLImageElement[];
  const results: Array<{ alt: string; dataURL: string; width?: number; height?: number }> = [];
  for (const img of imgs) {
    const src = img.currentSrc || img.src;
    if (src.startsWith('data:')) {
      results.push({ alt: img.alt || 'img', dataURL: src, width: img.naturalWidth, height: img.naturalHeight });
      continue;
    }
    try {
      const r = await fetch(src, { mode: 'cors' });
      if (r.ok) {
        const b = await r.blob();
        const u = await new Promise<string>((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.readAsDataURL(b); });
        results.push({ alt: img.alt || 'img', dataURL: u, width: img.naturalWidth, height: img.naturalHeight });
        continue;
      }
    } catch {}
    try {
      const i = document.createElement('img') as HTMLImageElement;
      i.crossOrigin = 'anonymous'; i.decoding = 'async'; (i as any).referrerPolicy = 'no-referrer';
      await new Promise<void>((res, rej) => { i.onload = () => res(); i.onerror = rej; i.src = src; });
      const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
      c.getContext('2d')!.drawImage(i, 0, 0);
      const u = c.toDataURL('image/png'); // tainted なら例外
      results.push({ alt: img.alt || 'img', dataURL: u, width: i.naturalWidth, height: i.naturalHeight });
    } catch {
      // CORS 不可の外部 URL は除外（jsPDF/docx に埋め込めないため）
    }
  }
  return results;
}

// ラスタ保険：#isCapturing を1枚スナップ（CORS混在時の最終手段）
async function snapshotIsCapturing(rootEl: HTMLElement) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  const canvas = await window.html2canvas!(rootEl, { useCORS: true, backgroundColor: '#ffffff', scale: 2 });
  return { alt: 'snapshot', dataURL: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

// 要約：バックエンドがあれば利用、なければ #isCapturing の素朴 Markdown
function htmlToMarkdown(root: Node): string {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue || '').replace(/\s+/g, ' ');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const content = Array.from(el.childNodes).map(walk).join('');
    switch (tag) {
      case 'h1': return `# ${content}\n\n`;
      case 'h2': return `## ${content}\n\n`;
      case 'h3': return `### ${content}\n\n`;
      case 'p':  return `${content}\n\n`;
      case 'br': return `\n`;
      case 'strong':
      case 'b':  return `**${content}**`;
      case 'em':
      case 'i':  return `*${content}*`;
      case 'ul': return `${Array.from(el.children).map(li => `- ${walk(li)}\n`).join('')}\n`;
      case 'ol': return `${Array.from(el.children).map((li, i) => `${i + 1}. ${walk(li)}\n`).join('')}\n`;
      case 'li': return `${content}`;
      case 'a': {
        const href = el.getAttribute('href') || '';
        return href ? `[${content}](${href})` : content;
      }
      default: return content;
    }
  };
  return walk(root).replace(/\n{3,}/g, '\n\n').trim();
}
async function getSummaryFromBackendOrLocal(rootEl: HTMLElement) {
  try {
    const r = await fetch('http://127.0.0.1:5001/report/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    if (r.ok) {
      const j = await r.json();
      if (j && typeof j.summary === 'string') return j.summary;
    }
  } catch {}
  return htmlToMarkdown(rootEl.cloneNode(true));
}

// ====== コンポーネント ======
export default function Home() {
  const { data: session, status } = useSession();

  // 設定/状態
  const [intervalMin, setIntervalMin] = useState<number>(5);
  const [resolution, setResolution] = useState<string>('1.0');
  const [statusText, setStatusText] = useState<string>('待機中...');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [loadedSettings, setLoadedSettings] = useState<boolean>(false);
  const [deleteAfterUpload, setDeleteAfterUpload] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem('deleteAfterUpload') === '1'; } catch { return false; }
  });
  const fixedSavePath = './screenshot/';

  const [totalShots, setTotalShots] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return Number(localStorage.getItem('totalShots') || '0');
  });
  const [totalSize, setTotalSize] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return Number(localStorage.getItem('totalSize') || '0');
  });
  const [deletedCount, setDeletedCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return Number(localStorage.getItem('deletedCount') || '0');
  });
  const [activityLog, setActivityLog] = useState<any[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('activityLog');
      if (!raw) { localStorage.setItem('activityLog', JSON.stringify(SAMPLE_ACTIVITY)); return SAMPLE_ACTIVITY; }
      return JSON.parse(raw || '[]');
    } catch { return []; }
  });
  const [previewImages, setPreviewImages] = useState<string[]>([]);

  // ログ追記
  const pushActivity = useCallback((action: string) => {
    try {
      const now = new Date();
      const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const entry = { action, time: ts };
      setActivityLog((prev) => {
        const next = [entry, ...prev].slice(0, 200);
        try { localStorage.setItem('activityLog', JSON.stringify(next)); } catch {}
        return next;
      });
    } catch {}
  }, []);

  // 録画制御
  const handleStart = async () => {
    setStatusText('録画開始中...');
    const settings = { interval: intervalMin, resolution: parseFloat(resolution), savePath: fixedSavePath };
    try {
      if (window.api?.startRecording) {
        const res = await window.api.startRecording(settings);
        setStatusText(res?.status ?? '録画中'); setIsRecording(true); setIsPaused(false);
        pushActivity('録画開始');
      } else {
        setStatusText('（ブラウザ）録画開始（デバッグ）'); setIsRecording(true); setIsPaused(false);
        pushActivity('録画開始(デバッグ)');
      }
    } catch (err: any) {
      setStatusText('開始エラー: ' + (err?.message ?? String(err)));
      try { localStorage.setItem('lastError', String(err)); } catch {}
    }
  };
  const handleStop = async () => {
    setStatusText('停止処理中...');
    try {
      if (window.api?.stopRecording) {
        const res: any = await window.api.stopRecording();
        setStatusText(res?.status ?? '録画停止'); setIsRecording(false); setIsPaused(false);
        pushActivity('録画停止');
        if (res && Array.isArray(res.processedFiles)) {
          const added = res.processedFiles.length;
          const sizeAdded = res.processedFiles.reduce((acc: number, f: any) => acc + (f.size || 0), 0);
          const newShots = totalShots + added;
          const newSize = totalSize + sizeAdded;
          setTotalShots(newShots); setTotalSize(newSize);
          try { localStorage.setItem('totalShots', String(newShots)); localStorage.setItem('totalSize', String(newSize)); } catch {}
        }
      } else {
        setStatusText('（ブラウザ）録画停止（デバッグ）'); setIsRecording(false); setIsPaused(false);
        pushActivity('録画停止(デバッグ)');
      }
    } catch (err: any) {
      setStatusText('停止エラー: ' + (err?.message ?? String(err)));
      try { localStorage.setItem('lastError', String(err)); } catch {}
    }
  };
  const handlePauseOrResume = async () => {
    if (!isRecording) return;
    if (!isPaused) {
      setIsPaused(true); setStatusText('一時停止中'); pushActivity('録画一時停止');
      try { if (window.api?.stopRecording) await window.api.stopRecording(); } catch {}
    } else {
      setIsPaused(false); setStatusText('録画再開'); pushActivity('録画再開');
      try { if (window.api?.startRecording) await window.api.startRecording({ interval: intervalMin, resolution: parseFloat(resolution), savePath: fixedSavePath }); } catch {}
    }
  };

  // ファイル統計
  const refreshFileStats = async () => {
    try {
      if (typeof window !== 'undefined' && typeof window.api?.getScreenshotStats === 'function') {
        const stats: any = await window.api.getScreenshotStats();
        if (stats) {
          if (typeof stats.totalShots === 'number') setTotalShots(stats.totalShots);
          if (typeof stats.totalSize === 'number') setTotalSize(stats.totalSize);
          if (typeof stats.deletedCount === 'number') setDeletedCount(stats.deletedCount);
          return;
        }
      }
      if (window.api?.readSettings) {
        const s: any = await window.api.readSettings();
        if (s) {
          if (typeof s.totalShots === 'number') setTotalShots(s.totalShots);
          if (typeof s.totalSize === 'number') setTotalSize(s.totalSize);
          if (typeof s.deletedCount === 'number') setDeletedCount(s.deletedCount);
        }
      }
    } catch (err) { console.error('refreshFileStats error', err); }
  };

  // 設定ロード
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (window.api?.readSettings) {
          const s = await window.api.readSettings();
          if (!mounted) return;
          if (s) {
            if (typeof s.interval === 'number') setIntervalMin(s.interval);
            if (typeof s.resolution === 'number' || typeof s.resolution === 'string') setResolution(String(s.resolution));
            if (typeof s.statusText === 'string') setStatusText(s.statusText);
            if (typeof s.isRecording === 'boolean') setIsRecording(s.isRecording);
          }
        }
      } catch (err) {
        console.error('readSettings error', err);
        try { localStorage.setItem('lastError', String(err)); } catch {}
      } finally {
        if (mounted) setLoadedSettings(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // AIドット & ダークモード復元
  useEffect(() => {
    const aiDotsEl = typeof document !== 'undefined' ? document.querySelectorAll('.ai-dots .dot') : null;
    if (aiDotsEl && isRecording) aiDotsEl.forEach((d) => d.classList.add('running'));
    else if (aiDotsEl) aiDotsEl.forEach((d) => d.classList.remove('running'));
    try {
      const dark = localStorage.getItem('darkMode') === '1';
      if (dark) document.body.classList.add('dark');
    } catch {}
  }, [isRecording]);

  // 右ペイン「過去のレポート」描画（初期/追加時）
  const renderReportList = useCallback(() => {
    try {
      const rl = document.getElementById('reportList');
      if (!rl) return;
      const stored = localStorage.getItem('reports');
      const reports = stored ? JSON.parse(stored) : SAMPLE_REPORTS;
      rl.innerHTML = reports.map((r: any) => `
        <div class="report-list-item" data-report-id="${r.id}">
          <div class="report-list-item-content">
            <div class="report-list-item-title">${r.title}</div>
            <div class="report-list-item-meta">${r.date} · ${r.imageCount || 0} 枚</div>
          </div>
          <svg class="report-list-item-icon" viewBox="0 0 24 24" width="18" height="18"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
        </div>
      `).join('');
      Array.from(rl.querySelectorAll('.report-list-item')).forEach((el) => {
        el.addEventListener('click', () => {
          const id = el.getAttribute('data-report-id');
          const list = JSON.parse(localStorage.getItem('reports') || '[]');
          const found = (list || []).find((x: any) => x.id === id) || null;
          if (found) alert(`レポートを開く: ${found.title}`);
        });
      });
    } catch (err) { console.error(err); }
  }, []);
  useEffect(() => { renderReportList(); }, [renderReportList]);

  // プレビュー画像取得
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (window.api?.listScreenshots) {
          const imgs = await window.api.listScreenshots();
          if (!mounted) return;
          if (Array.isArray(imgs)) setPreviewImages(imgs.slice(0, 4));
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, [totalShots]);

  // ダークトグルの相互同期
  useEffect(() => {
    const sync = () => {
      try {
        const val = localStorage.getItem('darkMode') === '1';
        const g = document.querySelector('.global-dark-toggle input') as HTMLInputElement | null;
        const r = document.getElementById('myToggle_right') as HTMLInputElement | null;
        const l = document.getElementById('myToggle') as HTMLInputElement | null;
        if (g) g.checked = !!val; if (r) r.checked = !!val; if (l) l.checked = !!val;
      } catch {}
    };
    window.addEventListener('storage', sync); sync();
    return () => window.removeEventListener('storage', sync);
  }, []);

  // 自動保存
  useEffect(() => {
    if (!loadedSettings) return;
    let timer: NodeJS.Timeout | null = null;
    const scheduleSave = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          if (window.api?.writeSettings) {
            await window.api.writeSettings({ interval: intervalMin, resolution: parseFloat(resolution), statusText, isRecording });
          }
        } catch (err) { console.error('writeSettings error', err); }
      }, 500);
    };
    scheduleSave();
    return () => { if (timer) clearTimeout(timer!); };
  }, [intervalMin, resolution, statusText, isRecording, loadedSettings]);

  // 統計 & 削除トグル保存
  useEffect(() => { try { localStorage.setItem('totalShots', String(totalShots)); } catch {} }, [totalShots]);
  useEffect(() => { try { localStorage.setItem('totalSize', String(totalSize)); } catch {} }, [totalSize]);
  useEffect(() => { try { localStorage.setItem('deletedCount', String(deletedCount)); } catch {} }, [deletedCount]);
  useEffect(() => {
    try { localStorage.setItem('deleteAfterUpload', deleteAfterUpload ? '1' : '0'); } catch {}
    (async () => {
      try {
        if (window.api?.writeSettings) {
          await window.api.writeSettings({ interval: intervalMin, resolution: parseFloat(resolution), statusText, isRecording, savePath: fixedSavePath });
        }
      } catch (e) { console.error('writeSettings on deleteAfterUpload change', e); }
    })();
  }, [deleteAfterUpload]);

  // 手動保存
  const handleManualSave = async () => {
    try {
      if (window.api?.writeSettings) {
        const res = await window.api.writeSettings({ interval: intervalMin, resolution: parseFloat(resolution), statusText, isRecording, savePath: fixedSavePath });
        if (res?.ok) setStatusText('設定を保存しました'); else setStatusText('保存失敗: ' + (res?.error ?? 'unknown'));
      }
    } catch (err) { console.error('manual save error', err); setStatusText('保存エラー'); }
  };

  // ====== ここが「完全統合」レポート生成 ======
  const onGenerateReport = useCallback(async () => {
    const includeSummary = (document.getElementById('includeSummary') as HTMLInputElement | null)?.checked ?? true;
    const includeTimestamps = (document.getElementById('includeTimestamps') as HTMLInputElement | null)?.checked ?? true;
    const fmtSel = document.getElementById('reportFormat') as HTMLSelectElement | null;
    const titleEl = document.getElementById('reportTitle') as HTMLInputElement | null;
    const fmt = (fmtSel?.value || 'pdf').toLowerCase(); // docx / pdf / html
    const title = titleEl?.value?.trim() || `作業記録_${nowStamp()}`;
    const btn = document.getElementById('generateReportBtn') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = '生成中...'; }

    try {
      const root = document.getElementById('isCapturing') as HTMLElement | null;
      const items: Array<{ alt: string; dataURL: string; width?: number; height?: number }> = [];
      if (root) items.push(...await collectDataImagesFromIsCapturing(root));
      if (items.length === 0 && root) items.push(await snapshotIsCapturing(root)); // 最低1枚は確保（html2canvas保険）

      const includeImages = true;
      const summary = includeSummary && root ? (await getSummaryFromBackendOrLocal(root)) : '';
      const pack = { title, includeImages, includeTimestamps, includeSummary, summary, items };

      // HTML
      const buildHTML = (p: typeof pack) => {
        const esc = (s: any) => String(s).replace(/[&<>"]/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
        const summaryHTML = p.includeSummary ? `<h2>要約</h2><pre class="summary-text" style="white-space:pre-wrap;font-family:inherit;">${esc(p.summary || '（要約なし）')}</pre>` : '';
        const imagesHTML = p.includeImages && p.items.length
          ? p.items.map((img, i) => `<figure style="margin:12px 0;"><img src="${img.dataURL}" alt="${esc(img.alt)}" style="max-width:100%;height:auto;display:block;" /><figcaption style="color:#666;font-size:.9rem;">画像 ${i + 1}</figcaption></figure>`).join('\n')
          : '';
        return `<!doctype html>
<html lang="ja"><meta charset="utf-8"><title>${esc(p.title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Noto Sans JP","Yu Gothic","Meiryo",sans-serif;line-height:1.6;margin:24px;}h1{font-size:1.6rem;margin:0 0 12px;}h2{font-size:1.2rem;margin:20px 0 8px;}.meta{color:#666;margin-bottom:12px;}</style>
<h1>${esc(p.title)}</h1><div class="meta">生成時刻: ${esc(new Date().toLocaleString())}</div>${summaryHTML}${imagesHTML}</html>`;
      };

      if (fmt === 'html') {
        const html = buildHTML(pack);
        downloadBlob(`${title}.html`, 'text/html;charset=utf-8', html);
      } else if (fmt === 'docx') {
        await loadScript('https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.iife.js');
        const { Document, Packer, Paragraph, HeadingLevel, AlignmentType, ImageRun } = window.docx!;
        const children: any[] = [
          new Paragraph({ text: pack.title, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: `生成時刻: ${new Date().toLocaleString()}` }),
        ];
        if (pack.includeSummary) {
          children.push(new Paragraph({ text: '要約', heading: HeadingLevel.HEADING_2 }));
          String(pack.summary || '（要約なし）').split(/\r?\n/).forEach(line => children.push(new Paragraph({ text: line })));
        }
        for (let i = 0; i < pack.items.length; i++) {
          const img = pack.items[i];
          if (!img.dataURL.startsWith('data:')) continue;
          children.push(new Paragraph({ text: `画像 ${i + 1}`, heading: HeadingLevel.HEADING_3 }));
          const bytes = dataURLtoUint8(img.dataURL);
          const maxW = 500; const ratio = img.width ? Math.min(1, maxW / (img.width as number)) : 1;
          const w = Math.round((img.width || maxW) * ratio), h = Math.round((img.height || maxW) * ratio);
          children.push(new Paragraph({ alignment: AlignmentType.LEFT, children: [new ImageRun({ data: bytes, transformation: { width: w, height: h } })] }));
        }
        const doc = new Document({ sections: [{ children }] });
        const blob = await Packer.toBlob(doc);
        downloadBlob(`${title}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', blob);
      } else if (fmt === 'pdf') {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/3.0.3/jspdf.umd.min.js');
        const { jsPDF } = window.jspdf!;
        const tryVector = async (): Promise<Blob | null> => {
          const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
          const ok = await attachJPFont(doc); // 日本語フォント（VFS経由）
          if (!ok) return null;
          const page = { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight(), margin: 40 };
          const maxW = page.w - page.margin * 2;
          const lineH = 14;
          doc.setFontSize(16); doc.text(pack.title, page.margin, page.margin);
          doc.setFontSize(11); doc.text(`生成時刻: ${new Date().toLocaleString()}`, page.margin, page.margin + 18);
          let y = page.margin + 40;
          if (pack.includeSummary) {
            doc.setFontSize(12); doc.text('要約', page.margin, y); y += 18;
            doc.setFontSize(11);
            y = renderPDFMultilineText(doc, pack.summary || '（要約なし）', page.margin, y, maxW, lineH);
            y += 6;
          }
          for (let i = 0; i < pack.items.length; i++) {
            const img = pack.items[i];
            if (!img.dataURL.startsWith('data:')) continue; // jsPDF addImage は dataURL を想定
            const imgW = maxW;
            const imgH = (img.width && img.height) ? (imgW * (img.height as number) / (img.width as number)) : (imgW * 9 / 16);
            if (y + imgH + 28 > page.h - page.margin) { doc.addPage(); y = page.margin; }
            doc.setFontSize(11); doc.text(`画像 ${i + 1}`, page.margin, y); y += 14;
            const mime = (img.dataURL.split(';')[0].split(':')[1] || '').toUpperCase().includes('JPEG') ? 'JPEG' : 'PNG';
            doc.addImage(img.dataURL, mime, page.margin, y, imgW, imgH, undefined, 'FAST'); // addImage のベースは dataURL
            y += imgH + 14;
          }
          return doc.output('blob');
        };
        const tryRaster = async (): Promise<Blob> => {
          await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
          const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
          const page = { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight(), margin: 40 };
          const maxW = page.w - page.margin * 2;
          const host = document.createElement('div');
          host.style.position = 'fixed'; host.style.left = '-10000px'; host.style.top = '0'; host.style.background = '#fff';
          host.style.width = Math.round(maxW * (96 / 72)) + 'px';
          host.innerHTML = `<div style="font-family: system-ui, -apple-system, 'Noto Sans JP','Yu Gothic','Meiryo',sans-serif; line-height:1.6;">
            <h1 style="font-size:20px;margin:0 0 12px;">${pack.title}</h1>
            <div style="color:#444;margin-bottom:8px;">生成時刻: ${new Date().toLocaleString()}</div>
            ${pack.includeSummary ? `<h2 style="font-size:16px;margin:16px 0 6px;">要約</h2><pre style="white-space:pre-wrap;margin:0;">${pack.summary || '（要約なし）'}</pre>` : ''}
          </div>`;
          document.body.appendChild(host);
          const canvas = await window.html2canvas!(host, { useCORS: true, backgroundColor: '#ffffff', scale: 2 });
          host.remove();
          const imgData = canvas.toDataURL('image/png');
          const imgWpt = maxW, imgHpt = imgWpt * (canvas.height / canvas.width);
          let heightLeft = imgHpt, y = page.margin;
          doc.addImage(imgData, 'PNG', page.margin, y, imgWpt, imgHpt, undefined, 'FAST');
          heightLeft -= (page.h - page.margin * 2);
          while (heightLeft > 0) {
            doc.addPage();
            y = page.margin - (imgHpt - heightLeft);
            doc.addImage(imgData, 'PNG', page.margin, y, imgWpt, imgHpt, undefined, 'FAST');
            heightLeft -= (page.h - page.margin * 2);
          }
          return doc.output('blob');
        };

        let blob = await tryVector();
        if (!blob) blob = await tryRaster();
        downloadBlob(`${title}.pdf`, 'application/pdf', blob);
      } else {
        throw new Error(`未対応の形式: ${fmt}`);
      }

      // 履歴へ追加
      try {
        const stored = localStorage.getItem('reports');
        const reports = stored ? JSON.parse(stored) : SAMPLE_REPORTS.slice();
        const ext = fmt === 'html' ? 'html' : fmt === 'docx' ? 'docx' : 'pdf';
        reports.unshift({
          id: `r${Date.now()}`,
          title,
          date: new Date().toISOString().slice(0, 10),
          path: `./reports/${Date.now()}.${ext}`,
          imageCount: (pack.items || []).length,
        });
        localStorage.setItem('reports', JSON.stringify(reports));
        renderReportList();
        setStatusText(`レポート(${fmt.toUpperCase()})を生成しました`);
      } catch {}
    } catch (err: any) {
      alert(`レポート生成に失敗しました: ${err?.message || String(err)}`);
    } finally {
      if (btn) { btn.textContent = 'レポート生成'; btn.disabled = false; }
      pushActivity('レポート生成処理を実行しました');
    }
  }, [pushActivity, renderReportList, intervalMin, resolution, statusText, isRecording]);

  // ====== 画面レンダリング ======
  if (status === 'loading') {
    return (<main><p>セッション情報を読み込み中です...</p></main>);
  }

  if (session) {
    const userName = session.user?.name || 'TEMP_USER';
    return (
      <main className="main-content">
        <header className="header">
          <div className="container">
            <div className="header-content">
              <div className="header-left">
                <div className="logo">
                  <svg className="logo-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" width={28} height={28}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="header-title">
                  <h1>Screen Capture AI</h1>
                  <p>自動スクリーンショット＆AI分析システム</p>
                </div>
              </div>

              <div className="header-right">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600 }}>{userName}</div>
                    <div className="muted">{session.user?.email}</div>
                  </div>
                  {session.user?.image && (<Image src={session.user.image} alt="Profile" width={48} height={48} style={{ borderRadius: '50%' }} />)}
                </div>

                <div style={{ backgroundColor: '#333333', width: '1px', height: '60px', margin: '0 12px', border: '1px solid #333' }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <p style={{ margin: 0, display: 'flex' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Zm0-80q88 0 158-48.5T740-375q-20 5-40 8t-40 3q-123 0-209.5-86.5T364-660q0-20 3-40t8-40q-78 32-126.5 102T200-480q0 116 82 198t198 82Zm-10-270Z"/></svg>
                  </p>
                  <label className="toggle-switch">
                    <input type="checkbox" id="myToggle_right" onChange={(e) => {
                      try { localStorage.setItem('darkMode', e.target.checked ? '1' : '0'); } catch {}
                      document.body.classList.toggle('dark', e.target.checked);
                    }} defaultChecked={typeof window !== 'undefined' && localStorage.getItem('darkMode') === '1'} />
                    <span className="slider"></span>
                  </label>
                </div>

                <div style={{ backgroundColor: '#333333', width: '1px', height: '60px', margin: '0 12px', border: '1px solid #333' }} />
                <div style={{ display: 'flex' }}>
                  <div>
                    <button onClick={() => signOut()} className="logout-btn select" style={{ width: '50px', height: '50px', alignItems: 'center' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" height="30px" viewBox="0 -960 960 960" width="30px" fill="#1f1f1f"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h280v80H200Zm440-160-55-58 102-102H360v-80h327L585-622l55-58 200 200-200 200Z"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="container">
<<<<<<< HEAD
          <div className="grid" style={{ display: 'flex', gap: 20 }}>
            {/* 左カラム */}
=======
          <div className="grid" style={{ display: 'flex', gap: 20, maxWidth: '1900px', margin: '0 auto' }}>

>>>>>>> 3e560c23137fdf0e4f7feb95c5d69a93f4db3bbd
            <div className="col-left" style={{ flex: '0 0 68%' }}>
              <section className="card" style={{ minHeight: 900 }}>
                <div className="yoko yoko-left">
                  <div className="card-header">
                    <h3>自動スクリーンショット設定</h3><h2 className="card-title" id="capture_seigyo"></h2>
                  </div>
                  <div className="card-content">
                    <div className="control-section">
                      <div className="form-group">
                        <label htmlFor="interval">キャプチャ制御の撮影間隔（秒）:</label>
                        <select className="select" id="interval" value={intervalMin} onChange={(e) => setIntervalMin(Number(e.target.value))}>
                          <option value={5}>5秒</option><option value={15}>15秒</option><option value={30}>30秒</option>
                          <option value={60}>1分</option><option value={180}>3分</option><option value={300}>5分</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="resolution">解像度スケール:</label>
                        <select className="select" id="resolution" value={resolution} onChange={(e) => setResolution(e.target.value)}>
                          <option value="1.0">100% (フル解像度)</option>
                          <option value="0.75">75%</option>
                          <option value="0.5">50%</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>保存先パス:</label>
                        <input className="select" type="text" value={fixedSavePath} readOnly />
                      </div>

                      {/* 単一トグル: 開始/停止 */}
                      <div className="form-group controls-row" style={{ display: 'flex', gap: 12 }}>
                        <button
                          onClick={async () => { try { if (!isRecording) await handleStart(); else await handleStop(); } catch (e) { console.error(e); } }}
                          className={`control-btn start-stop-btn ${isRecording ? 'recording' : 'idle'}`}
                          style={{ flex: '1 1 100%', padding: '10px 16px', fontSize: 16, color: '#fff', backgroundColor: isRecording ? '#c4302b' : '#2e9b2e', border: 'none', borderRadius: 6 }}
                        >
                          {!isRecording ? '録画開始' : '録画停止'}
                        </button>
                      </div>

                      <div className="stats-grid" style={{ marginTop: 12, display: 'flex', gap: 12 }}>
                        <div className="stat-card" style={{ flex: 1 }}><div className="stat-label">合計撮影枚数</div><div className="stat-value" id="captureCount">{totalShots}</div></div>
                        <div className="stat-card" style={{ flex: 1 }}><div className="stat-label">合計写真サイズ</div><div className="stat-value" id="analyzedCount">{totalSize}</div></div>
                        <div className="stat-card" style={{ flex: 1 }}><div className="stat-label">削除済み</div><div className="stat-value" id="deletedCount">{deletedCount}</div></div>
                      </div>
                    </div>
                  </div>

                  <div className="input-container" style={{ marginTop: 12 }}>
                    <div id="isCapturing">
                      {previewImages.length > 0 ? (
                        previewImages.map((d, i) => (<img key={i} width={100} height={80} src={d} alt={`shot-${i}`} style={{ marginRight: 6 }} />))
                      ) : (
                        <div style={{ color: '#888' }}>スクリーンショットがまだありません</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="yoko yoko-right">
                  <div className="card-header"><h4>アクティビティログ</h4></div>
                  <div className="card-content">
                    <div className="activity-log">
                      <div className="activity-list" id="activityLog" style={{ marginTop: 8, overflow: 'auto', maxHeight: `450px` }}>
                        {activityLog.map((a, idx) => (
                          <div className="activity-item" key={idx}>
                            <span className="activity-time">{a.time}</span>
                            <span className="activity-message" style={{ marginLeft: 8 }}>{a.action}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="ai-dots" style={{ marginTop: 8 }}>
                      <span className="dot" /><span className="dot" /><span className="dot" />
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* 右カラム */}
            <div className="col-right" style={{ flex: '1 1 32%' }}>
              <section className="card yoko">
                <div className="card-header"><h4>レポート生成</h4></div>
                <div className="card-content">
                  <div className="report-section">
                    <div style={{ marginBottom: 10 }}>
                      <p style={{ marginBottom: 6 }}>送信後のスクリーンショットを削除</p>
                      <label className="toggle-switch">
                        <input type="checkbox" id="deleteAfterUploadToggle" checked={deleteAfterUpload} onChange={(e) => {
                          try { const v = e.target.checked; setDeleteAfterUpload(v); localStorage.setItem('deleteAfterUpload', v ? '1' : '0'); } catch {}
                        }} />
                        <span className="slider"></span>
                      </label>
                    </div>

                    <div className="form-group">
                      <label htmlFor="reportFormat">出力形式</label>
                      <select id="reportFormat" className="select">
                        <option value="docx">Word文書 (.docx)</option>
                        <option value="pdf">PDF (.pdf)</option>
                        <option value="html">HTML (.html)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="reportTitle">レポートタイトル</label>
                      <input type="text" id="reportTitle" className="input" placeholder="例: 作業記録 2025-10-19" />
                    </div>

                    <div className="checkbox-group">
                      <label className="checkbox-label"><input type="checkbox" id="includeTimestamps" defaultChecked /> <span>タイムスタンプを含める</span></label>
                      <label className="checkbox-label"><input type="checkbox" id="includeSummary" defaultChecked /> <span>AI要約を含める</span></label>
                    </div>

                    <button className="btn btn-primary btn-large btn-full" id="generateReportBtn" onClick={onGenerateReport}>
                      レポート生成
                    </button>
                  </div>
                </div>
              </section>

              <section className="card">
                <div className="card-header"><h4>過去のレポート</h4></div>
                <div className="card-content">
                  <div className="report-list" id="reportList"></div>
                </div>
              </section>
            </div>
          </div>
        </div>

        {/* AIドット用の最小CSS */}
        <style jsx global>{`
          .ai-dots .dot { width:8px; height:8px; border-radius:50%; background:#7dd3fc; opacity:.4; transition:opacity .18s, transform .18s; display:inline-block; margin-left:6px; }
          .ai-dots .dot.running { animation: aiPulse 0.9s infinite; }
          @keyframes aiPulse { 0% {opacity:.3; transform:scale(.9);} 33% {opacity:1; transform:scale(1.1);} 100% {opacity:.3; transform:scale(.9);} }
        `}</style>
      </main>
    );
  }

  // 未ログイン画面
  return (
    <main style={{ padding: '2rem' }}>
      <div className="login-container">
        <button className="close-button" id="closeButton" aria-label="閉じる" onClick={async () => {
          try { if (window.api?.closeWindow) { await window.api.closeWindow(); return; } } catch {}
          if (typeof window !== 'undefined' && window.close) window.close();
        }}>×</button>

        <div className="login-header"><h1>ログイン</h1><p>Screen Capture AIへようこそ</p></div>

        <button className="google-login-button" id="googleLoginButton" onClick={() => signIn('google')}>
          <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Googleでログイン
        </button>

        <div className="divider"><span>安全なログイン</span></div>
        <div className="info-text">ログインすることで、<a href="#">利用規約</a>と<a href="#">プライバシーポリシー</a>に同意したものとみなされます。</div>
      </div>

      <div className="global-dark-toggle">
        <label>
          <input type="checkbox" onChange={(e) => {
            try { localStorage.setItem('darkMode', e.target.checked ? '1' : '0'); } catch {}
            document.body.classList.toggle('dark', e.target.checked);
          }} defaultChecked={typeof window !== 'undefined' && localStorage.getItem('darkMode') === '1'} />
          <span style={{ marginLeft: 8 }}>ダークモード</span>
        </label>
      </div>
    </main>
  );
}
