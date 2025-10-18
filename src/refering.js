// 開発用モック（ブラウザでテストする時のみ）
if (!window.api) {
  window.api = {
    selectFolder: async () => {
      const p = prompt('モック: フォルダパスを入力してください', 'C:\\path\\to\\folder');
      return p ? p : null;
    }
  };
}


document.addEventListener('DOMContentLoaded', () => {

  // 必要なHTML要素を取得します
  const browseFolderBtn = document.getElementById('browseFolderBtn');
  const savePathInput = document.getElementById('savePathInput');

  // browseFolderBtn が存在する場合のみ、イベントリスナーを設定
  if (browseFolderBtn && savePathInput) {
    // クリックハンドラを async にして、結果を同じスコープで扱う
    browseFolderBtn.addEventListener('click', async () => {
      console.log('UI -> Mainへフォルダ選択をリクエスト');

      // window.api.selectFolder の存在チェック
      if (!window.api || typeof window.api.selectFolder !== 'function') {
        console.error('window.api.selectFolder is not available');
        return; // ここで中断（エラーの重複発生を防ぐ）
      }

      try {
        // 非同期で選択ダイアログを開き、戻り値をここで受け取る
        const folderPath = await window.api.selectFolder();

        // フォルダパスが正常に受け取れた場合 (キャンセルされなかった場合)
        if (folderPath) {
          console.log('Main -> UIへ選択されたパスを返信:', folderPath);
          // input要素の値を、受け取ったフォルダパスで更新する
          savePathInput.value = folderPath;
        } else {
          console.log('フォルダ選択がキャンセルされました');
        }
      } catch (err) {
        console.error('フォルダ選択でエラー:', err);
      }
    });
  } else {
    console.error('フォルダ参照ボタンまたは入力欄が見つかりません。');
  }

});