document.addEventListener('DOMContentLoaded', () => {

  // 必要なHTML要素を取得します
  const browseFolderBtn = document.getElementById('browseFolderBtn');
  const savePathInput = document.getElementById('savePathInput');

  // browseFolderBtn が存在する場合のみ、イベントリスナーを設定
  if (browseFolderBtn && savePathInput) {
    // browseFolderBtnがクリックされた時の処理
    browseFolderBtn.addEventListener('click', async () => {
      console.log('UI -> Mainへフォルダ選択をリクエスト');

      // preload.js経由でMainプロセスに処理を依頼し、結果(フォルダパス)を待つ
      const folderPath = await window.api.selectFolder();

      // フォルダパスが正常に受け取れた場合 (キャンセルされなかった場合)
      if (folderPath) {
        console.log('Main -> UIへ選択されたパスを返信:', folderPath);
        // input要素の値を、受け取ったフォルダパスで更新する
        savePathInput.value = folderPath;
      } else {
        console.log('フォルダ選択がキャンセルされました');
      }
    });
  } else {
    console.error('フォルダ参照ボタンまたは入力欄が見つかりません。');
  }

});