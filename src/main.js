// Application State
const state = {
  isCapturing: false,
  captureCount: 0,
  analyzedCount: 0,
  deletedCount: 0,
  screenshots: [],
  captureInterval: null,
}

// DOM Elements
const elements = {
  startCaptureBtn: document.getElementById("startCaptureBtn"),
  stopCaptureBtn: document.getElementById("stopCaptureBtn"),
  intervalInput: document.getElementById("intervalInput"),
  savePathInput: document.getElementById("savePathInput"),
  browseFolderBtn: document.getElementById("browseFolderBtn"),
  captureCount: document.getElementById("captureCount"),
  analyzedCount: document.getElementById("analyzedCount"),
  deletedCount: document.getElementById("deletedCount"),
  screenshotGallery: document.getElementById("screenshotGallery"),
  refreshGalleryBtn: document.getElementById("refreshGalleryBtn"),
  systemStatus: document.getElementById("systemStatus"),
  aiStatus: document.getElementById("aiStatus"),
  apiStatus: document.getElementById("apiStatus"),
  aiProgress: document.getElementById("aiProgress"),
  aiProgressText: document.getElementById("aiProgressText"),
  activityLog: document.getElementById("activityLog"),
  reportFormat: document.getElementById("reportFormat"),
  reportTitle: document.getElementById("reportTitle"),
  includeImages: document.getElementById("includeImages"),
  includeTimestamps: document.getElementById("includeTimestamps"),
  includeSummary: document.getElementById("includeSummary"),
  generateReportBtn: document.getElementById("generateReportBtn"),
  reportDataCount: document.getElementById("reportDataCount"),
  settingsBtn: document.getElementById("settingsBtn"),
}

