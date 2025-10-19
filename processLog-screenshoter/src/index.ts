// src/index.ts
import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises'; // Async ファイルシステム API
import { ChildProcess, spawn } from 'child_process';
import axios from 'axios';

// Squirrel アップデートハンドラ (Windows インストーラ用)
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Webpack が注入するグローバル変数
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// --- グローバル変数とパス定義 ---
const isDev = !app.isPackaged;
const resourcesPath = isDev
  ? path.join(__dirname, '../../') // 開発: プロジェクトルート
  : process.resourcesPath;         // 配布: resources フォルダ

// 1. Python 子プロセス参照変数
let appPy: ChildProcess | null = null;
let uploaderPy: ChildProcess | null = null;
let mainWindowRef: BrowserWindow | null = null; // mainWindow 参照を保存

// 에러에서 메시지를 안전하게 추출하는 헬퍼
const getErrorMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  try { return String(err); } catch { return 'Unknown error'; }
};

// 2. Python スクリプト実行パス
const pythonPath = isDev ? 'python' : path.join(resourcesPath, 'venv', 'python.exe'); // (配布時の venv パス)
const appPyPath = path.join(resourcesPath, 'backend', 'app.py');
const uploaderPyPath = path.join(resourcesPath, 'backend', 'uploader.py');

// 3. UI ロード URL と API
const UI_URL = 'https://process-log.vercel.app';
const LOCAL_FLASK_API = 'http://localhost:5001';

// 4. ファイルとフォルダ名
const SETTINGS_FILE_NAME = 'user-settings.json';
const SCREENSHOT_FOLDER = 'screenshot';
const UPLOADED_SUBFOLDER = 'uploaded';

// 5. [修正] 動的パス定義
// ユーザーデータフォルダ内の設定ファイルパス (app.getPath を使用)
const userSettingsPath = path.join(app.getPath('userData'), SETTINGS_FILE_NAME);
// 프로젝트 루트 내 스크린샷 폴더 경로
const screenshotPath = path.join(resourcesPath, SCREENSHOT_FOLDER);
const uploadedPath = path.join(screenshotPath, UPLOADED_SUBFOLDER);
// 프로젝트 루트 내 업로더 설정 파일 경로
const uploaderConfigPath = path.join(resourcesPath, 'uploader_config.json'); // CONFIG_FILE_PATH -> uploaderConfigPath

const defaultSettings = {
  interval: 5,         // 秒単位
  resolution: '1.0',   // 文字列
  deleteAfterUpload: false,
};

// --- 유틸리티 함수 ---

const sendLogToUI = (message: string) => {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('log-message', `[${new Date().toLocaleTimeString()}] ${message}`);
  }
  console.log(`[LOG] ${message}`); // メインプロセスのコンソールにも出力
};

// [추가] 설정을 읽는 별도 함수
async function readSettings(): Promise<typeof defaultSettings> {
  try {
    if (fs.existsSync(userSettingsPath)) {
      const content = await fsp.readFile(userSettingsPath, 'utf8');
      // 기본값과 병합하여 반환 (누락된 키 방지)
      return { ...defaultSettings, ...JSON.parse(content) };
    }
  } catch (error) {
    sendLogToUI(`[エラー] 設定ファイルの読み込みに失敗しました: ${getErrorMessage(error)}`);
  }
  return defaultSettings; // 실패 시 기본값 반환
}

// --- createWindow 함수 ---
const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    //height: 900,
    //width: 1460,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });
  mainWindowRef = mainWindow;
  // Vercel アプリをロード
  mainWindow.loadURL(UI_URL);
mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
});
  // (任意) 開発者ツールを開く
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
};

// --- Python プロセス管理 ---

