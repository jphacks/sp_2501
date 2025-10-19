import { useState, useEffect } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import Image from 'next/image'

// --- 샘플 데이터 (파일 최상단에 위치) ---
const SAMPLE_REPORTS = [
  { id: 'r1', title: 'サンプルレポート 1', date: '2025-10-18', imageCount: 12, path: './reports/r1.docx' },
  { id: 'r2', title: 'サンプルレポート 2', date: '2025-10-17', imageCount: 8, path: './reports/r2.pdf' }
]

const SAMPLE_ACTIVITY = [
  { time: '09:00:00', action: 'システム起動完了' },
  { time: '09:05:12', action: '設定読み込み' }
]

// 개인 설정 타입 및 preload에서 노출된 API 타입 선언
type PersonalSettings = {
  interval: number
  resolution: number | string
  statusText: string
  isRecording: boolean
}

  declare global {
  interface Window {
    api?: {
      // interval: in minutes; savePath optional
      startRecording: (settings: { interval: number; resolution: number; savePath?: string }) => Promise<any>
      stopRecording: () => Promise<any>
      readSettings: () => Promise<PersonalSettings>
      writeSettings: (obj: Partial<PersonalSettings & { savePath?: string }>) => Promise<{ ok: boolean; error?: string }>
      // optional stats helper exposed by preload: { totalShots, totalSize, deletedCount }
      getScreenshotStats?: () => Promise<{ totalShots: number; totalSize: number; deletedCount: number }>
      listScreenshots?: () => Promise<string[]>
      onSettingsChanged: (cb: (data: any) => void) => () => void
      closeWindow?: () => Promise<any>
    }
  }
}

