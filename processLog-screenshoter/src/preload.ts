// src/preload.ts
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// 旧プロジェクトの設定用の型
type SettingsData = {
  interval?: number;
  resolution?: number | string; // 旧プロジェクトでは string も可能だった
  deleteAfterUpload?: boolean;
  // (statusText, isRecording は UI 状態なのでここでは除外)
};

// 統計データの型
type StatsData = {
  totalShots: number; // screenshot/ フォルダ内の .png の数
  totalSize: number;  // screenshot/ フォルダ内の .png 総サイズ (bytes)
  uploadedCount: number; // screenshot/uploaded/ フォルダ内の .png の数 (旧: deletedCount)
};

contextBridge.exposeInMainWorld('electronAPI', {
  // --- 既存の関数 ---
  startCapture: (settings: { interval: number; resolution: number }) =>
    ipcRenderer.invoke('start-capture', settings),
  stopCapture: () =>
    ipcRenderer.invoke('stop-capture'),

  // --- 👇 [追加] ---

  // 設定の読み取り
  readSettings: (): Promise<SettingsData> => ipcRenderer.invoke('settings:read'),

  // 設定の書き込み
  writeSettings: (settings: SettingsData): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('settings:write', settings),

  // 統計の取得
  getStats: (): Promise<StatsData> => ipcRenderer.invoke('stats:get'),

  // 最近のスクリーンショット一覧 (Data URL 配列) を取得
  listScreenshots: (limit?: number): Promise<string[]> => ipcRenderer.invoke('screenshots:list', limit),

  // ウィンドウを閉じる
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),

  // Main プロセスからログメッセージを受け取るリスナー登録
  // 使い方: window.electronAPI.onLogMessage((message) => { console.log(message); });
    onLogMessage: (callback: (message: string) => void) => {
      const listener = (event: IpcRendererEvent, message: string) => callback(message);
      ipcRenderer.on('log-message', listener);
      // クリンアップ関数を返す (타입 일치 유지)
      return () => ipcRenderer.removeListener('log-message', listener as (...args: any[]) => void);
    },
});