// Python プロセスを実行
const startPythonProcesses = () => {
  sendLogToUI('Python プロセスを開始しています...');
  // console.log('App.py Path:', appPyPath);
  // console.log('Uploader.py Path:', uploaderPyPath);

  try { // [추가] spawn 자체에서 오류가 발생할 수 있으므로 try...catch 추가
    // (1) 캡처 서버 (app.py) 실행
    appPy = spawn(pythonPath, [appPyPath]);

    if (appPy) {
      if (appPy.stdout) appPy.stdout.on('data', (data) => sendLogToUI(`[App.py]: ${data.toString().trim()}`));
      if (appPy.stderr) appPy.stderr.on('data', (data) => sendLogToUI(`[App.py ERR]: ${data.toString().trim()}`));
      appPy.on('close', (code) => sendLogToUI(`App.py 終了 (コード: ${code})`));
      appPy.on('error', (err) => sendLogToUI(`[App.py SPAWN ERR]: ${getErrorMessage(err)}`)); // spawn エラー処理
    } else {
      sendLogToUI('[エラー] App.py プロセスを起動できませんでした。');
    }

    // (2) 업로더 (uploader.py) 실행
    uploaderPy = spawn(pythonPath, [uploaderPyPath]);

    if (uploaderPy) {
      if (uploaderPy.stdout) uploaderPy.stdout.on('data', (data) => sendLogToUI(`[Uploader.py]: ${data.toString().trim()}`));
      if (uploaderPy.stderr) uploaderPy.stderr.on('data', (data) => sendLogToUI(`[Uploader.py ERR]: ${data.toString().trim()}`));
      uploaderPy.on('close', (code) => sendLogToUI(`Uploader.py 終了 (コード: ${code})`));
      uploaderPy.on('error', (err) => sendLogToUI(`[Uploader.py SPAWN ERR]: ${getErrorMessage(err)}`)); // spawn エラー処理
    } else {
      sendLogToUI('[エラー] Uploader.py プロセスを起動できませんでした。');
    }
  } catch (error) { // [추가] spawn 자체 오류 처리
      sendLogToUI(`[エラー] Python プロセス spawn に失敗しました: ${getErrorMessage(error)}`);
      appPy = null; // 오류 발생 시 null로 확실히 설정
      uploaderPy = null;
  }
};
// Python 프로세스 종료
const killPythonProcesses = () => {
  console.log('Stopping Python processes...');
  if (appPy) appPy.kill();
  if (uploaderPy) uploaderPy.kill();
};

// --- 인증 토큰 관리 ---

const updateUploaderConfig = (token: string | null, email: string | null) => {
  try {
    const config = {
      sessionToken: token,
      userEmail: email,
    };
    // [수정] uploaderConfigPath 사용
    fs.writeFileSync(uploaderConfigPath, JSON.stringify(config, null, 2));
    if(token) {
      console.log('[Auth] uploader_config.jsonにセッショントークンの保存に成功。');
    } else {
      console.log('[Auth] ログアウト。uploader_config.jsonを初期化しました。');
    }
  } catch (error) {
    console.error('[Auth] uploader_config.jsonの書き込みに失敗しました:', error);
  }
};

const setupAuthTokenListener = () => {
  // Vercel 도메인에 대한 쿠키만 감시
    // 우리가 찾는 쿠키 이름
    const AUTH_COOKIE_NAME = '__Secure-next-auth.session-token';
    // (Vercel 배포 시 __Secure- 접두사가 붙습니다. 로컬 테스트 시 'next-auth.session-token')
    const LOCAL_AUTH_COOKIE_NAME = 'next-auth.session-token';
  const filter = { urls: [UI_URL + '/*'] };

  session.defaultSession.cookies.on('changed', async (event, cookie, cause, removed) => {

    if (cookie.name === AUTH_COOKIE_NAME || cookie.name === 'next-auth.session-token') {
      if (removed || cause === 'expired') {
        // 로그아웃 또는 만료
        updateUploaderConfig(null, null);
      } else if (cause === 'explicit') {
        // 로그인 성공 (쿠키 생성됨)
        // (이메일은 현재 알 수 없으므로 null 또는 다른 IPC로 받아와야 함)
        // (우선 토큰만 저장)
        updateUploaderConfig(cookie.value, null);
      }
    }
  });
  (async () => {
    try { // [추가] 오류 처리를 위해 try...catch 추가
      const cookies = await session.defaultSession.cookies.get({ url: UI_URL });
      // 👇 [수정] 함수 최상단에 정의된 상수 사용
      const authToken = cookies.find(c => c.name === AUTH_COOKIE_NAME || c.name === LOCAL_AUTH_COOKIE_NAME);
      if (authToken) {
        updateUploaderConfig(authToken.value, null);
      } else {
        updateUploaderConfig(null, null); // 초기화
      }
    } catch (error) { // [추가] 쿠키 읽기 오류 처리
    sendLogToUI(`[エラー] 初期クッキー確認失敗:${getErrorMessage(error)}`);
        updateUploaderConfig(null, null); // 오류 시에도 초기화
    }
  })();
};

