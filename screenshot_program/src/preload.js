const { contextBridge, ipcRenderer } = require('electron');

// 'api'という名前でwindowオブジェクトに安全に関数を公開します。
contextBridge.exposeInMainWorld('api', {
  // 'recording:start' チャンネルで settings データを送り、メインプロセスの応答を待ちます。
  startRecording: (settings) => ipcRenderer.invoke('recording:start', settings),
  // 'recording:stop' チャンネルで信号を送ります。
  stopRecording: () => ipcRenderer.invoke('recording:stop'),
  // settings 파일 읽기/쓰기
  readSettings: () => ipcRenderer.invoke('settings:read'),
  writeSettings: (obj) => ipcRenderer.invoke('settings:write', obj),
  // 파일 변경 알림 수신기 등록
  onSettingsChanged: (cb) => {
    const listener = (event, data) => cb(data)
    ipcRenderer.on('settings:changed', listener)
    return () => ipcRenderer.removeListener('settings:changed', listener)
  },
});