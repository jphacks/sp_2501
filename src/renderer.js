var index = 0;

// HTMLドキュメントの読み込みが完了したら、以下の処理を実行する
document.addEventListener('DOMContentLoaded', () => {

  // 「開始」ボタンの要素(Element)をIDで取得します。
  const startButton = document.getElementById('btn-start');
  startButton.addEventListener('click', async () => {
    console.log('Renderer: 録画開始ボタンがクリックされました。');
    startButton.innerText += `w`;
    index++;
  });

});