// --- Electron App Lifecycle ---

app.on('ready', () => {
  // UserAgent 설정 (Google 로그인용)
  const chromeUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  session.defaultSession.setUserAgent(chromeUserAgent);

  setupAuthTokenListener(); //쿠키 리스너 시작
  startPythonProcesses();
  createWindow();
});

app.on('window-all-closed', () => { 
  killPythonProcesses(); // 모든 창이 닫히면 Python 종료
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// --- IPC 핸들러 (UI -> Main) ---

// 캡처 시작 요청 (UI -> Main -> app.py)
ipcMain.handle('start-capture', async (event, settings) => {
  // 👇 [추가] 핸들러 호출 로그
  sendLogToUI('IPCハンドラ"start-capture"受信。設定: ' + JSON.stringify(settings));
  try {
    // 👇 [추가] Axios 호출 직전 로그
    sendLogToUI(`Axios POSTリクエスト送信試行: ${LOCAL_FLASK_API}/start`);

    const response = await axios.post(`${LOCAL_FLASK_API}/start`, settings);

    // 👇 [추가] Axios 응답 성공 로그
    sendLogToUI(`Axios 応答成功 (${response.status}): ${JSON.stringify(response.data)}`);
    return { success: true, message: response.data.message };

  } catch (error) {
    // 👇 [수정] Axios 오류 상세 로그
    let errorMessage = '不明なエラー';
    if (axios.isAxiosError(error)) { // Axios 오류인지 확인
      errorMessage = error.message;
      if (error.response) {
        // 서버가 오류 응답을 반환한 경우 (4xx, 5xx)
        errorMessage += ` | サーバー応答 (${error.response.status}): ${JSON.stringify(error.response.data)}`;
      } else if (error.request) {
        // 요청은 보냈으나 응답을 받지 못한 경우 (네트워크 오류, 서버 다운 등)
        errorMessage += ' | サーバーからの応答がありません。Flaskサーバー(app.py)が実行中か確認してください。';
      }
    } else if (error instanceof Error) {
        errorMessage = error.message;
    }
    sendLogToUI(`[エラー] Axios POSTリクエスト失敗: ${errorMessage}`); // 상세 오류 로그 UI 전송
    console.error('[IPC Error] Start Capture:', error); // 콘솔에도 전체 오류 출력
    return { success: false, message: errorMessage }; // UI에도 오류 메시지 전달
  }
});

// 캡처 중지 요청 (UI -> Main -> app.py)
ipcMain.handle('stop-capture', async () => {
  try {
    const response = await axios.post(`${LOCAL_FLASK_API}/stop`);
    return { success: true, message: response.data.message };
  } catch (error) {
    console.error('[IPC Error] Stop Capture:', getErrorMessage(error));
    // axios error 일 경우 응답 메시지를 우선적으로 사용
    if (axios.isAxiosError(error)) {
      return { success: false, message: error.response?.data?.message || error.message };
    }
    return { success: false, message: getErrorMessage(error) };
  }
});

// [수정] 설정 읽기 핸들러 (별도 함수 호출)
ipcMain.handle('settings:read', async () => {
  return await readSettings();
});

// [수정] 설정 쓰기 핸들러 (별도 함수 호출)
ipcMain.handle('settings:write', async (event, settings) => {
  try {
    const currentSettings = await readSettings(); // 수정된 readSettings 함수 사용
    const newSettings = { ...currentSettings, ...settings }; // 병합
    await fsp.writeFile(userSettingsPath, JSON.stringify(newSettings, null, 2), 'utf8');

    // uploader_config.json에도 deleteAfterUpload 반영
    if (typeof settings.deleteAfterUpload === 'boolean') {
        try {
            let uploaderCfg = {};
             if (fs.existsSync(uploaderConfigPath)) { // [수정] uploaderConfigPath 사용
                 try {
                     uploaderCfg = JSON.parse(await fsp.readFile(uploaderConfigPath, 'utf-8')); // [수정] uploaderConfigPath 사용
                 } catch {/*무시*/}
             }
            const nextUploaderCfg = {...uploaderCfg, deleteAfterUpload: settings.deleteAfterUpload };
            await fsp.writeFile(uploaderConfigPath, JSON.stringify(nextUploaderCfg, null, 2), 'utf8'); // [수정] uploaderConfigPath 사용
    } catch (e) {
      sendLogToUI(`[エラー] uploader_config.jsonの更新に失敗しました: ${getErrorMessage(e)}`);
    }
    }

    sendLogToUI('設定が保存されました。');
    return { success: true };
  } catch (error) {
    sendLogToUI(`[エラー] 設定ファイルの書き込みに失敗しました: ${getErrorMessage(error)}`);
    return { success: false, error: getErrorMessage(error) };
  }
});

// [수정] 통계 가져오기 핸들러
ipcMain.handle('stats:get', async () => {
  const stats: { totalShots: number; totalSize: number; uploadedCount: number } = {
    totalShots: 0,
    totalSize: 0,
    uploadedCount: 0,
  };
  try {
    // screenshotPath (전역 변수) 접근 확인
    if (fs.existsSync(screenshotPath)) {
      const files = await fsp.readdir(screenshotPath);
      for (const file of files) {
        // [수정] uploaded 폴더 자체 제외
        if (file.toLowerCase().endsWith('.png') && file !== UPLOADED_SUBFOLDER) { 
          const filePath = path.join(screenshotPath, file);
          try {
            const fileStat = await fsp.stat(filePath);
            if (fileStat.isFile()) {
              stats.totalShots++;
              stats.totalSize += fileStat.size;
            }
          } catch { /* 파일 접근 오류 무시 */ }
        }
      }
    } else {
        // [추가] 폴더 없을 시 로그
        sendLogToUI(`［情報］スクリーンショットフォルダーなし: ${screenshotPath}`);
    }

    // uploadedPath (전역 변수) 접근 확인
    if (fs.existsSync(uploadedPath)) {
        const uploadedFiles = await fsp.readdir(uploadedPath);
        // [수정] filter로 변경
        stats.uploadedCount = uploadedFiles.filter(f => f.toLowerCase().endsWith('.png')).length;
    } else {
        // [추가] 폴더 없을 시 로그
        sendLogToUI(`［情報］アップロードフォルダーなし: ${uploadedPath}`);
    }
  } catch (error) {
    sendLogToUI(`[エラー] 統計計算失敗: ${getErrorMessage(error)}`);
  }
  return stats;
});

// [수정] 스크린샷 목록 핸들러 (Data URL 반환)
ipcMain.handle('screenshots:list', async (event, limit = 4) => {
  const results: string[] = [];
  try {
    // screenshotPath (전역 변수) 접근 확인
    if (fs.existsSync(screenshotPath)) {
      const files = await fsp.readdir(screenshotPath);
      const pngFiles: { path: string; mtime: number }[] = [];
      for (const file of files) {
        // [수정] uploaded 폴더 자체 제외
        if (file.toLowerCase().endsWith('.png') && file !== UPLOADED_SUBFOLDER) {
          const filePath = path.join(screenshotPath, file);
          try {
            const stat = await fsp.stat(filePath);
            if (stat.isFile()) {
              pngFiles.push({ path: filePath, mtime: stat.mtimeMs });
            }
          } catch { /* 무시 */ }
        }
      }
      // 최신순 정렬
      pngFiles.sort((a, b) => b.mtime - a.mtime);
      // 제한 개수만큼 읽어서 Data URL 생성
      const latestFiles = pngFiles.slice(0, limit);
      for (const fileInfo of latestFiles) {
        try {
          const buffer = await fsp.readFile(fileInfo.path);
          const base64 = buffer.toString('base64');
          results.push(`data:image/png;base64,${base64}`);
        } catch { /* 파일 읽기 오류 무시 */ }
      }
    } else {
        // [추가] 폴더 없을 시 로그
        sendLogToUI(`[情報] スクリーンショットフォルダーなし (一覧): ${screenshotPath}`);
    }
  } catch (error) {
    sendLogToUI(`[エラー] スクリーンショット一覧の生成に失敗しました: ${getErrorMessage(error)}`);
  }
  return results;
});

// 창 닫기 핸들러
ipcMain.handle('window:close', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    window.close();
  }
});