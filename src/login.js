
// 後から機能を紐付けるためのイベントリスナー設定例
document.getElementById('closeButton').addEventListener('click', function() {
    console.log('閉じるボタンがクリックされました');
    window.location.href = 'https://www.google.com';
    // ここに閉じる処理を追加
});

document.getElementById('googleLoginButton').addEventListener('click', function() {
    console.log('Googleログインボタンがクリックされました');
    window.location.href = 'screenshot.html';
});