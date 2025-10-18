import os
import time
import requests # HTTP通信ライブラリー
import schedule # 定期的な作業のためのライブラリ (py -m pip install schedule)
import image_util
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
BATCH_SIZE = 2              # 2つずつまとめて送信
# 送信後の処理: True=送信後にファイルを削除, False=削除せず "uploaded" サブフォルダへ移動
DELETE_AFTER_UPLOAD = False   #ファイルを削除する場合はTrue、移動する場合はFalseに設定
UPLOADED_SUBDIR = 'uploaded'

# --- 送信ロジック ---

def send_screenshots(filepaths):
    """
    指定されたファイルパスのリストをmultipart/form-dataでサーバーにPOST送信します。
    """
    print(f"送信試行: {len(filepaths)}個のファイル")

    # 必要なフォルダが存在するかを事前にチェック・作成
    try:
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)
        if not DELETE_AFTER_UPLOAD:
            uploaded_dir = os.path.join(SCREENSHOT_DIR, UPLOADED_SUBDIR)
            os.makedirs(uploaded_dir, exist_ok=True)
    except Exception as e:
        print(f"フォルダの準備に失敗しました: {e}")

    opened_files = [] # 開いたファイルオブジェクトを管理するためのリスト
    try:
        # 'rb' (read binary)モードでファイルを開いてリストに追加
        files_data = {}
        for i, path in enumerate(filepaths):
            filename = os.path.basename(path)
            file_obj = open(path, 'rb')
            opened_files.append(file_obj)
            # (フィールド名, (ファイル名, ファイルオブジェクト, コンテンツタイプ))
            files_data[f'screenshot{i+1}'] = (filename, file_obj, 'image/png')

        # サーバーにデータを送信
        response = requests.post(VERCEL_API_URL, files=files_data)

        if response.status_code == 200:
            print(f"送信成功: {response.json().get('message')}")
            return True
        else:
            print(f"送信失敗: {response.status_code}, {response.text}")
            return False

    except Exception as e:
        print(f"送信中に例外が発生しました: {e}")
        return False
    finally:
        # 送信成功/失敗に関わらずすべてのファイルオブジェクトを閉じます。
        for f in opened_files:
            f.close()

# --- メイン作業関数 ---

def job():
    """
    フォルダを確認し、古いファイルを見つけて送信を試みるメイン作業
    """
    print(f"フォルダ確認中: {SCREENSHOT_DIR}")
    
    try:
        # 一時ファイルを除外したPNGファイルのリストアップ
        all_files = [f for f in os.listdir(SCREENSHOT_DIR)
                     if f.endswith('.png') and not f.startswith('temp_')]

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
                    os.makedirs(uploaded_dir, exist_ok=True)
                    for path in files_to_send:
                        try:
                            dest = os.path.join(uploaded_dir, os.path.basename(path))
                            # shutil.move はファイルを移動（名前変更）します
                            shutil.move(path, dest)
                            print(f"移動完了: {path} -> {dest}")
                        except Exception as e:
                            print(f"移動失敗: {path} - {e}")
            else:
                print("送信に失敗したため、ファイルを削除しません。")

        else:
            print(f"ファイルが{BATCH_SIZE}個未満です。 (現在: {len(full_paths)}個). 待機します。")

    except Exception as e:
        print(f"作業中にエラーが発生しました: {e}")

# --- スクリプト実行 ---

if __name__ == "__main__":
    print("--- スクリーンショットアップローダー開始 ---")
    print(f"監視対象フォルダ: {SCREENSHOT_DIR}")
    print(f"送信対象サーバー: {VERCEL_API_URL}")
    print(f"{UPLOAD_INTERVAL_SECONDS}秒ごとに{BATCH_SIZE}個ずつ送信を試みます。")

    # scheduleライブラリを使用してUPLOAD_INTERVAL_SECONDSごとにjob関数を実行
    # (py -m pip install schedule が必要)
    try:
        import schedule
    except ImportError:
        print("エラー: 'schedule'ライブラリが必要です。'py -m pip install schedule'を実行してください。")
        exit(1)

    # フォルダが存在しない場合は作成
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    
    schedule.every(UPLOAD_INTERVAL_SECONDS).seconds.do(job)

    try:
        while True:
            schedule.run_pending()
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nアップローダーを終了します。")