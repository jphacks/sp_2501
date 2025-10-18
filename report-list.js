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
