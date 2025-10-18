import { useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import Image from 'next/image'

// preload에서 노출된 API가 있을 수 있으므로 타입 선언(컴파일 오류 방지)
declare global {
  interface Window {
    api?: {
      startRecording: (settings: { interval: number; resolution: number }) => Promise<{ status?: string }>
      stopRecording: () => Promise<{ status?: string }>
    }
  }
}

export default function Home() {
  const { data: session, status } = useSession()

  const [intervalSec, setIntervalSec] = useState<number>(5)
  const [resolution, setResolution] = useState<string>('1.0')
  const [statusText, setStatusText] = useState<string>('待機中...')
  const [isRecording, setIsRecording] = useState<boolean>(false)

  if (status === 'loading') {
    return (
      <main>
        <p>セッション情報を読み込み中です...</p>
      </main>
    )
  }

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
