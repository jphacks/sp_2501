// サンプルデータ（実際のアプリケーションではサーバーから取得）
const sampleReportData = {
  "report-2024-01-15": {
    title: "作業記録 2024-01-15",
    date: "2024年1月15日",
    imageCount: 24,
    duration: "3時間30分",
    images: [
      { url: "/login-screen.jpg", time: "10:30", caption: "ログイン画面の実装" },
      { url: "/database-schema.jpg", time: "11:45", caption: "データベース設計" },
      { url: "/dark-mode-ui.jpg", time: "13:20", caption: "ダークモード対応" },
      { url: "/responsive-design.jpg", time: "14:15", caption: "レスポンシブデザイン" },
      { url: "/code-review.jpg", time: "15:30", caption: "コードレビュー" },
      { url: "/testing-pattern.png", time: "16:00", caption: "テスト実行" },
    ],
  },
  "report-2024-01-10": {
    title: "プロジェクトA開発記録",
    date: "2024年1月10日",
    imageCount: 18,
    duration: "2時間45分",
    images: [
      { url: "/general-data-dashboard.png", time: "09:00", caption: "ダッシュボード" },
      { url: "/charts.jpg", time: "10:30", caption: "チャート表示" },
      { url: "/filters.jpg", time: "11:45", caption: "フィルター機能" },
    ],
  },
  "report-2024-01-05": {
    title: "デザインレビュー記録",
    date: "2024年1月5日",
    imageCount: 32,
    duration: "4時間15分",
    images: [
      { url: "/color-palette.jpg", time: "13:00", caption: "カラーパレット" },
      { url: "/typography-collage.png", time: "14:30", caption: "タイポグラフィ" },
      { url: "/accessibility.jpg", time: "16:00", caption: "アクセシビリティ" },
    ],
  },
}

// フォールバックデータ（.mdファイルの読み込みに失敗した場合に使用）
const fallbackMarkdownData = {
  "report-2024-01-15": `# 作業サマリー

## 概要
本日は新機能の実装とバグ修正を中心に作業を行いました。

## 主な作業内容

### 1. ユーザー認証機能の実装
- ログイン画面のUI作成
- Google認証の統合
- セッション管理の実装

### 2. データベース設計
- ユーザーテーブルの設計
- レポートテーブルの設計
- リレーションシップの定義

### 3. バグ修正
- ダークモード切り替え時の表示崩れを修正
- レスポンシブデザインの調整
- パフォーマンスの最適化

## 成果物
- 完成したログイン画面
- データベーススキーマ
- バグ修正レポート

## 次回の予定
- API実装
- テストコードの作成
- ドキュメント整備`,

  "report-2024-01-10": `# プロジェクトA開発記録

## 本日の進捗
プロジェクトAのフロントエンド開発を進めました。

## 実装内容
- ダッシュボード画面の作成
- チャート表示機能
- データフィルタリング機能

## 技術スタック
- React 18
- TypeScript
- Recharts for data visualization
- TailwindCSS for styling

## 課題と解決策
### 課題1: チャートのパフォーマンス
大量のデータポイントを表示する際にパフォーマンスが低下していました。

**解決策**: データのサンプリングとメモ化を実装し、レンダリング速度を改善しました。

### 課題2: レスポンシブ対応
モバイル端末でのチャート表示が最適化されていませんでした。

**解決策**: ビューポートに応じてチャートのサイズと表示項目を動的に調整しました。

## 次のステップ
- ユーザーフィードバックの収集
- A/Bテストの実施
- パフォーマンス監視の設定`,

  "report-2024-01-05": `# デザインレビュー記録

## レビュー内容
UIデザインの最終確認を行いました。

## 確認項目

### 1. カラースキームの統一
- プライマリカラー: #3B82F6
- セカンダリカラー: #8B5CF6
- アクセントカラー: #10B981
- ニュートラルカラー: グレースケール

すべてのコンポーネントで一貫したカラーパレットを使用していることを確認しました。

### 2. タイポグラフィの調整
- 見出し: Inter フォント、太字
- 本文: Inter フォント、通常
- コード: JetBrains Mono フォント

読みやすさとブランドイメージを考慮したフォント選定を行いました。

### 3. アクセシビリティの確認
- **コントラスト比**: WCAG AA基準をすべてクリア
- **キーボードナビゲーション**: すべてのインタラクティブ要素にアクセス可能
- **スクリーンリーダー対応**: 適切なARIAラベルを設定
- **フォーカスインジケーター**: 明確な視覚的フィードバックを提供

## 改善点
- ボタンのホバー状態をより明確に
- フォームのエラーメッセージを視覚的に強調
- ローディング状態のアニメーションを追加

## 承認状況
デザインチームおよびアクセシビリティチームから承認を得ました。`,
}

// マークダウンをHTMLに変換する簡易関数
function parseMarkdown(markdown) {
  let html = markdown

  // 見出し
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>")
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>")
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>")

  // 太字
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")

  // 斜体
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>")

  // リスト
  html = html.replace(/^- (.*$)/gim, "<li>$1</li>")
  html = html.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")

  // 段落
  html = html.replace(/\n\n/g, "</p><p>")
  html = "<p>" + html + "</p>"

  // 空の段落を削除
  html = html.replace(/<p><\/p>/g, "")
  html = html.replace(/<p>(<h[1-6]>)/g, "$1")
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, "$1")
  html = html.replace(/<p>(<ul>)/g, "$1")
  html = html.replace(/(<\/ul>)<\/p>/g, "$1")

  return html
}