export default function Home() {
  const { data: session, status } = useSession()

  // 분 단위 인터벌로 동작
  const [intervalMin, setIntervalMin] = useState<number>(5) // value is in seconds
  const [resolution, setResolution] = useState<string>('1.0')
  const [statusText, setStatusText] = useState<string>('待機中...')
  const [isRecording, setIsRecording] = useState<boolean>(false)
  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [loadedSettings, setLoadedSettings] = useState<boolean>(false)
  // 전송 후 삭제 여부 (UI 토글로 컨트롤). 기본은 로컬스토리지 또는 false
  const [deleteAfterUpload, setDeleteAfterUpload] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try { return localStorage.getItem('deleteAfterUpload') === '1' } catch (e) { return false }
  })

  // 고정 저장 경로 (편집 불가)
  // 루트 폴더 기준의 상대 경로 표기(최종 경로: ./screenshot/)
  const fixedSavePath = './screenshot/'

  // 카운트 변수: 합계촬영매수, 합계사진사이즈, 삭제(저장)매수
  const [totalShots, setTotalShots] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    return Number(localStorage.getItem('totalShots') || '0')
  })
  const [totalSize, setTotalSize] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    return Number(localStorage.getItem('totalSize') || '0')
  })
  const [deletedCount, setDeletedCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    return Number(localStorage.getItem('deletedCount') || '0')
  })
  const [activityLog, setActivityLog] = useState<any[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem('activityLog')
      if (!raw) {
        localStorage.setItem('activityLog', JSON.stringify(SAMPLE_ACTIVITY))
        return SAMPLE_ACTIVITY
      }
      return JSON.parse(raw || '[]')
    } catch (e) { return [] }
  })

  // preview images from local screenshot folder (data URLs). Show latest 4.
  const [previewImages, setPreviewImages] = useState<string[]>([])

  // activity list display height is fixed to 200px (no user input)
  const FIXED_ACTIVITY_LOG_HEIGHT = 200

  // NOTE: do not return early here; hooks below must run on every render

  const pushActivity = (action: string) => {
    try {
      const now = new Date()
      const hh = String(now.getHours()).padStart(2, '0')
      const mm = String(now.getMinutes()).padStart(2, '0')
      const ss = String(now.getSeconds()).padStart(2, '0')
      const ts = `${hh}:${mm}:${ss}` // 24時間表記
      const entry = { action, time: ts }
      setActivityLog((prev) => {
        const next = [entry, ...prev].slice(0, 200)
        try { localStorage.setItem('activityLog', JSON.stringify(next)) } catch (e) {}
        return next
      })
    } catch (e) {
      // ローカルストレージが使えない場合は無視
    }
  }

  const handleStart = async () => {
    setStatusText('録画開始中...')
    const settings = { interval: intervalMin, resolution: parseFloat(resolution), savePath: fixedSavePath }
    try {
      if (typeof window !== 'undefined' && window.api?.startRecording) {
        const res = await window.api.startRecording(settings)
        setStatusText(res?.status ?? '録画中')
        setIsRecording(true)
        setIsPaused(false)
        pushActivity('録画開始')
      } else {
    // debug log removed
        setStatusText('（ブラウザ）録画開始（デバッグ）')
        setIsRecording(true)
        setIsPaused(false)
        pushActivity('録画開始(デバッグ)')
      }
    } catch (err: any) {
      setStatusText('開始エラー: ' + (err?.message ?? String(err)))
      try { localStorage.setItem('lastError', String(err)) } catch (_) {}
    }
  }

  const handleStop = async () => {
    setStatusText('停止処理中...')
    try {
      if (typeof window !== 'undefined' && window.api?.stopRecording) {
        const res: any = await window.api.stopRecording()
        setStatusText(res?.status ?? '録画停止')
        setIsRecording(false)
        setIsPaused(false)
        pushActivity('録画停止')

        // もし processedFiles 정보가 있다면 카운트를 업데이트
        if (res && Array.isArray(res.processedFiles)) {
          const added = res.processedFiles.length
          const sizeAdded = res.processedFiles.reduce((acc: number, f: any) => acc + (f.size || 0), 0)
          const newShots = totalShots + added
          const newSize = totalSize + sizeAdded
          setTotalShots(newShots)
          setTotalSize(newSize)
          try {
            localStorage.setItem('totalShots', String(newShots))
            localStorage.setItem('totalSize', String(newSize))
          } catch (e) {}
        }
      } else {
  // debug log removed
        setStatusText('（ブラウザ）録画停止（デバッグ）')
        setIsRecording(false)
        setIsPaused(false)
        pushActivity('録画停止(デバッグ)')
      }
    } catch (err: any) {
      setStatusText('停止エラー: ' + (err?.message ?? String(err)))
      try { localStorage.setItem('lastError', String(err)) } catch (_) {}
    }
  }

  const handlePauseOrResume = async () => {
    // UI상으로는 일시정지/재개 전환. 실제 백엔드에서 지원하지 않으면 stop/start로 에뮬레이트
    if (!isRecording) return
    if (!isPaused) {
      // 일시정지
      setIsPaused(true)
      setStatusText('一時停止中')
      pushActivity('録画一時停止')
      // 가능하다면 stop 호출
      try {
        if (typeof window !== 'undefined' && window.api?.stopRecording) {
          await window.api.stopRecording()
        }
      } catch (e) { console.error(e) }
    } else {
      // 재개
      setIsPaused(false)
      setStatusText('録画再開')
      pushActivity('録画再開')
      try {
        if (typeof window !== 'undefined' && window.api?.startRecording) {
          await window.api.startRecording({ interval: intervalMin, resolution: parseFloat(resolution), savePath: fixedSavePath })
        }
      } catch (e) { console.error(e) }
    }
  }

  // 스크린샷 폴더 통계를 불러와 상태를 갱신 (Electron preload의 API를 우선 사용)
  const refreshFileStats = async () => {
    try {
      // 우선적으로 preload의 getScreenshotStats API를 사용
      if (typeof window !== 'undefined' && typeof window.api?.getScreenshotStats === 'function') {
        const stats: any = await window.api.getScreenshotStats()
        if (stats) {
          if (typeof stats.totalShots === 'number') setTotalShots(stats.totalShots)
          if (typeof stats.totalSize === 'number') setTotalSize(stats.totalSize)
          if (typeof stats.deletedCount === 'number') setDeletedCount(stats.deletedCount)
          return
        }
      }

      // 대체: readSettings에 통계가 포함되어 있는지 확인
      if (typeof window !== 'undefined' && typeof window.api?.readSettings === 'function') {
        const s = await window.api.readSettings()
        if (s && (s as any).totalShots !== undefined) {
          const ss: any = s
          if (typeof ss.totalShots === 'number') setTotalShots(ss.totalShots)
          if (typeof ss.totalSize === 'number') setTotalSize(ss.totalSize)
          if (typeof ss.deletedCount === 'number') setDeletedCount(ss.deletedCount)
        }
      }
    } catch (err) {
      console.error('refreshFileStats error', err)
    }
  }

  // settings를 로드 (preload가 제공되면) — 마운트 시 1회
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        if (typeof window !== 'undefined' && window.api?.readSettings) {
          const s = await window.api.readSettings()
          if (!mounted) return
          if (s) {
            if (typeof s.interval === 'number') setIntervalMin(s.interval)
            if (typeof s.resolution === 'number' || typeof s.resolution === 'string') setResolution(String(s.resolution))
            if (typeof s.statusText === 'string') setStatusText(s.statusText)
            if (typeof s.isRecording === 'boolean') setIsRecording(s.isRecording)
          }
        }
      } catch (err) {
        console.error('readSettings error', err)
        try { localStorage.setItem('lastError', String(err)) } catch (_) {}
      } finally {
        if (mounted) setLoadedSettings(true)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  // 마운트 시 다크모드 로드 및 activity log 동기화
  useEffect(() => {
    // AI 도트 제어: 녹화 중일 때 ai-dots.running 클래스를 토글
    const aiDotsEl = typeof document !== 'undefined' ? document.querySelectorAll('.ai-dots .dot') : null
    if (aiDotsEl && isRecording) {
      aiDotsEl.forEach((d, i) => { d.classList.add('running') })
    } else if (aiDotsEl) {
      aiDotsEl.forEach((d) => { d.classList.remove('running') })
    }
    try {
      const dark = typeof window !== 'undefined' && localStorage.getItem('darkMode') === '1'
      if (dark) document.body.classList.add('dark')
    } catch (e) {}
    // activityLog state는 lazy init에서 로드되므로 추가 동기화는 필요하지 않음
  }, [])

  // no-op: fixed activity log height

  // 마운트 후 DOM 조작: generate report 버튼 바인딩 및 리포트 리스트 렌더링
  useEffect(() => {
    try {
      const btn = document.getElementById('generateReportBtn')
      if (btn) btn.addEventListener('click', handleGenerateReportLocal)

      // reportList 렌더링
      const rl = document.getElementById('reportList')
      if (rl) {
        const stored = localStorage.getItem('reports')
        const reports = stored ? JSON.parse(stored) : SAMPLE_REPORTS
        rl.innerHTML = reports.map((r:any) => `
          <div class="report-list-item" data-report-id="${r.id}">
            <div class="report-list-item-content">
              <div class="report-list-item-title">${r.title}</div>
              <div class="report-list-item-meta">${r.date} · ${r.imageCount || 0} 枚</div>
            </div>
            <svg class="report-list-item-icon" viewBox="0 0 24 24" width="18" height="18"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          </div>
        `).join('')

        // 클릭 이벤트
        Array.from(rl.querySelectorAll('.report-list-item')).forEach(el => {
          el.addEventListener('click', () => {
            const id = el.getAttribute('data-report-id')
            const reports = JSON.parse(localStorage.getItem('reports') || '[]')
            const found = (reports || []).find((x:any) => x.id === id) || null
            if (found) {
              alert(`レポートを開く: ${found.title}`)
            }
          })
        })
      }
    } catch (err) { console.error(err) }
    return () => {
      try { const btn = document.getElementById('generateReportBtn'); if (btn) btn.removeEventListener('click', handleGenerateReportLocal) } catch(e){}
    }
  }, [])

  // load preview images from preload API (if available)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        if (typeof window !== 'undefined' && window.api?.listScreenshots) {
          const imgs = await window.api.listScreenshots()
          if (!mounted) return
          if (Array.isArray(imgs)) {
            setPreviewImages(imgs.slice(0, 4))
          }
        }
      } catch (e) {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [totalShots])

  // 다크 토글 동기화: 글로벌과 우측 토글 서로 상태 반영
  useEffect(() => {
    const syncToggles = () => {
      try {
        const val = localStorage.getItem('darkMode') === '1'
        const g = document.querySelector('.global-dark-toggle input') as HTMLInputElement | null
        const r = document.getElementById('myToggle_right') as HTMLInputElement | null
        const l = document.getElementById('myToggle') as HTMLInputElement | null
        if (g) g.checked = !!val
        if (r) r.checked = !!val
        if (l) l.checked = !!val
      } catch (e) {}
    }
    window.addEventListener('storage', syncToggles)
    syncToggles()
    return () => window.removeEventListener('storage', syncToggles)
  }, [])

  // 카운트 값이 변경되면 localStorage에 저장
  useEffect(() => { try { localStorage.setItem('totalShots', String(totalShots)) } catch (e) {} }, [totalShots])
  useEffect(() => { try { localStorage.setItem('totalSize', String(totalSize)) } catch (e) {} }, [totalSize])
  useEffect(() => { try { localStorage.setItem('deletedCount', String(deletedCount)) } catch (e) {} }, [deletedCount])

  // 변경사항 자동 저장 (디바운스). loadedSettings가 true일 때만 저장 시작
  useEffect(() => {
    if (!loadedSettings) return
    let timer: NodeJS.Timeout | null = null
    const scheduleSave = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(async () => {
        try {
          if (typeof window !== 'undefined' && window.api?.writeSettings) {
            await window.api.writeSettings({ interval: intervalMin, resolution: parseFloat(resolution), statusText, isRecording })
          }
        } catch (err) {
          console.error('writeSettings error', err)
        }
      }, 500)
    }

    scheduleSave()

    return () => {
      if (timer) clearTimeout(timer!)
    }
  }, [intervalMin, resolution, statusText, isRecording, loadedSettings])

  // 수동 저장 버튼 핸들러
  const handleManualSave = async () => {
    try {
    if (typeof window !== 'undefined' && window.api?.writeSettings) {
      const res = await window.api.writeSettings({ interval: intervalMin, resolution: parseFloat(resolution), statusText, isRecording, savePath: fixedSavePath })
        if (res?.ok) setStatusText('設定を保存しました')
        else setStatusText('保存失敗: ' + (res?.error ?? 'unknown'))
      }
    } catch (err) {
      console.error('manual save error', err)
      setStatusText('保存エラー')
    }
  }

  // 로컬 레포트 생성(샘플 데이터 기반) - 실제 서버 호출 대신 로컬샘플을 사용
  const handleGenerateReportLocal = () => {
    try {
      const stored = localStorage.getItem('reports')
      const reports = stored ? JSON.parse(stored) : SAMPLE_REPORTS.slice()
      const newReport = { id: `r${Date.now()}`, title: `手動レポート ${new Date().toLocaleString()}`, date: new Date().toISOString().slice(0,10), path: `./reports/${Date.now()}.html` }
      reports.unshift(newReport)
      localStorage.setItem('reports', JSON.stringify(reports))
      setStatusText('レポートを生成しました')
    } catch (err) {
      console.error('generate report local error', err)
      setStatusText('レポート生成エラー')
    }
  }

  // 파일 변경 감시: preload가 제공하는 콜백 등록
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api?.onSettingsChanged) return
    const off = window.api.onSettingsChanged(async () => {
      try {
        const s = await window.api.readSettings()
        if (s) {
          setIntervalMin(s.interval)
          setResolution(String(s.resolution))
          setStatusText(s.statusText)
          setIsRecording(s.isRecording)
          // 설정 변경 시 통계도 갱신
          try { await refreshFileStats() } catch(e) { console.error(e) }
        }
      } catch (err) {
        console.error('onSettingsChanged read error', err)
      }
    })
    return () => off()
  }, [loadedSettings])

  // 마운트 시 파일 통계 로드
  useEffect(() => {
    try { refreshFileStats() } catch (e) { console.error(e) }
  }, [])

  // deleteAfterUpload 값이 변경되면 로컬스토리지에 저장하고 preload에 writeSettings 요청
  useEffect(() => {
    try {
      localStorage.setItem('deleteAfterUpload', deleteAfterUpload ? '1' : '0')
    } catch (e) {}
    ;(async () => {
      try {
        if (typeof window !== 'undefined' && window.api?.writeSettings) {
          await window.api.writeSettings({ interval: intervalMin, resolution: parseFloat(resolution), statusText, isRecording, savePath: fixedSavePath })
        }
      } catch (e) { console.error('writeSettings on deleteAfterUpload change', e) }
    })()
  }, [deleteAfterUpload])

  // 로딩 상태는 hooks가 선언된 이후에 처리해야 함
  if (status === 'loading') {
    return (
      <main>
        <p>セッション情報を読み込み中です...</p>
      </main>
    )
  }

  if (session) {
    const userName = session.user?.name || 'TEMP_USER'
    return (
      <main className="main-content">
        <header className="header">
          <div className="container">
            <div className="header-content">
              <div className="header-left">
                <div className="logo">
                  <svg className="logo-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="28" height="28">
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
                  {session.user?.image && (
                    <Image src={session.user.image} alt="Profile" width={48} height={48} style={{ borderRadius: '50%' }} />
                  )}
                </div>



               <div style={{ backgroundColor: '#333333', width: "1px", height: "60px", margin: "0 12px" , border: '1px solid #333'}}></div>



                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>

<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    
    {/* 余分な <div> を削除し、<p> と <label> を
      直接 Flexboxコンテナの子要素にします。
    */}
    <p style={{ margin: 0, display: 'flex' }}> {/* スタイルを少し調整 */}
        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Zm0-80q88 0 158-48.5T740-375q-20 5-40 8t-40 3q-123 0-209.5-86.5T364-660q0-20 3-40t8-40q-78 32-126.5 102T200-480q0 116 82 198t198 82Zm-10-270Z"/></svg>
    </p>

    <label className="toggle-switch">
        <input type="checkbox" id="myToggle_right" onChange={(e) => {
            try { localStorage.setItem('darkMode', e.target.checked ? '1' : '0') } catch (e) {}
            document.body.classList.toggle('dark', e.target.checked)
        }} defaultChecked={typeof window !== 'undefined' && localStorage.getItem('darkMode') === '1'} />
        <span className="slider"></span>
    </label>

</div>
                </div>

               <div style={{ backgroundColor: '#333333', width: "1px", height: "60px", margin: "0 12px" , border: '1px solid #333'}}></div>
                <div style={{ display: 'flex'}}>


                  <div>
                    <button onClick={() => signOut()} className="logout-btn select" style={{width: '50px', height: '50px', alignItems: 'center'}}>
                      <svg xmlns="http://www.w3.org/2000/svg" height="30px" viewBox="0 -960 960 960" width="30px" fill="#1f1f1f"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h280v80H200Zm440-160-55-58 102-102H360v-80h327L585-622l55-58 200 200-200 200Z"/></svg>
                    </button>
                  </div>





                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="container">
          <div className="grid" style={{ display: 'flex', gap: 20 }}>

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
                      <option value={5}>5秒</option>
                      <option value={15}>15秒</option>
                      <option value={30}>30秒</option>
                      <option value={60}>1分</option>
                      <option value={180}>3分</option>
                      <option value={300}>5分</option>
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

                  <div className="form-group controls-row" style={{ display: 'flex', gap: 12 }}>
                    {/* 단일 토글 버튼: 녹화개시 <-> 녹화정지 */}
                    <button
                      onClick={async () => {
                        try {
                          if (!isRecording) {
                            await handleStart()
                          } else {
                            await handleStop()
                          }
                        } catch (e) { console.error(e) }
                      }}
                      className={`control-btn start-stop-btn ${isRecording ? 'recording' : 'idle'}`}
                      style={{
                        flex: '1 1 100%',
                        padding: '10px 16px',
                        fontSize: 16,
                        color: '#fff',
                        backgroundColor: isRecording ? '#c4302b' : '#2e9b2e',
                        border: 'none',
                        borderRadius: 6,
                      }}
                    >
                      {!isRecording ? '録画開始' : '録画停止'}
                    </button>
                  </div>
                  
                  <div className="stats-grid" style={{ marginTop: 12, display: 'flex', gap: 12 }}>
                    <div className="stat-card" style={{ flex: 1 }}>
                      <div className="stat-label">合計撮影枚数</div>
                      <div className="stat-value" id="captureCount">{totalShots}</div>
                    </div>
                    <div className="stat-card" style={{ flex: 1 }}>
                      <div className="stat-label">合計写真サイズ</div>
                      <div className="stat-value" id="analyzedCount">{totalSize}</div>
                    </div>
                    <div className="stat-card" style={{ flex: 1 }}>
                      <div className="stat-label">削除済み</div>
                      <div className="stat-value" id="deletedCount">{deletedCount}</div>
                    </div>
                  </div>
                </div>
                </div>
              <div className="input-container" style={{ marginTop: 12 }}>
                <div id="isCapturing">
                  {/* 실제 스크린샷 미리보기: preload가 data URLs 배열을 반환하도록 구현됨 */}
                  {previewImages.length > 0 ? (
                    previewImages.map((d, i) => (
                      <img key={i} width={100} height={80} src={d} alt={`shot-${i}`} style={{ marginRight: 6 }} />
                    ))
                  ) : (
                    <div style={{ color: '#888' }}>スクリーンショットがまだありません</div>
                  )}
                </div>
              </div>
            </div>

            <div className='yoko yoko-right'>
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
                  {/* AI 분석 도트 */}
                  <div className="ai-dots" style={{ marginTop: 8 }}>
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </div>

                </div>
              </div>

            </section>

            </div>

            <div className="col-right" style={{ flex: '1 1 32%' }}>
              

              <section className="card yoko">
                <div className="card-header"><h4>レポート生成</h4></div>
                <div className="card-content">
                  <div className="report-section">
                    <div style={{ marginBottom: 10 }}>
                      <p style={{ marginBottom: 6 }}>送信後のスクリーンショットを削除</p>
                      <label className="toggle-switch">
                        <input type="checkbox" id="deleteAfterUploadToggle" checked={deleteAfterUpload} onChange={(e) => {
                          try { const v = e.target.checked; setDeleteAfterUpload(v); localStorage.setItem('deleteAfterUpload', v ? '1' : '0') } catch (err) {}
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
                      <input type="text" id="reportTitle" className="input" placeholder="例: 作業記録 2024-01-15" />
                    </div>

                      <div className="checkbox-group">
                        <label className="checkbox-label"><input type="checkbox" id="includeTimestamps" defaultChecked /> <span>タイムスタンプを含める</span></label>
                        <label className="checkbox-label"><input type="checkbox" id="includeSummary" defaultChecked /> <span>AI要約を含める</span></label>
                      </div>

                    <button className="btn btn-primary btn-large btn-full" id="generateReportBtn">レポート生成</button>
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

      </main>
  )
}

  return (
    <main style={{ padding: '2rem' , }}>
      <div className="login-container">
        <button className="close-button" id="closeButton" aria-label="閉じる" onClick={async () => {
          try {
            if (typeof window !== 'undefined' && window.api?.closeWindow) {
              await window.api.closeWindow()
              return
            }
          } catch (e) {}
          if (typeof window !== 'undefined' && window.close) window.close()
        }}>
          ×
        </button>

        <div className="login-header">
          <h1>ログイン</h1>
          <p>Screen Capture AIへようこそ</p>
        </div>

        {/* ダークモード切替は画面右下のグローバルトグルに移動しました */}

        <button
          className="google-login-button"
          id="googleLoginButton"
          onClick={() => signIn('google')}
        >
          <svg className="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Googleでログイン
        </button>

        <div className="divider">
          <span>安全なログイン</span>
        </div>

        <div className="info-text">
          ログインすることで、<a href="#">利用規約</a>と<a href="#">プライバシーポリシー</a>に同意したものとみなされます。
        </div>
      </div>
      {/* 全画面右下に固定表示されるグローバルダークモードトグル */}
      <div className="global-dark-toggle">
        <label>
          <input type="checkbox" onChange={(e) => {
            try { localStorage.setItem('darkMode', e.target.checked ? '1' : '0') } catch (e) {}
            document.body.classList.toggle('dark', e.target.checked)
          }} defaultChecked={typeof window !== 'undefined' && localStorage.getItem('darkMode') === '1'} />
          <span style={{ marginLeft: 8 }}>ダークモード</span>
        </label>
      </div>
    </main>
  )
}
