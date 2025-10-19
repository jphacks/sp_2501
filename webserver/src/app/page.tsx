// src/app/page.tsx
'use client';

import AuthButton from '@/components/AuthButton';
import { useSession, signOut } from 'next-auth/react';
import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';

// --------------------------------------------------
// 型定義: Electron Preload と状態
// --------------------------------------------------
type SettingsData = {
  interval?: number;
  resolution?: number | string;
  deleteAfterUpload?: boolean;
};

type StatsData = {
  totalShots: number;
  totalSize: number;
  uploadedCount: number;
};

type ActivityLogEntry = {
  time: string;
  message: string;
};

declare global {
  interface Window {
    electronAPI?: {
      startCapture: (settings: { interval: number; resolution: number }) => Promise<{ success: boolean; message: string }>;
      stopCapture: () => Promise<{ success: boolean; message: string }>;
      readSettings: () => Promise<SettingsData>;
      writeSettings: (settings: SettingsData) => Promise<{ success: boolean; error?: string }>;
      getStats: () => Promise<StatsData>;
      listScreenshots: (limit?: number) => Promise<string[]>;
      closeWindow: () => Promise<void>;
      onLogMessage: (callback: (message: string) => void) => () => void; // 반환 타입은 클린업 함수
    };
  }
}
// --------------------------------------------------
// メインコンポーネント
// --------------------------------------------------
export default function Home() {
  const { data: session, status } = useSession();

  // --- UI 상태 ---
  const [intervalSec, setIntervalSec] = useState<number>(5);
  const [resolution, setResolution] = useState<string>('1.0');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [deleteAfterUpload, setDeleteAfterUpload] = useState<boolean>(false);
  const [summary, setSummary] = useState('');
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false); // 설정 로드 완료 여부
  const [autoSummaryEnabled, setAutoSummaryEnabled] = useState<boolean>(false); // 👈 [추가] 자동 요약 상태
  const [reportStartDate, setReportStartDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [reportEndDate, setReportEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [reportFormat, setReportFormat] = useState<string>('md'); // 기본값 Markdown
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);

  // --- 통계 상태 ---
  const [totalShots, setTotalShots] = useState<number>(0);
  const [totalSize, setTotalSize] = useState<number>(0);
  const [uploadedCount, setUploadedCount] = useState<number>(0);

  // --- 미리보기 상태 ---
  const [previewImages, setPreviewImages] = useState<string[]>([]);

  // --- 활동 로그 상태 ---
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  // --- 로그 추가 함수 ---
  const addLog = useCallback((message: string) => {
    // 메시지에서 타임스탬프 제거 시도 (중복 방지)
    const cleanMessage = message.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
    const timeMatch = message.match(/^\[(\d{2}:\d{2}:\d{2})\]/);
    // 메인 프로세스 타임스탬프가 있으면 사용, 없으면 현재 시간 사용
    const time = timeMatch ? timeMatch[1] : new Date().toLocaleTimeString('en-GB'); // HH:MM:SS 형식

    // 중복 로그 방지 (선택 사항)
    setActivityLog((prev) => {
        if (prev.length > 0 && prev[0].message === cleanMessage && prev[0].time === time) {
            return prev; // 마지막 로그와 동일하면 추가 안 함
        }
        return [{ time, message: cleanMessage }, ...prev].slice(0, 100);
    });
  }, []);
  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    addLog(`レポート生成中 (${reportStartDate} ~ ${reportEndDate}, 形式: ${reportFormat})...`);

    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: reportStartDate,
          endDate: reportEndDate,
          format: reportFormat,
        }),
      });

      const data = await response.json();

      if (response.ok && data.status === 'success' && data.reportContent) {
        addLog(data.message || 'レポート生成完了。');
        // 클라이언트 측에서 Markdown 다운로드 처리
        downloadMarkdown(data.fileName, data.reportContent);
      } else {
        addLog(`レポート生成失敗: ${data.message || '内容なし'}`);
      }
    } catch (error) {
      addLog(`レポート生成API呼び出しエラー: ${(error as Error).message}`);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // --- [추가] Markdown 다운로드 헬퍼 함수 ---
  const downloadMarkdown = (filename: string, text: string) => {
    const element = document.createElement('a');
    // UTF-8 인코딩 및 BOM(Byte Order Mark) 추가 (Excel 등 호환성)
    const blob = new Blob(['\uFEFF' + text], { type: 'text/markdown;charset=utf-8;' });
    element.href = URL.createObjectURL(blob);
    element.download = filename;
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
    document.body.removeChild(element);
    addLog(`"${filename}" ファイルダウンロード開始。`);
  };
  // --- useEffect: 設定ロード (マウント時1回) ---
  useEffect(() => {
    const loadSettings = async () => {
      if (window.electronAPI?.readSettings) {
        try {
          const settings = await window.electronAPI.readSettings();
          setIntervalSec(settings.interval ?? 5);
          setResolution(String(settings.resolution ?? '1.0'));
          setDeleteAfterUpload(settings.deleteAfterUpload ?? false);
          addLog('ローカル設定を読み込みました。');
        } catch (error) {
          addLog(`ローカル設定ロードエラー: ${(error as Error).message}`);
        }
      }
      // 자동 요약 설정 로드 (로그인 후)
      if (session) {
          try {
            const response = await fetch('/api/user/settings'); // GET 요청
            if (response.ok) {
              const data = await response.json();
              if (data.status === 'success') {
                setAutoSummaryEnabled(data.autoSummaryEnabled);
                addLog('自動要約設定をサーバーから読み込みました。');
              } else {
                 addLog(`自動要約設定の読み込み失敗: ${data.message}`);
              }
            } else {
                 addLog(`自動要約設定の読み込み失敗 (HTTP ${response.status}): ${response.statusText}`);
            }
          } catch (error) {
            addLog(`自動要約設定 API 呼び出しエラー: ${(error as Error).message}`);
          }
      }
      setSettingsLoaded(true); // 모든 설정 로드 시도 완료
    };
    loadSettings();
  }, [session, addLog]); // session 상태가 변경될 때마다 자동 요약 설정 다시 로드

  // --- useEffect: 설정 자동 저장 ---
  useEffect(() => {
    if (!settingsLoaded) return;

    const saveSettings = async () => {
      if (window.electronAPI?.writeSettings) {
        try {
          await window.electronAPI.writeSettings({
            interval: intervalSec,
            resolution: parseFloat(resolution),
            deleteAfterUpload: deleteAfterUpload,
          });
        } catch (error) {
          addLog(`ローカル設定保存エラー: ${(error as Error).message}`);
        }
      }
    };
    const timer = setTimeout(saveSettings, 500);
    return () => clearTimeout(timer);
  }, [intervalSec, resolution, deleteAfterUpload, settingsLoaded, addLog]);

  // --- useEffect: 통계 및 미리보기 주기적 업데이트 ---
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    const fetchStatsAndPreviews = async () => {
      if (window.electronAPI?.getStats) {
        try {
          const stats = await window.electronAPI.getStats();
          setTotalShots(stats.totalShots);
          setTotalSize(stats.totalSize);
          setUploadedCount(stats.uploadedCount);
          // 대기 파일 수는 통계 업데이트 시 같이 반영됨
        } catch (error) {
          addLog(`統計更新エラー: ${(error as Error).message}`);
        }
      }
      if (window.electronAPI?.listScreenshots) {
        try {
          const previews = await window.electronAPI.listScreenshots(4);
          setPreviewImages(previews);
        } catch (error) {
          addLog(`プレビュー更新エラー: ${(error as Error).message}`);
        }
      }
    };

    if(session){ // 로그인 상태일 때만 주기적 업데이트 실행
        fetchStatsAndPreviews(); // 즉시 한번 실행
        intervalId = setInterval(fetchStatsAndPreviews, 5000); // 5초마다 업데이트
    }

    return () => { // 컴포넌트 언마운트 또는 로그아웃 시 인터벌 제거
        if(intervalId) clearInterval(intervalId);
    };
  }, [session, addLog]); // session 상태가 변경될 때 인터벌 시작/중지

  // --- useEffect: Main 프로세스 로그 리스너 ---
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    if (window.electronAPI?.onLogMessage) {
      unsubscribe = window.electronAPI.onLogMessage((message) => {
        addLog(message);
      });
    }
    return () => { // 클린업 함수
        if (unsubscribe) unsubscribe();
    };
  }, [addLog]); // addLog가 useCallback으로 감싸져 있어 한번만 실행됨


  // --- 핸들러 함수들 ---
  const handleStartCapture = async () => {
    console.log('キャプチャ開始ボタンがクリックされました！');
    if (!window.electronAPI) {
      addLog('Electron API が見つかりません。');
      return;
    }
    addLog('キャプチャ開始をリクエストしています...');
    const settings = { interval: intervalSec, resolution: parseFloat(resolution) };
    try {
      const result = await window.electronAPI.startCapture(settings);
      if (result.success) {
        setIsRecording(true);
        addLog('キャプチャを開始しました。');
      } else {
        addLog(`キャプチャ開始に失敗しました: ${result.message}`);
      }
    } catch (error) {
       addLog(`[IPC エラー] キャプチャ開始: ${(error as Error).message}`);
       console.error('[IPC Error] Start Capture:', error);
    }
  };

  const handleStopCapture = async () => {
    console.log('キャプチャ停止ボタンがクリックされました！');
    if (!window.electronAPI) {
        addLog('Electron API が見つかりません。');
        return;
    };
    addLog('キャプチャ停止をリクエストしています...');
     try {
        const result = await window.electronAPI.stopCapture();
        if (result.success) {
          setIsRecording(false);
          addLog('キャプチャを停止しました。');
        } else {
          addLog(`キャプチャ停止に失敗しました: ${result.message}`);
        }
    } catch (error) {
        addLog(`[IPC エラー] キャプチャ停止: ${(error as Error).message}`);
        console.error('[IPC Error] Stop Capture:', error);
    }
  };

  const handleGenerateSummary = async () => {
    console.log('要約生成ボタンがクリックされました！');
    setIsLoadingSummary(true);
    setSummary('');
    addLog('本日の活動要約を生成しています...');

    try {
      const response = await fetch('/api/summary', {
        method: 'POST',
      });
      const data = await response.json();

      if (response.ok && data.status === 'success') {
        setSummary(data.summary);
  // data.messageがあればログに追加 (例: キャッシュされた要約の返却メッセージ)
  addLog(data.message || '要約の生成が完了しました。');
      } else {
  addLog(`要約の生成に失敗しました: ${data.message}`);
      }
    } catch (error) {
      addLog(`API 呼び出しエラー: ${(error as Error).message}`);
      console.error('[API Error] Summary:', error);
    }
    setIsLoadingSummary(false);
  };

  const handleCloseWindow = () => {
    window.electronAPI?.closeWindow();
  };

  const handleDarkModeToggle = (isChecked: boolean) => {
    document.body.classList.toggle('dark', isChecked);
    try { localStorage.setItem('darkMode', isChecked ? '1' : '0'); } catch {}
  };

  // --- [추가] 자동 요약 토글 핸들러 ---
  const handleAutoSummaryToggle = async (isChecked: boolean) => {
    setAutoSummaryEnabled(isChecked);
    addLog(`自動要約設定を${isChecked ? '活性化' : '非活性化'}する中···`);
    try {
      const response = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoSummaryEnabled: isChecked }),
      });
      const data = await response.json();
      if (response.ok && data.status === 'success') {
        addLog('自動要約設定が保存されました。');
      } else {
        addLog(`自動要約設定保存失敗: ${data.message}`);
        setAutoSummaryEnabled(!isChecked); // 실패 시 UI 원복
      }
    } catch (error) {
      addLog(`自動要約設定 API 呼び出しエラー: ${(error as Error).message}`);
      setAutoSummaryEnabled(!isChecked); // 실패 시 UI 원복
    }
  };

  // --- 렌더링 ---
    if (status === 'loading' || !settingsLoaded) {
    return <main className="main-content"><p>読み込み中...</p></main>;
  }

  // 로그인되지 않은 상태
  if (!session) {
    return (
        <main className="login-outer">
           <div className="login-container">
               <button className="close-button" onClick={handleCloseWindow}>×</button>
               <div className="login-header">
                 <h1>ログイン</h1>
                 <p>Screen Capture AI</p>
               </div>
               <AuthButton />
               {/* ダークモードのトグル（ログイン画面にも追加可能） */}
           </div>
        </main>
      );
  }

  // 로그인된 상태
  const userName = session.user?.name || 'User';
  return (
    <>
      {/* 헤더 */}
      <header className="header">
        <div className="container">
          <div className="header-content">
             <div className="header-left">
              <div className="header-title">
                <h1>Screen Capture AI</h1>
                <p>自動スクリーンショット&AI分析</p>
              </div>
            </div>
            <div className="header-right">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ textAlign: 'right' }}>
                   <div style={{ fontWeight: 600 }}>{userName}</div>
                   <div style={{ color: 'var(--muted-foreground)' }}>{session.user?.email}</div>
                 </div>
                 {session.user?.image && (
                   <Image src={session.user.image} alt="Profile" width={40} height={40} style={{ borderRadius: '50%' }} />
                 )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label className="toggle-switch">
                      <input type="checkbox" onChange={(e) => handleDarkModeToggle(e.target.checked)} defaultChecked={typeof window !== 'undefined' && localStorage.getItem('darkMode') === '1'} />
                      <span className="slider"></span>
                  </label>
                  <span style={{ fontSize: '0.8rem'}}>ダークモード</span>
              </div>
              <button onClick={() => signOut()} className="btn btn-secondary btn-sm">ログアウト</button>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="app-outer main-content">
        <div className="container">
          <div className="grid">
            {/* 왼쪽 컬럼 */}
            <div className="col-left">
              <section className="card">
                <div style={{ flex: '7.5', display: 'flex', flexDirection: 'column' }}>
                    <div className="card-header">
                      <h3 className="card-title">自動スクリーンショット設定</h3>
                    </div>
                    <div className="card-content">
                       <div className="control-section">
                        <div className="form-group">
                          <label htmlFor="interval">キャプチャ間隔（秒）:</label>
                          <select className="select" id="interval" value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value))} disabled={isRecording}>
          <option value={5}>5秒</option>
          <option value={15}>15秒</option>
        <option value={30}>30秒</option>
          <option value={60}>1分</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label htmlFor="resolution">解像度スケール:</label>
                          <select className="select" id="resolution" value={resolution} onChange={(e) => setResolution(e.target.value)} disabled={isRecording}>
                            <option value="1.0">100%</option>
                            <option value="0.75">75%</option>
                            <option value="0.5">50%</option>
                          </select>
                        </div>
                        <button
                          onClick={isRecording ? handleStopCapture : handleStartCapture}
                          className={`btn btn-large btn-full ${isRecording ? 'btn-destructive' : 'btn-primary'}`}
                          id={isRecording ? 'btn-stop' : 'btn-start'}
                        >
                          {isRecording ? 'キャプチャ停止' : 'キャプチャ開始'}
                        </button>
                      </div>
                      <div className="stats-grid">
                        <div className="stat-card">
                          <div className="stat-label">撮影枚数</div>
                          <div className="stat-value">{totalShots}</div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-label">合計容量</div>
                          <div className="stat-value">{(totalSize / (1024 * 1024)).toFixed(1)} <span style={{fontSize: '1rem'}}>MB</span></div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-label">アップロード完了</div>
                          <div className="stat-value">{uploadedCount}</div>
                        </div>
                      </div>
                    </div>
                     <div className="card-content" style={{ borderTop: '1px solid var(--border)' }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                             {/* 待機ファイル数は totalShots を使用 */}
                             <h4>最新スクリーンショット（待機: {totalShots}枚）</h4>
                              {/* アップロードキュー確認ボタンは削除（自動更新されるため） */}
                         </div>
                         <div id="isCapturing" style={{ display: 'flex', gap: '8px', overflowX: 'auto', minHeight: '100px', alignItems: 'center' }}>
                           {previewImages.length > 0 ? (
                             previewImages.map((dataUrl, index) => (
                               <Image key={index} src={dataUrl} alt={`preview-${index}`} width={160} height={100} style={{ objectFit: 'contain', borderRadius: '4px', border: '1px solid var(--border)' }} unoptimized />
                             ))
                           ) : (
                             <p style={{ color: 'var(--muted-foreground)' }}>{isRecording ? 'キャプチャ中...' : 'プレビューなし'}</p>
                           )}
                         </div>
                     </div>
                </div>

                <div style={{ flex: '2.5', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                  <div className="card-header">
                      <h4 className="card-title">アクティビティログ</h4>
                  </div>
                  <div className="card-content" style={{ flexGrow: 1, overflow: 'hidden' }}>
                    <div className="activity-list" style={{ height: 'calc(100% - 20px)', overflowY: 'auto' }}>
                       {activityLog.length > 0 ? (
                           activityLog.map((log, index) => (
                             <div className="activity-item" key={index}>
                               <span className="activity-time">{log.time}</span>
                               <span className="activity-message">{log.message}</span>
                             </div>
                           ))
                       ) : (
                           <p style={{ color: 'var(--muted-foreground)'}}>ログがありません</p>
                       )}
                    </div>
                    <div className={`ai-dots ${isRecording ? 'running' : ''}`} style={{ marginTop: '10px' }}>
                       <span className="dot" />
                       <span className="dot" />
                       <span className="dot" />
                    </div>
                  </div>
                </div>
              </section>
           </div>

            {/* 오른쪽 컬럼 */}
            <div className="col-right">
                <section className="card">
                <div className="card-content" style={{width: '100%'}}>
              <div className="card-header" style={{padding: 0, marginBottom: '1rem'}}>
              <h4 className="card-title">手動レポート作成</h4>
            </div>
                  <div className="report-section">
                    {/* 기간 선택 */}
                    <div className="form-group">
                      <label htmlFor="reportStartDate">開始日:</label>
                      <input
                        type="date"
                        id="reportStartDate"
                        className="input"
                        value={reportStartDate}
                        onChange={(e) => setReportStartDate(e.target.value)}
                        max={reportEndDate} // 시작일은 종료일보다 늦을 수 없음
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="reportEndDate">終了日:</label>
                      <input
                        type="date"
                        id="reportEndDate"
                        className="input"
                        value={reportEndDate}
                        onChange={(e) => setReportEndDate(e.target.value)}
                        min={reportStartDate} // 종료일은 시작일보다 빠를 수 없음
                        max={new Date().toISOString().split('T')[0]} // 오늘 이후 선택 불가
                      />
                    </div>
                    {/* 파일 형식 선택 */}
                    <div className="form-group">
                      <label htmlFor="reportFormat">ファイル形式:</label>
                      <select
                        id="reportFormat"
                        className="select"
                        value={reportFormat}
                        onChange={(e) => setReportFormat(e.target.value)}
                      >
                        <option value="md">Markdown (.md)</option>
                        {/* <option value="docx" disabled>Word (.docx) - 준비 중</option>
                        <option value="pdf" disabled>PDF (.pdf) - 준비 중</option> */}
                      </select>
                    </div>

                    {/* 생성 버튼 */}
                    <button
                      onClick={handleGenerateReport}
                      disabled={isGeneratingReport || !reportStartDate || !reportEndDate || reportStartDate > reportEndDate}
                      className="btn btn-primary btn-large btn-full"
                      style={{ marginTop: '1rem' }}
                    >
                      {isGeneratingReport ? '作成中...' : 'レポート作成とダウンロード'}
                    </button>
                  </div>
                </div>
              </section>
              <section className="card">
                <div className="card-content" style={{width: '100%'}}>
              <div className="card-header" style={{padding: 0, marginBottom: '1rem'}}>
              <h4 className="card-title">機能設定</h4>
            </div>
                  <div className="report-section">
                    <div style={{ marginBottom: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label htmlFor="deleteAfterUploadToggle">送信後にスクリーンショットを削除する</label>
                      <label className="toggle-switch">
                        <input type="checkbox" id="deleteAfterUploadToggle" checked={deleteAfterUpload} onChange={(e) => setDeleteAfterUpload(e.target.checked)} />
                        <span className="slider"></span>
                      </label>
                    </div>
                    {/* 👇 [추가] 자동 일일 요약 토글 */}
                    <div style={{ marginBottom: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label htmlFor="autoSummaryToggle">毎日深夜に自動要約を生成</label>
                      <label className="toggle-switch">
                        <input type="checkbox" id="autoSummaryToggle" checked={autoSummaryEnabled} onChange={(e) => handleAutoSummaryToggle(e.target.checked)} />
                        <span className="slider"></span>
                      </label>
                    </div>
                    {/* 오늘 요약 생성 버튼 */}
                    <button
                      onClick={handleGenerateSummary}
                      disabled={isLoadingSummary}
                      className="btn btn-primary btn-large btn-full"
                      style={{ marginTop: '1rem' }}
                    >
                      {isLoadingSummary ? '作成中...' : '今日の要約を作成する'}
                    </button>
                    {summary && (
                      <div style={{ marginTop: '1rem', padding: '10px', border: '1px solid var(--border)', background: 'var(--background)', maxHeight: '300px', overflowY: 'auto' }}>
                        <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontSize: '0.875rem' }}>
                          {summary}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}