const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process'); // Pythonスクリプト実行に必要
const axios = require('axios');             // HTTPリクエストに必要
const fs = require('fs');
const fsp = fs.promises;

let pythonProcess = null; // Pythonの子プロセスを格納する変数
let uploadProcess = null; // アップローダー用の子プロセス

// Pythonサーバーを起動する関数
function createPythonProcess() {
  // backend/app.py lives at repository root (../backend/app.py relative to src/)
  // Use 'python' executable to be more portable on Windows/macOS
  pythonProcess = spawn('python', [path.join(__dirname, '..', 'backend', 'app.py')]);
  uploadProcess = spawn('python', [path.join(__dirname, '..', 'backend', 'uploader.py')]);

  // Pythonスクリプトの標準出力(print)をコンソールに出力
  pythonProcess.stdout.on('data', (data) => {
    // python stdout suppressed in release; keep for future debug if needed
  });

  // 【重要】Pythonスクリプトのエラー出力をコンソールに出力
  pythonProcess.stderr.on('data', (data) => {
    // still surface stderr as errors
    console.error(`Pythonエラー: ${data}`);
  });

  // Pythonプロセスが終了した際の処理
  pythonProcess.on('close', (code) => {
    // suppressed
  });
  uploadProcess.on('close', (code) => {
    // suppressed
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

  // settings 파일 변경 감시 시작
  const stopWatcher = startSettingsWatcher(mainWindow)

  // 창이 닫힐 때 watcher 종료
  mainWindow.on('closed', () => {
    try {
      stopWatcher()
    } catch (err) {
      // ignore
    }
  })
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
  // debug log removed
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
  // debug log removed
  try {
    const response = await axios.post('http://127.0.0.1:5001/stop');
    return response.data; // サーバーからの応答をフロントエンドに返す
  } catch (error) {
  console.error('Pythonサーバー(/stop)との通信エラー:', error.message);
    return { status: 'error', message: 'バックエンドサーバーとの通信に失敗しました。' };
  }
});

// ウィンドウを閉じるハンドラ（preload経由で呼ばれる）
ipcMain.handle('window:close', async (event) => {
  try {
    const senderWC = event.sender
    const win = BrowserWindow.fromWebContents(senderWC)
    if (win && !win.isDestroyed()) {
      win.close()
      return { ok: true }
    }
    return { ok: false, error: 'window not found' }
  } catch (err) {
    console.error('window:close error', err)
    return { ok: false, error: String(err) }
  }
})

// Helper: user settings path (in userData) and bundle default path (public)
function getSettingsPaths() {
  const userPath = path.join(app.getPath('userData'), 'personalSetting.json')
  const bundlePath = path.join(__dirname, '..', 'public', 'personalSetting.json')
  return { userPath, bundlePath }
}

// 기본 설정 (fallback, don't write bundle)
const defaultSettings = {
  interval: 5,
  resolution: 1.0,
  statusText: '待機中...',
  isRecording: false,
}

// 'settings:read' - 우선적으로 userPath에서 읽고, 없으면 bundlePath를 읽어서 반환 (bundle은 수정하지 않음)
ipcMain.handle('settings:read', async () => {
  try {
    const { userPath, bundlePath } = getSettingsPaths()

    // user settings가 있으면 우선 사용
    if (fs.existsSync(userPath)) {
      const content = await fsp.readFile(userPath, 'utf8')
      return Object.assign({}, defaultSettings, JSON.parse(content))
    }

    // userPath가 없으면 번들에 포함된 기본 파일을 읽어 반환 (단, 번들을 덮어쓰지 않음)
    if (fs.existsSync(bundlePath)) {
      const content = await fsp.readFile(bundlePath, 'utf8')
      try {
        return Object.assign({}, defaultSettings, JSON.parse(content))
      } catch (err) {
        console.error('bundle settings parse error', err)
        return defaultSettings
      }
    }

    // 둘 다 없으면 fallback(메모리 기본값) 반환
    return defaultSettings
  } catch (err) {
    console.error('settings:read error', err)
    return defaultSettings
  }
})

// 'settings:write' - userPath로 저장 (패키징된 앱에서도 사용자별 데이터 폴더에 저장되도록)
ipcMain.handle('settings:write', async (event, obj) => {
  try {
    const { userPath } = getSettingsPaths()
    const dir = path.dirname(userPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const toWrite = Object.assign({}, defaultSettings, obj || {})
    await fsp.writeFile(userPath, JSON.stringify(toWrite, null, 2), 'utf8')
    // repository root uploader_config (for uploader.py) - optional
    try {
      const repoRoot = path.join(__dirname, '..')
      const uploaderCfgPath = path.join(repoRoot, 'uploader_config.json')
      if (typeof obj?.deleteAfterUpload !== 'undefined') {
        const cfg = { deleteAfterUpload: !!obj.deleteAfterUpload }
        await fsp.writeFile(uploaderCfgPath, JSON.stringify(cfg, null, 2), 'utf8')
      }
    } catch (e) {
      console.error('write uploader_config error', e)
    }
    return { ok: true }
  } catch (err) {
    console.error('settings:write error', err)
    return { ok: false, error: String(err) }
  }
})

// 'screenshots:stats' - screenshot 폴더와 screenshot/uploaded 폴더의 통계를 계산해서 반환
ipcMain.handle('screenshots:stats', async () => {
  try {
    const screenshotDir = path.join(__dirname, '..', 'screenshot')
    const uploadedDir = path.join(screenshotDir, 'uploaded')
    // ensure dirs exist
    try { if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true }) } catch(e) {}
    try { if (!fs.existsSync(uploadedDir)) fs.mkdirSync(uploadedDir, { recursive: true }) } catch(e) {}

    // collect png files in screenshotDir (exclude uploaded)
    const all = await fsp.readdir(screenshotDir)
    let totalShots = 0
    let totalSize = 0
    for (const fn of all) {
      const full = path.join(screenshotDir, fn)
      try {
        const stat = await fsp.stat(full)
        if (stat.isFile() && fn.toLowerCase().endsWith('.png')) {
          totalShots += 1
          totalSize += stat.size
        }
      } catch(e) { /* ignore */ }
    }

    // uploaded folder count and size
    let deletedCount = 0
    try {
      const upFiles = await fsp.readdir(uploadedDir)
      for (const fn of upFiles) {
        const full = path.join(uploadedDir, fn)
        try {
          const stat = await fsp.stat(full)
          if (stat.isFile() && fn.toLowerCase().endsWith('.png')) {
            deletedCount += 1
          }
        } catch(e) {}
      }
    } catch(e) { /* ignore */ }

    return { totalShots, totalSize, deletedCount }
  } catch (err) {
    console.error('screenshots:stats error', err)
    return { totalShots: 0, totalSize: 0, deletedCount: 0 }
  }
})

