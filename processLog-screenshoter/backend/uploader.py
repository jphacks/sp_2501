# backend/uploader.py

import os
import time
import schedule
import requests
import json
import shutil
# image_util のインポートはそのまま維持
from image_util import encode_image_to_base64_data_uri

# --- 設定 (既存と同様) ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREENSHOT_DIR = os.path.join(BASE_DIR, 'screenshot')
UPLOADED_DIR = os.path.join(SCREENSHOT_DIR, 'uploaded')
CONFIG_FILE = os.path.join(BASE_DIR, 'uploader_config.json')
VERCEL_API_URL = "https://process-log.vercel.app/api/diff"
UPLOAD_INTERVAL_SECONDS = 5  # テストのため5秒に維持（必要なら10秒に変更）
BATCH_SIZE = 2

# --- API 送信ロジック (修正: auth_token, user_email 引数追加) ---
def send_screenshots(filepaths, auth_token, user_email): # user_email은 디버깅용
    print(f"送信を試みます: {len(filepaths)}個のファイル...")

    payload_screenshots = []
    try:
        for path in filepaths:
            filename = os.path.basename(path)
            base64_data = encode_image_to_base64_data_uri(path)
            if base64_data:
                payload_screenshots.append({
                    "filename": filename,
                    "data": base64_data
                })
            else:
                print(f"ファイルのエンコードに失敗しました: {path}")
                return False
    except Exception as e:
        print(f"ファイル処理中にエラーが発生しました: {e}")
        return False

    json_payload = { "screenshots": payload_screenshots }
    headers = {
        "Content-Type": "application/json",
        # ヘッダーにトークンを含める (user_emailは送信しない)
        "Authorization": f"Bearer {auth_token}"
    }

    try:
        response = requests.post(VERCEL_API_URL, json=json_payload, headers=headers)
        if response.status_code == 200:
            print(f"送信成功: {response.json().get('message')}")
            return True
        else:
            print(f"送信失敗 (サーバー応答 {response.status_code}): {response.text}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"ネットワークエラー (送信失敗): {e}")
        return False

# --- メイン作業関数 (修正) ---
def job():
    print(f"[{time.strftime('%H:%M:%S')}] アップロード作業を実行しています...")

    # --- 👇 [修正] ファイル数確認を先頭に移動 ---
    try:
        # uploaded 폴더 제외하고 .png 파일만 필터링
        all_files = [
            f for f in os.listdir(SCREENSHOT_DIR)
            if os.path.isfile(os.path.join(SCREENSHOT_DIR, f)) and f.endswith('.png')
        ]

        # ファイル数が BATCH_SIZE 未満なら終了
        if len(all_files) < BATCH_SIZE:
            print(f"送信待ちファイルが不足しています (現在: {len(all_files)}個)。処理をスキップします。")
            return # 함수 종료

    except FileNotFoundError:
        # スクリーンショットフォルダがない場合、作成を試みて終了 (次の実行で再試行)
        print(f"スクリーンショットフォルダ({SCREENSHOT_DIR})がありません。フォルダを作成してからスキップします。")
        try:
            os.makedirs(SCREENSHOT_DIR, exist_ok=True)
            os.makedirs(UPLOADED_DIR, exist_ok=True) # uploaded 폴더도 같이 생성
        except Exception as mkdir_e:
            print(f"フォルダ作成失敗: {mkdir_e}")
        return # 함수 종료
    except Exception as e:
        print(f"ファイルスキャン中にエラーが発生しました (作業中断): {e}")
        return # 함수 종료
    # --- [수정 끝] ---

    # --- (ファイル数が十分な場合のみ以下を実行) ---

    # 設定ファイル読み取り (トークンと削除オプション)
    should_delete = False
    auth_token = None
    user_email = None # 디버깅용

    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                should_delete = bool(config.get('deleteAfterUpload', False))
                auth_token = config.get('sessionToken')
                user_email = config.get('userEmail') # (선택적)
        except Exception as e:
            print(f'uploader_config.json 読み取りエラー: {e}')

    print(f"現在の設定: 送信後削除 = {should_delete}")

    # 토큰 확인 (파일 개수 확인 이후)
    if not auth_token:
        print("認証トークンが見つかりません (uploader_config.json)。ログイン状態を確認してください。")
        return # 토큰 없으면 종료

    # uploaded フォルダ存在確認 (上で作成を試みたため、必要に応じて再確認)
    os.makedirs(UPLOADED_DIR, exist_ok=True)

    try:
    # ファイル一覧を再生成してソート (件数確認後なので安全)
    # ここで all_files 変数を再利用します。
        full_paths = [os.path.join(SCREENSHOT_DIR, f) for f in all_files]
        full_paths.sort(key=os.path.getmtime) # 생성(수정) 시간순 정렬

    # 送信するファイルを選択 (最も古い BATCH_SIZE 個)
        files_to_send = full_paths[:BATCH_SIZE]

        # API 送信を試みます
        if send_screenshots(files_to_send, auth_token, user_email):
            # 送信成功時: 削除または移動
            if should_delete:
                print(f"削除モード有効。送信された {len(files_to_send)} 個のファイルを削除します...")
                for path in files_to_send:
                    try:
                        os.remove(path)
                        print(f"削除完了: {os.path.basename(path)}")
                    except Exception as e:
                        print(f"削除失敗: {os.path.basename(path)} - {e}")
            else:
                print(f"移動モード有効。送信された {len(files_to_send)} 個のファイルを移動します...")
                for path in files_to_send:
                    try:
                        dest = os.path.join(UPLOADED_DIR, os.path.basename(path))
                        shutil.move(path, dest)
                        print(f"移動完了: {os.path.basename(path)} -> uploaded")
                    except Exception as e:
                        print(f"移動失敗: {os.path.basename(path)} - {e}")
        else:
            print("送信失敗。ファイルは処理しません。")

    except Exception as e:
        print(f"ファイル送信/処理中にエラーが発生しました: {e}")

# --- スケジューラ実行 (既存と同様) ---
if __name__ == "__main__":
    print("--- スクリーンショットアップローダー開始 ---")
    print(f"監視対象: {SCREENSHOT_DIR}")
    print(f"送信周期: {UPLOAD_INTERVAL_SECONDS}秒")

    # 起動時にフォルダ作成を試みます (任意だが推奨)
    try:
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)
        os.makedirs(UPLOADED_DIR, exist_ok=True)
    except Exception as e:
        print(f"起動時のフォルダ作成失敗 (無視可): {e}")

    schedule.every(UPLOAD_INTERVAL_SECONDS).seconds.do(job)

    while True:
        try:
            schedule.run_pending()
            time.sleep(1)
        except KeyboardInterrupt:
            print("アップローダーを終了しています...")
            break