// Utility Functions
function formatTime(date) {
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function addActivityLog(message) {
  const time = formatTime(new Date())
  const logItem = document.createElement("div")
  logItem.className = "activity-item"
  logItem.innerHTML = `
    <span class="activity-time">${time}</span>
    <span class="activity-message">${message}</span>
  `
  elements.activityLog.insertBefore(logItem, elements.activityLog.firstChild)

  // Keep only last 10 items
  while (elements.activityLog.children.length > 10) {
    elements.activityLog.removeChild(elements.activityLog.lastChild)
  }
}

function updateStats() {
  elements.captureCount.textContent = state.captureCount
  elements.analyzedCount.textContent = state.analyzedCount
  elements.deletedCount.textContent = state.deletedCount
  elements.reportDataCount.textContent = state.analyzedCount
}

function updateAIProgress() {
  const total = state.captureCount
  const analyzed = state.analyzedCount
  const percentage = total > 0 ? (analyzed / total) * 100 : 0

  elements.aiProgress.style.width = `${percentage}%`
  elements.aiProgressText.textContent = `${analyzed} / ${total}`
}

function renderScreenshots() {
  if (state.screenshots.length === 0) {
    elements.screenshotGallery.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        <p>スクリーンショットがまだありません</p>
        <p class="empty-hint">キャプチャを開始してください</p>
      </div>
    `
    return
  }

  const gridHTML = `
    <div class="screenshot-grid">
      ${state.screenshots
        .map(
          (screenshot) => `
        <div class="screenshot-item" data-id="${screenshot.id}">
          <img src="${screenshot.thumbnail}" alt="Screenshot" class="screenshot-image">
          <div class="screenshot-info">
            <div class="screenshot-time">${screenshot.time}</div>
            <div class="screenshot-status">${screenshot.status}</div>
          </div>
        </div>
      `,
        )
        .join("")}
    </div>
  `

  elements.screenshotGallery.innerHTML = gridHTML
}

// Capture Functions
async function startCapture() {
  console.log("[v0] Starting capture")
  state.isCapturing = true

  elements.startCaptureBtn.style.display = "none"
  elements.stopCaptureBtn.style.display = "flex"
  elements.systemStatus.textContent = "キャプチャ中"
  elements.systemStatus.className = "badge badge-warning"

  addActivityLog("スクリーンショットキャプチャを開始しました")

  const interval = Number.parseInt(elements.intervalInput.value) * 1000

  // Simulate capture
  state.captureInterval = setInterval(() => {
    captureScreenshot()
  }, interval)

  // First capture immediately
  captureScreenshot()
}

function stopCapture() {
  console.log("[v0] Stopping capture")
  state.isCapturing = false

  if (state.captureInterval) {
    clearInterval(state.captureInterval)
    state.captureInterval = null
  }

  elements.startCaptureBtn.style.display = "flex"
  elements.stopCaptureBtn.style.display = "none"
  elements.systemStatus.textContent = "待機中"
  elements.systemStatus.className = "badge badge-success"

  addActivityLog("スクリーンショットキャプチャを停止しました")
}

async function captureScreenshot() {
  console.log("[v0] Capturing screenshot")
  state.captureCount++

  const screenshot = {
    id: Date.now(),
    time: formatTime(new Date()),
    thumbnail: "/screenshot-of-code.png",
    status: "AI分析待ち",
  }

  state.screenshots.unshift(screenshot)
  updateStats()
  renderScreenshots()
  addActivityLog(`スクリーンショットを撮影しました (#${state.captureCount})`)

  // Simulate AI analysis after a delay
  setTimeout(() => analyzeScreenshot(screenshot.id), 2000)
}

async function analyzeScreenshot(id) {
  console.log("[v0] Analyzing screenshot:", id)
  elements.aiStatus.textContent = "分析中"
  elements.aiStatus.className = "badge badge-warning"

  const screenshot = state.screenshots.find((s) => s.id === id)
  if (!screenshot) return

  // Simulate API call
  await new Promise((resolve) => setTimeout(resolve, 3000))

  // Random decision: keep or delete
  const shouldKeep = Math.random() > 0.3

  if (shouldKeep) {
    screenshot.status = "AI分析完了"
    state.analyzedCount++
    addActivityLog(`AI分析完了: 重要な画像として保存されました`)
  } else {
    screenshot.status = "削除済み"
    state.deletedCount++
    addActivityLog(`AI分析完了: 重要でないため削除されました`)

    // Remove from array after a delay
    setTimeout(() => {
      state.screenshots = state.screenshots.filter((s) => s.id !== id)
      renderScreenshots()
    }, 1000)
  }

  updateStats()
  updateAIProgress()
  renderScreenshots()

  elements.aiStatus.textContent = "準備完了"
  elements.aiStatus.className = "badge badge-info"
}

// Report Generation
async function generateReport() {
  console.log("[v0] Generating report")
  const format = elements.reportFormat.value
  const title = elements.reportTitle.value || "レポート"
  const includeImages = elements.includeImages.checked
  const includeTimestamps = elements.includeTimestamps.checked
  const includeSummary = elements.includeSummary.checked

  elements.generateReportBtn.disabled = true
  elements.generateReportBtn.textContent = "レポート生成中..."

  addActivityLog(`レポート生成を開始しました (${format}形式)`)

  // Simulate report generation
  await new Promise((resolve) => setTimeout(resolve, 2000))

  addActivityLog(`レポート生成が完了しました: ${title}.${format}`)

  elements.generateReportBtn.disabled = false
  elements.generateReportBtn.innerHTML = `
    <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
    </svg>
    レポート生成
  `

  alert(
    `レポートが生成されました:\n${title}.${format}\n\n設定:\n- 画像を含める: ${includeImages ? "はい" : "いいえ"}\n- タイムスタンプ: ${includeTimestamps ? "はい" : "いいえ"}\n- AI要約: ${includeSummary ? "はい" : "いいえ"}`,
  )
}

// Event Listeners
elements.startCaptureBtn.addEventListener("click", startCapture)
elements.stopCaptureBtn.addEventListener("click", stopCapture)
elements.browseFolderBtn.addEventListener("click", () => {
  alert("フォルダ選択ダイアログを開きます（デスクトップアプリで実装）")
})
elements.refreshGalleryBtn.addEventListener("click", () => {
  renderScreenshots()
  addActivityLog("ギャラリーを更新しました")
})
elements.generateReportBtn.addEventListener("click", generateReport)
elements.settingsBtn.addEventListener("click", () => {
  alert("設定画面を開きます（今後実装予定）")
})

// Initialize
console.log("[v0] Application initialized")
addActivityLog("システム起動完了")
updateStats()
renderScreenshots()
