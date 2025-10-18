import os
import time
import requests # HTTP通信ライブラリー
import schedule # 定期的な作業のためのライブラリ
import image_util # ★ Base64エンコード用のユーティリティ
import shutil # ファイル移動のためのライブラリ


# --- 設定 ---
# app.pyと同じロジックでscreenshotフォルダのパスを見つけます。
# (backendフォルダの親フォルダ(プロジェクトルート) + 'screenshot')
REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
SCREENSHOT_DIR = os.path.join(REPO_ROOT, 'screenshot')

# ★★★ 送信するVercel APIのURLを入力してください。 ★★★
request_URL = "" # 例: 'myapp.vercel.app'
VERCEL_API_URL = f'https://{request_URL}/api/upload'

UPLOAD_INTERVAL_SECONDS = 10 # 10秒ごとにフォルダを確認
BATCH_SIZE = 2               # 2つずつまとめて送信
# 送信後の処理: True=送信後にファイルを削除, False=削除せず "uploaded" サブフォルダへ移動
DELETE_AFTER_UPLOAD = False  #ファイルを削除する場合はTrue、移動する場合はFalseに設定
UPLOADED_SUBDIR = 'uploaded'

# --- 送信ロジック (JSON/Base64方式に更新) ---

def send_screenshots(filepaths):
    """
    ★★★ (変更点) ★★★
    ファイルをBase64エンコードし、JSONペイロードとしてサーバーにPOST送信します。
    """
    print(f"JSON送信試行: {len(filepaths)}個のファイル")

    payload_screenshots = []
    
    try:
        # 各ファイルをエンコードしてペイロードリストに追加
        for path in filepaths:
            filename = os.path.basename(path)
            # image_util を使ってエンコード
            base64_data_uri = image_util.encode_image_to_base64_data_uri(path)
            
            if base64_data_uri:
                payload_screenshots.append({
                    "filename": filename,
                    "data": base64_data_uri # Base64エンコードされたData URI
                })
            else:
                print(f"エンコード失敗: {path}")
                return False # 1つでも失敗したらバッチ全体を中止

        # 最終的なJSONペイロードを作成
        json_payload = {
            "screenshots": payload_screenshots
        }

        # サーバーにJSONとしてデータ送信 (files=... の代わりに json=...)
        response = requests.post(VERCEL_API_URL, json=json_payload)

        if response.status_code == 200:
            print(f"送信成功 (JSON/Base64): {response.json().get('message')}")
            return True
        else:
            print(f"送信失敗: {response.status_code}, {response.text}")
            return False

    except Exception as e:
        print(f"JSON送信中に例外発生: {e}")
        return False
    # finallyブロックは不要です (image_util内の 'with open' が自動でファイルを閉じます)


# --- メイン作業関数 ---
def job():
    """
    フォルダを確認し、古いファイルを見つけて送信を試みるメイン作業
    """
    print(f"フォルダ確認中: {SCREENSHOT_DIR}")
    
    # フォルダ準備 (job内で毎回チェック)
    try:
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)
        if not DELETE_AFTER_UPLOAD:
            uploaded_dir = os.path.join(SCREENSHOT_DIR, UPLOADED_SUBDIR)
            os.makedirs(uploaded_dir, exist_ok=True)
    except Exception as e:
        print(f"フォルダの準備に失敗しました: {e}")
        return # フォルダ準備が失敗したらジョブを中断
    
    try:
        # 一時ファイルを除外し、'uploaded' サブディレクトリも除外
        all_files = []
        for f in os.listdir(SCREENSHOT_DIR):
            if f.endswith('.png') and not f.startswith('temp_'):
                # 'uploaded' ディレクトリ内のファイルではないことを確認
                if os.path.isfile(os.path.join(SCREENSHOT_DIR, f)):
                     all_files.append(f)

        # ファイルパスリストを生成
        full_paths = [os.path.join(SCREENSHOT_DIR, f) for f in all_files]

        # 作成(修正)時間が古い順にソート
        full_paths.sort(key=os.path.getmtime)
        
        if len(full_paths) >= BATCH_SIZE:
            # 送信するファイルバッチを選定 (最も古いBATCH_SIZE個)
            files_to_send = full_paths[:BATCH_SIZE]

            print(f"送信対象発見: {files_to_send}")

            # 送信試行
            if send_screenshots(files_to_send):
                # 送信成功時の後処理: 削除またはアップロード済フォルダへ移動
                if DELETE_AFTER_UPLOAD:
                    for path in files_to_send:
                        try:
                            os.remove(path)
                            print(f"削除完了: {path}")
                        except Exception as e:
                            print(f"削除失敗: {path} - {e}")
                else:
                    # uploaded サブフォルダに移動して「送信済み」を表す
                    uploaded_dir = os.path.join(SCREENSHOT_DIR, UPLOADED_SUBDIR)
                    # (フォルダは既に上で作成済み)
                    for path in files_to_send:
                        try:
                            dest = os.path.join(uploaded_dir, os.path.basename(path))
                            # shutil.move はファイルを移動（名前変更）します
                            shutil.move(path, dest)
                            print(f"移動完了: {path} -> {dest}")
                        except Exception as e:
                            print(f"移動失敗: {path} - {e}")
            else:
                print("送信に失敗したため、ファイルを処理しません。")

        else:
            print(f"ファイルが{BATCH_SIZE}個未満です。 (現在: {len(full_paths)}個). 待機します。")

    except Exception as e:
        print(f"作業中にエラーが発生しました: {e}")

# --- スクリプト実行 ---
if __name__ == "__main__":
    print("--- スクリーンショットアップローダー (Base64/JSON) 開始 ---")
    print(f"監視対象フォルダ: {SCREENSHOT_DIR}")
    print(f"送信対象サーバー: {VERCEL_API_URL}")
    print(f"{UPLOAD_INTERVAL_SECONDS}秒ごとに{BATCH_SIZE}個ずつ送信を試みます。")
    print(f"送信後の処理: {'削除' if DELETE_AFTER_UPLOAD else '移動'}")

    # scheduleライブラリを使用してUPLOAD_INTERVAL_SECONDSごとにjob関数を実行
    try:
        import schedule
    except ImportError:
        print("エラー: 'schedule'ライブラリが必要です。'py -m pip install schedule'を実行してください。")
        exit(1)

    # フォルダが存在しない場合は作成 (起動時に1回実行)
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    if not DELETE_AFTER_UPLOAD:
        os.makedirs(os.path.join(SCREENSHOT_DIR, UPLOADED_SUBDIR), exist_ok=True)
    
    schedule.every(UPLOAD_INTERVAL_SECONDS).seconds.do(job)

    try:
        while True:
            schedule.run_pending()
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nアップローダーを終了します。")