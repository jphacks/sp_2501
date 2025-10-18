const { contextBridge, ipcRenderer } = require('electron');

// 'api'という名前でwindowオブジェクトに安全に関数を公開します。
contextBridge.exposeInMainWorld('api', {
  // 'recording:start' チャンネルで settings データを送り、メインプロセスの応答を待ちます。
  startRecording: (settings) => ipcRenderer.invoke('recording:start', settings),
  
  // 'recording:stop' チャンネルで信号を送ります。
  stopRecording: () => ipcRenderer.invoke('recording:stop'),

  // ★★★ この一行が重要 ★★★
  selectFolder: () => ipcRenderer.invoke('select-folder'), 
});