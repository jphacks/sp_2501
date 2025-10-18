<<<<<<< HEAD
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
=======
// サンプルデータ（実際のアプリケーションではサーバーから取得）
const sampleReports = [
  {
    id: "1",
    title: "作業記録 2024-01-15",
    date: "2024-01-15",
    imageCount: 24,
    duration: "3時間30分",
  },
  {
    id: "2",
    title: "プロジェクトA開発記録",
    date: "2024-01-14",
    imageCount: 18,
    duration: "2時間45分",
  },
  {
    id: "3",
    title: "デザインレビュー記録",
    date: "2024-01-13",
    imageCount: 32,
    duration: "4時間15分",
  },
]

// レポートリストを表示する関数
function renderReportList() {
  const reportListElement = document.getElementById("reportList")

  if (!reportListElement) {
    console.log("[v0] reportList element not found")
    return
  }

  // レポートが存在しない場合
  if (sampleReports.length === 0) {
    reportListElement.innerHTML = `
      <div class="report-list-empty">
        <p>まだレポートが作成されていません</p>
      </div>
    `
    return
  }

  // レポートリストを生成
  reportListElement.innerHTML = sampleReports
    .map(
      (report) => `
    <div class="report-list-item" data-report-id="${report.id}">
      <div class="report-list-item-content">
        <div class="report-list-item-title">${report.title}</div>
        <div class="report-list-item-meta">
          <span>${report.date}</span>
          <span>${report.imageCount}枚</span>
          <span>${report.duration}</span>
        </div>
      </div>
      <svg class="report-list-item-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
      </svg>
    </div>
  `,
    )
    .join("")

  // クリックイベントを追加
  const reportItems = reportListElement.querySelectorAll(".report-list-item")
  reportItems.forEach((item) => {
    item.addEventListener("click", () => {
      const reportId = item.getAttribute("data-report-id")
      openReportSummary(reportId)
    })
  })
}

// レポート詳細画面を開く関数
function openReportSummary(reportId) {
  console.log("[v0] Opening report summary for ID:", reportId)

  // レポートIDをローカルストレージに保存
  localStorage.setItem("currentReportId", reportId)

  // 作業のまとめ画面に遷移
  window.location.href = "report-summary.html"
}

// ページ読み込み時にレポートリストを表示
document.addEventListener("DOMContentLoaded", () => {
  renderReportList()
})

// レポート生成ボタンのイベントリスナー（既存の機能に追加）
const generateReportBtn = document.getElementById("generateReportBtn")
if (generateReportBtn) {
  generateReportBtn.addEventListener("click", () => {
    console.log("[v0] Generate report button clicked")
    // 既存のレポート生成処理の後、リストを更新
    // この部分は既存のコードと統合する必要があります
  })
}
>>>>>>> c989e0c53a7f94d0d27bb9b56e710b020fbb9bf3
