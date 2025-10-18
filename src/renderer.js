// HTMLの各要素(Element)をIDで取得します。
const intervalInput = document.getElementById('interval');
const resolutionSelect = document.getElementById('resolution');
const startButton = document.getElementById('btn-start');
const stopButton = document.getElementById('btn-stop');
const statusText = document.getElementById('status-text'); // ステータス表示用のspan要素

// 「開始」ボタンがクリックされた時の処理
startButton.addEventListener('click', async () => {
  const settings = {
    interval: intervalInput.value,
    resolution: resolutionSelect.value,
  };
  startButton.document = "うんち";

  console.log('UI -> Mainへ録画開始をリクエスト:', settings);
  statusText.textContent = 'バックエンドに開始リクエストを送信中...';

  // preload.js経由で、メインプロセスに処理を依頼します。
  const response = await window.api.startRecording(settings);
  console.log('Main -> UIへ応答を受信:', response);
  
  // バックエンドからの応答メッセージを画面に表示します。
  statusText.textContent = `バックエンドからの応答: ${response.message}`;
});

// 「停止」ボタンがクリックされた時の処理
stopButton.addEventListener('click', async () => {
  console.log('UI -> Mainへ録画停止をリクエスト');
  statusText.textContent = 'バックエンドに停止リクエストを送信中...';

  // preload.js経由で、メインプロセスに処理を依頼します。
  const response = await window.api.stopRecording();
  console.log('Main -> UIへ応答を受信:', response);

  // バックエンドからの応答メッセージを画面に表示します。
  statusText.textContent = `バックエンドからの応答: ${response.message}`;
});