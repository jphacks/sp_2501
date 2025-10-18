var recording = false;

// HTMLドキュメントの読み込みが完了したら、以下の処理を実行する
document.addEventListener('DOMContentLoaded', () => {

  // 「開始」ボタンの要素(Element)をIDで取得します。
  const startButton = document.getElementById('btn-start');
  startButton.addEventListener('click', async () => {

    if (recording) {
      startButton.innerText = `録画開始`;
      startButton.style.transition = `all 0.3s`;
      startButton.style.backgroundColor = `#3b82f6`; // 青色に戻す
      startButton.style.rotate = `0deg`;
      recording = false;
    } else {
      startButton.innerText = `録画停止`;
      startButton.style.transition = `all 0.3s`;
      startButton.style.backgroundColor = `#ef4444`; // 赤色に変更
      startButton.style.rotate = `360deg`;
      recording = true;
    }
  });

});