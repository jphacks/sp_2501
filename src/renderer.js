var recording = false;

// HTMLドキュメントの読み込みが完了したら、以下の処理を実行する
document.addEventListener('DOMContentLoaded', () => {

  // 「開始」ボタンの要素(Element)をIDで取得します。
  const startButton = document.getElementById('btn-start');
  const stopButton = document.getElementById('btn-stop');
  const captureText = document.getElementById('capture_seigyo');
  startButton.addEventListener('click', async () => {

    if (recording) {
      startButton.innerText = `録画再開`;
      startButton.style.transition = `all 0.3s`;
      startButton.style.backgroundColor = `#3b82f6`; // 青色に戻す
      startButton.style.color = `#ffffff`;
      captureText.innerText = ``;

      recording = false;

    } else {
      startButton.innerText = `一時停止`;
      startButton.style.transition = `all 0.3s`;
      startButton.style.backgroundColor = `#44aa44`; // 赤色に変更
      startButton.style.color = `#ffffff`;

      captureText.innerText = `録画中`;
      

      recording = true;
    }

  });
  
  stopButton.addEventListener('click', async () => {
      startButton.innerText = `録画開始`;
      startButton.style.transition = `all 0.3s`;
      startButton.style.backgroundColor = `#eeeeee`;
      startButton.style.color = `#333333`;
      captureText.innerText = ``;

      recording = false;

  });

  const toggle = document.getElementById('myToggle');
  const htmlElement = document.documentElement; // <html>要素

  // トグルスイッチの状態が変更された時の処理
  toggle.addEventListener('change', function() {
    // 'this.checked' は、スイッチがオンの時に true になります
    if (this.checked) {
      // スイッチがオンになった時の処理
      console.log('スイッチがオンになりました -> ダークモード適用');
      htmlElement.setAttribute('data-theme', 'dark');
    } else {
      // スイッチがオフになった時の処理
      console.log('スイッチがオフになりました -> ダークモード解除');
      htmlElement.removeAttribute('data-theme');
    }
  });

});