// debug: indicate handlers registered
try { console.debug('IPC handler registered: screenshots:stats') } catch(e) {}

// 'screenshots:list' - return latest 4 PNGs from screenshot folder as data URLs (newest first)
ipcMain.handle('screenshots:list', async () => {
  try {
    const screenshotDir = path.join(__dirname, '..', 'screenshot')
    try { if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true }) } catch(e) {}
    const all = await fsp.readdir(screenshotDir)
    const pngs = []
    for (const fn of all) {
      const full = path.join(screenshotDir, fn)
      try {
        const stat = await fsp.stat(full)
        if (stat.isFile() && fn.toLowerCase().endsWith('.png')) {
          pngs.push({ path: full, mtime: stat.mtime.getTime() })
        }
      } catch(e) {}
    }
    // sort by mtime desc and take latest 4
    pngs.sort((a,b) => b.mtime - a.mtime)
    const latest = pngs.slice(0,4)
    const results = []
    for (const item of latest) {
      try {
        const buf = await fsp.readFile(item.path)
        const b64 = buf.toString('base64')
        results.push(`data:image/png;base64,${b64}`)
      } catch(e) {}
    }
    return results
  } catch (err) {
    console.error('screenshots:list error', err)
    return []
  }
})

try { console.debug('IPC handler registered: screenshots:list') } catch(e) {}

// 파일 변경 감시 (userPath 및 bundlePath) — 앱 준비 후에 watcher 시작
function startSettingsWatcher(win) {
  try {
    const { userPath, bundlePath } = getSettingsPaths()
    const watchers = []
    const sendChanged = () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('settings:changed', { ts: Date.now() })
      }
    }
    const watchPath = (p) => {
      try {
        const w = fs.watch(p, { persistent: true }, (eventType) => {
          // debounce
          setTimeout(sendChanged, 100)
        })
        watchers.push(w)
      } catch (err) {
        // ignore if file doesn't exist yet
      }
    }

    watchPath(userPath)
    watchPath(bundlePath)

    return () => watchers.forEach((w) => w.close())
  } catch (err) {
    console.error('startSettingsWatcher error', err)
    return () => {}
  }
}