async function loadMarkdownFile(reportId) {
  const mdPath = `/reports/${reportId}.md`

  try {
    console.log("[v0] Attempting to load markdown file:", mdPath)
    const response = await fetch(mdPath)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const markdownText = await response.text()
    console.log("[v0] Successfully loaded markdown file")
    return markdownText
  } catch (error) {
    console.warn("[v0] Failed to load markdown file:", error)
    console.log("[v0] Using fallback data instead")

    // フォールバックデータを使用
    if (fallbackMarkdownData[reportId]) {
      return fallbackMarkdownData[reportId]
    }

    // フォールバックデータもない場合
    return `# エラー

マークダウンファイルの読み込みに失敗しました。

## 原因
ブラウザで直接HTMLファイルを開いている場合、セキュリティ制限により外部ファイルを読み込めません。

## 解決方法
以下のいずれかの方法をお試しください：

### 方法1: ローカルサーバーを立ち上げる（推奨）
コマンドプロンプトまたはターミナルで、publicフォルダに移動して以下を実行：

\`\`\`
python -m http.server 8000
\`\`\`

その後、ブラウザで \`http://localhost:8000/demo.html\` を開く

### 方法2: VS Code Live Server拡張機能を使用
1. VS Codeで拡張機能「Live Server」をインストール
2. HTMLファイルを右クリック → 「Open with Live Server」を選択

エラー詳細: ${error.message}`
  }
}

async function loadReportData() {
  const urlParams = new URLSearchParams(window.location.search)
  const reportId = urlParams.get("id") || "report-2024-01-15"
  const reportData = sampleReportData[reportId]

  if (!reportData) {
    console.error("[v0] Report data not found for ID:", reportId)
    return
  }

  console.log("[v0] Loading report data for ID:", reportId)

  // ヘッダー情報を設定
  document.getElementById("reportTitle").textContent = reportData.title
  document.getElementById("reportDate").textContent = reportData.date
  document.getElementById("imageCount").textContent = `${reportData.imageCount}枚の画像`
  document.getElementById("duration").textContent = `作業時間: ${reportData.duration}`

  const markdownText = await loadMarkdownFile(reportId)

  // マークダウンをHTMLに変換して表示
  const summaryContent = document.getElementById("summaryContent")
  summaryContent.innerHTML = parseMarkdown(markdownText)

  // 画像ギャラリーを表示
  renderImageGallery(reportData.images)
}

// 画像ギャラリーを表示
function renderImageGallery(images) {
  const galleryElement = document.getElementById("imageGallery")

  if (images.length === 0) {
    galleryElement.innerHTML = `
      <div class="gallery-empty">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        <p>画像がありません</p>
      </div>
    `
    return
  }

  galleryElement.innerHTML = images
    .map(
      (image, index) => `
    <div class="gallery-item" data-image-index="${index}">
      <img class="gallery-item-image" src="${image.url}" alt="${image.caption}">
      <div class="gallery-item-info">
        <div class="gallery-item-time">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          ${image.time} - ${image.caption}
        </div>
      </div>
    </div>
  `,
    )
    .join("")

  // 画像クリックイベントを追加
  const galleryItems = galleryElement.querySelectorAll(".gallery-item")
  galleryItems.forEach((item) => {
    item.addEventListener("click", () => {
      const imageIndex = Number.parseInt(item.getAttribute("data-image-index"))
      openImageModal(images[imageIndex])
    })
  })
}

// 画像モーダルを開く
function openImageModal(image) {
  const modal = document.getElementById("imageModal")
  const modalImage = document.getElementById("modalImage")
  const modalCaption = document.getElementById("modalCaption")

  modalImage.src = image.url
  modalCaption.textContent = `${image.time} - ${image.caption}`
  modal.classList.add("active")
}

// 画像モーダルを閉じる
function closeImageModal() {
  const modal = document.getElementById("imageModal")
  modal.classList.remove("active")
}

// イベントリスナーの設定
document.addEventListener("DOMContentLoaded", () => {
  // レポートデータを読み込み
  loadReportData()

  // ホームに戻るボタン
  const backButton = document.getElementById("backButton")
  if (backButton) {
    backButton.addEventListener("click", () => {
      window.location.href = "index.html"
    })
  }

  // ダウンロードボタン
  const downloadButton = document.getElementById("downloadButton")
  if (downloadButton) {
    downloadButton.addEventListener("click", () => {
      console.log("[v0] Download button clicked")
      alert("ダウンロード機能は実装中です")
      // 実際のアプリケーションではここでレポートをダウンロード
    })
  }

  // モーダルを閉じる
  const modalClose = document.getElementById("modalClose")
  const modalOverlay = document.getElementById("modalOverlay")

  if (modalClose) {
    modalClose.addEventListener("click", closeImageModal)
  }

  if (modalOverlay) {
    modalOverlay.addEventListener("click", closeImageModal)
  }

  // ESCキーでモーダルを閉じる
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeImageModal()
    }
  })
})
