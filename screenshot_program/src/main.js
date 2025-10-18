const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process'); // Pythonスクリプト実行に必要
const axios = require('axios');             // HTTPリクエストに必要

let pythonProcess = null; // Pythonの子プロセスを格納する変数
let uploadProcess = null; // アップローダー用の子プロセス

// Pythonサーバーを起動する関数
function createPythonProcess() {
  // backend/app.py lives at repository root (../backend/app.py relative to src/)
  pythonProcess = spawn('py', [path.join(__dirname, '..', 'backend', 'app.py')]);
  uploadProcess = spawn('py', [path.join(__dirname, '..', 'backend', 'uploader.py')]);

  // Pythonスクリプトの標準出力(print)をコンソールに出力
  pythonProcess.stdout.on('data', (data) => {
    console.log(`Python出力: ${data}`);
  });

  // 【重要】Pythonスクリプトのエラー出力をコンソールに出力
  pythonProcess.stderr.on('data', (data) => {
    console.error(`Pythonエラー: ${data}`);
  });

  // Pythonプロセスが終了した際の処理
  pythonProcess.on('close', (code) => {
    console.log(`Pythonプロセスが終了しました。終了コード: ${code}`);
  });
  uploadProcess.on('close', (code) => {
    console.log(`Uploaderプロセスが終了しました。終了コード: ${code}`);
  });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = process.env.NODE_ENV !== 'production'

  if (isDev) {
    // Load Next.js dev server so NextAuth runs on http://localhost:3000 and cookies are set correctly
    const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000'
    mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools()
  } else {
    // In production, fall back to the local static html (or exported Next output)
    // If you export Next to `out/`, you can load out/index.html here instead.
    mainWindow.loadFile(path.join(__dirname, 'screenshot.html'))
  }
}

// Electronアプリの準備が完了したら実行
app.whenReady().then(() => {
  createPythonProcess(); // Pythonサーバーを起動
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// アプリが終了する際にPythonプロセスも一緒に終了させる
app.on('will-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  if (uploadProcess) {
    uploadProcess.kill();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

//-- IPC通信の処理 --//

// 'recording:start' リクエストの処理
ipcMain.handle('recording:start', async (event, settings) => {
  // 受け取った設定を加工します。保存先はアプリケーションのプロジェクトルートの
  // screenshot フォルダで固定します。
  settings = settings || {};
  // プロジェクトルートの screenshot フォルダに固定
  const fixedSavePath = path.join(__dirname, '..', 'screenshot');
  settings.savePath = fixedSavePath;
  console.log('Main受信: 録画開始リクエスト.　:', settings);
  try {
    const response = await axios.post('http://127.0.0.1:5001/start', settings);
    return response.data; // サーバーからの応答をフロントエンドに返す
  } catch (error) {
    console.error('Pythonサーバー(/start)との通信エラー:', error.message);
    return { status: 'error', message: 'バックエンドサーバーとの通信に失敗しました。' };
  }
});

// 'recording:stop' リクエストの処理
ipcMain.handle('recording:stop', async (event) => {
  console.log('Main受信: 録画停止リクエスト');
  try {
    const response = await axios.post('http://127.0.0.1:5001/stop');
    return response.data; // サーバーからの応答をフロントエンドに返す
  } catch (error) {
    console.error('Pythonサーバー(/stop)との通信エラー:', error.message);
    return { status: 'error', message: 'バックエンドサーバーとの通信に失敗しました。' };
  }
});