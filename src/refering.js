// 開発用モック（ブラウザでテストする時のみ）
if (!window.api) {
  window.api = {
    selectFolder: async () => {
      const p = prompt('モック: フォルダパスを入力してください', 'C:\\path\\to\\folder');
      return p ? p : null;
    }
  };
}


document.addEventListener('DOMContentLoaded', () => {

  // 必要なHTML要素を取得します
  const browseFolderBtn = document.getElementById('browseFolderBtn');
  const savePathInput = document.getElementById('savePathInput');

  // browseFolderBtn が存在する場合のみ、イベントリスナーを設定
  if (browseFolderBtn && savePathInput) {
    // クリックハンドラを async にして、結果を同じスコープで扱う
    browseFolderBtn.addEventListener('click', async () => {
      console.log('UI -> Mainへフォルダ選択をリクエスト');

      // window.api.selectFolder の存在チェック
      if (!window.api || typeof window.api.selectFolder !== 'function') {
        console.error('window.api.selectFolder is not available');
        return; // ここで中断（エラーの重複発生を防ぐ）
      }

      try {
        // 非同期で選択ダイアログを開き、戻り値をここで受け取る
        const folderPath = await window.api.selectFolder();

        // フォルダパスが正常に受け取れた場合 (キャンセルされなかった場合)
        if (folderPath) {
          console.log('Main -> UIへ選択されたパスを返信:', folderPath);
          // input要素の値を、受け取ったフォルダパスで更新する
          savePathInput.value = folderPath;
        } else {
          console.log('フォルダ選択がキャンセルされました');
        }
      } catch (err) {
        console.error('フォルダ選択でエラー:', err);
      }
    });
  } else {
    console.error('フォルダ参照ボタンまたは入力欄が見つかりません。');
  }

});

(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);

  // --- 小物 ---
  const blobToDataURL = (blob) =>
    new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(blob);
    });

  function ensureGallery() {
    let g = $('#screenshotGallery');
    if (g) return g;
    g = document.createElement('div');
    g.id = 'screenshotGallery';
    g.style.display = 'none'; // 既存UIの邪魔をしない
    document.body.appendChild(g);
    return g;
  }

  function addLog(msg) {
    const box = $('#activityLog');
    if (!box) return;
    const row = document.createElement('div');
    row.className = 'activity-item';
    row.innerHTML = `<span class="activity-time">${new Date().toLocaleTimeString()}</span>
                     <span class="activity-message">${msg}</span>`;
    box.prepend(row);
  }

  // --- #isCapturing → Markdown テキスト（最小限の対応：h1～h3, p, br, strong/em, ul/ol/li, a）
  function htmlToMarkdown(root) {
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        // テキストは過剰スペースを1個に
        return node.nodeValue.replace(/\s+/g, ' ');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName.toLowerCase();
      const content = Array.from(node.childNodes).map(walk).join('');

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
        case 'ul': return `${Array.from(node.children).map(li => `- ${walk(li)}\n`).join('')}\n`;
        case 'ol': return `${Array.from(node.children).map((li,i)=> `${i+1}. ${walk(li)}\n`).join('')}\n`;
        case 'li': return `${content}`;
        case 'a': {
          const href = node.getAttribute('href') || '';
          return href ? `[${content}](${href})` : content;
        }
        case 'img':
          // 画像はギャラリーへ流す（要約テキストには入れない）
          addImageToGallery(node.getAttribute('src') || '', node.getAttribute('alt') || 'inline');
          return '';
        default:
          return content;
      }
    };

    // 連続空行を整える
    return walk(root).replace(/\n{3,}/g, '\n\n').trim();
  }

  // --- ギャラリー投入（可能なら data:URL 化 → CORS 回避）
  async function addImageToGallery(src, alt = 'inline') {
    if (!src) return;
    const g = ensureGallery();

    // 重複回避
    const exists = [...g.querySelectorAll('img')].some((i) => (i.currentSrc || i.src) === src);
    if (exists) return;

    let finalSrc = src;
    try {
      const resp = await fetch(src, { mode: 'cors' });
      if (resp.ok) {
        const b = await resp.blob();
        finalSrc = await blobToDataURL(b);
      }
    } catch {
      // CORS 等で失敗 → そのまま src を使う（後段でフェイルセーフあり）
    }

    const wrap = document.createElement('div');
    wrap.className = 'thumb';
    const img = new Image();
    img.alt = alt;
    img.src = finalSrc;
    wrap.appendChild(img);
    g.appendChild(wrap);
  }

  // --- #isCapturing の内容を解析して: { markdown, imageCount }
  async function buildFromIsCapturing() {
    const el = $('#isCapturing');
    if (!el) return { markdown: '', imageCount: 0 };

    // 画像をギャラリーへ（逐次追加）
    const imgs = el.querySelectorAll('img');
    for (const im of imgs) {
      await addImageToGallery(im.currentSrc || im.src, im.alt || 'inline');
    }

    // 本文を Markdown 文字列へ
    const md = htmlToMarkdown(el.cloneNode(true));
    return { markdown: md, imageCount: imgs.length };
  }

  // --- /report/summary をローカルでモック（transForm.js がここを叩く）
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

  // --- 「レポート生成」クリック時にも同期しておく（順番の安心感）
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('#generateReportBtn');
    if (btn) buildFromIsCapturing();
  });

  // --- #isCapturing が動的に変わるなら自動追従（MutationObserver）
  const target = $('#isCapturing');
  if (target && 'MutationObserver' in window) {
    const mo = new MutationObserver(() => { buildFromIsCapturing(); });
    mo.observe(target, { childList: true, subtree: true, attributes: true, characterData: true });
  }

  addLog('入力ブロック連携（refering.js）を初期化しました。');
})();
