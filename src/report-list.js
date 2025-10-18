document.addEventListener('DOMContentLoaded', async () => {
  const listEl = document.getElementById('reportList');
  if (!listEl) {
    console.error('report-list: #reportList element not found');
    return;
  }

  console.log('report-list: init');

  let reports = [];
  try {
    // 可能なら preload 経由で main から報告一覧を取得
    if (window.api && typeof window.api.getReports === 'function') {
      reports = await window.api.getReports();
      console.log('report-list: received reports from api', reports);
    } else {
      console.log('report-list: window.api.getReports not available; using localStorage or mock data');
      const stored = localStorage.getItem('reports');
      if (stored) {
        reports = JSON.parse(stored);
      } else {
        // 開発時に即座に見えるようにするためのサンプルデータ
        reports = [
          { id: 1, title: 'サンプルレポート 1', date: '2025-10-18', path: 'C:\\Reports\\r1.docx' }
        ];
      }
    }
  } catch (err) {
    console.error('report-list: error while loading reports', err);
    reports = [];
  }

  if (!reports || reports.length === 0) {
    listEl.innerHTML = '<div class="empty">過去レポートはありません</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  reports.forEach(r => {
    const item = document.createElement('div');
    item.className = 'report-item';

    const title = document.createElement('div');
    title.className = 'report-title';
    title.textContent = r.title || '無題のレポート';

    const meta = document.createElement('div');
    meta.className = 'report-meta';
    meta.textContent = r.date || '';

    const actions = document.createElement('div');
    actions.className = 'report-actions';

    const openBtn = document.createElement('button');
    openBtn.className = 'btn btn-small';
    openBtn.textContent = '開く';
    openBtn.dataset.path = r.path || '';
    openBtn.addEventListener('click', () => {
      // report-summary.html に遷移する。id と path をクエリパラメータで渡す
      const params = new URLSearchParams();
      if (r.id !== undefined) params.set('id', r.id);
      if (r.path) params.set('path', r.path);
      const url = `report-summary.html?${params.toString()}`;

      // Electron の場合は window.api.openReport を優先して IPC 経由で開く実装があるかも
      if (window.api && typeof window.api.openReport === 'function') {
        // ここではレンダラ上で遷移する方法をとるが、必要なら preload を通じて NewWindow を開く実装にも対応可能
        window.location.href = url;
      } else {
        // ブラウザ／開発環境では直接ページ遷移
        window.location.href = url;
      }
    });

    actions.appendChild(openBtn);

    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(actions);

    frag.appendChild(item);
  });

  listEl.appendChild(frag);
});