import { useState, useEffect } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import Image from 'next/image'

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
      startRecording: (settings: { interval: number; resolution: number }) => Promise<{ status?: string }>
      stopRecording: () => Promise<{ status?: string }>
      readSettings: () => Promise<PersonalSettings>
      writeSettings: (obj: Partial<PersonalSettings>) => Promise<{ ok: boolean; error?: string }>
      onSettingsChanged: (cb: (data: any) => void) => () => void
    }
  }
}

export default function Home() {
  const { data: session, status } = useSession()

  const [intervalSec, setIntervalSec] = useState<number>(5)
  const [resolution, setResolution] = useState<string>('1.0')
  const [statusText, setStatusText] = useState<string>('待機中...')
  const [isRecording, setIsRecording] = useState<boolean>(false)
  const [loadedSettings, setLoadedSettings] = useState<boolean>(false)

  // NOTE: do not return early here; hooks below must run on every render

  const handleStart = async () => {
    setStatusText('開始処理中...')
    const settings = { interval: intervalSec, resolution: parseFloat(resolution) }
    try {
      if (typeof window !== 'undefined' && window.api?.startRecording) {
        const res = await window.api.startRecording(settings)
        setStatusText(res?.status ?? '録画開始')
        setIsRecording(true)
      } else {
        // ブラウザで実行されている場合のフォールバック
        console.log('startRecording fallback', settings)
        setStatusText('（ブラウザ）録画開始（デバッグ）')
        setIsRecording(true)
      }
    } catch (err: any) {
      setStatusText('開始エラー: ' + (err?.message ?? String(err)))
    }
  }

  const handleStop = async () => {
    setStatusText('停止処理中...')
    try {
      if (typeof window !== 'undefined' && window.api?.stopRecording) {
        const res = await window.api.stopRecording()
        setStatusText(res?.status ?? '録画停止')
        setIsRecording(false)
      } else {
        console.log('stopRecording fallback')
        setStatusText('（ブラウザ）録画停止（デバッグ）')
        setIsRecording(false)
      }
    } catch (err: any) {
      setStatusText('停止エラー: ' + (err?.message ?? String(err)))
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
            if (typeof s.interval === 'number') setIntervalSec(s.interval)
            if (typeof s.resolution === 'number' || typeof s.resolution === 'string') setResolution(String(s.resolution))
            if (typeof s.statusText === 'string') setStatusText(s.statusText)
            if (typeof s.isRecording === 'boolean') setIsRecording(s.isRecording)
          }
        }
      } catch (err) {
        console.error('readSettings error', err)
      } finally {
        if (mounted) setLoadedSettings(true)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  // 변경사항 자동 저장 (디바운스). loadedSettings가 true일 때만 저장 시작
  useEffect(() => {
    if (!loadedSettings) return
    let timer: NodeJS.Timeout | null = null
    const scheduleSave = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(async () => {
        try {
          if (typeof window !== 'undefined' && window.api?.writeSettings) {
            await window.api.writeSettings({ interval: intervalSec, resolution: parseFloat(resolution), statusText, isRecording })
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
  }, [intervalSec, resolution, statusText, isRecording, loadedSettings])

  // 수동 저장 버튼 핸들러
  const handleManualSave = async () => {
    try {
      if (typeof window !== 'undefined' && window.api?.writeSettings) {
        const res = await window.api.writeSettings({ interval: intervalSec, resolution: parseFloat(resolution), statusText, isRecording })
        if (res?.ok) setStatusText('設定を保存しました')
        else setStatusText('保存失敗: ' + (res?.error ?? 'unknown'))
      }
    } catch (err) {
      console.error('manual save error', err)
      setStatusText('保存エラー')
    }
  }

  // 파일 변경 감시: preload가 제공하는 콜백 등록
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api?.onSettingsChanged) return
    const off = window.api.onSettingsChanged(async () => {
      try {
        const s = await window.api.readSettings()
        if (s) {
          setIntervalSec(s.interval)
          setResolution(String(s.resolution))
          setStatusText(s.statusText)
          setIsRecording(s.isRecording)
        }
      } catch (err) {
        console.error('onSettingsChanged read error', err)
      }
    })
    return () => off()
  }, [loadedSettings])

  // 로딩 상태는 hooks가 선언된 이후에 처리해야 함
  if (status === 'loading') {
    return (
      <main>
        <p>セッション情報を読み込み中です...</p>
      </main>
    )
  }

  if (session) {
    return (
      <main style={{ padding: '2rem', maxWidth: 780 }}>
        <section style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          {session.user?.image && (
            <Image src={session.user.image} alt="Profile" width={64} height={64} style={{ borderRadius: '50%' }} />
          )}
          <div>
            <h2 style={{ margin: 0 }}>ようこそ、{session.user?.name} さん</h2>
            <p style={{ margin: 0 }}>{session.user?.email}</p>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={() => signOut()} style={{ padding: '0.4rem 0.8rem', background: 'red', color: 'white', border: 'none', cursor: 'pointer' }}>
              ログアウト
            </button>
          </div>
        </section>

        <section style={{ border: '1px solid #ddd', padding: 16, borderRadius: 8 }}>
          <h3>自動スクリーンショット設定</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <label htmlFor="interval">撮影間隔 (秒):</label>
            <input
              id="interval"
              type="number"
              value={intervalSec}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
              style={{ width: 120 }}
              min={1}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <label htmlFor="resolution">解像度スケール:</label>
            <select id="resolution" value={resolution} onChange={(e) => setResolution(e.target.value)}>
              <option value="1.0">100% (フル解像度)</option>
              <option value="0.75">75%</option>
              <option value="0.5">50%</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button onClick={handleStart} disabled={isRecording} style={{ padding: '0.5rem 1rem', background: '#0b79d0', color: 'white', border: 'none', cursor: 'pointer' }}>
              開始
            </button>
            <button onClick={handleStop} disabled={!isRecording} style={{ padding: '0.5rem 1rem', background: '#555', color: 'white', border: 'none', cursor: 'pointer' }}>
              停止
            </button>
          </div>

          <hr style={{ margin: '12px 0' }} />
          <p>ステータス: <strong>{statusText}</strong></p>
        </section>
      </main>
    )
  }

  return (
    <main style={{ padding: '2rem' }}>
      <h1>JPHacks API サーバー</h1>
      <p>ログインしていません。</p>
      <button onClick={() => signIn('google')} style={{ padding: '0.5rem 1rem', background: 'blue', color: 'white', border: 'none', cursor: 'pointer' }}>
        Googleでログイン
      </button>
    </main>
  )
}
