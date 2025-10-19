# backend/app.py

import threading
import time
import os
import mss
from mss import tools
from PIL import Image
from datetime import datetime
from flask import Flask, request, jsonify

app = Flask(__name__)

# --- グローバル変数 ---
screenshot_thread = None
is_running = False
thread_lock = threading.Lock()

# --- スクリーンショット保存パス設定 ---
# このファイル(app.py) は backend/ フォルダにあるため、
# 親フォルダ(プロジェクトルート) の 'screenshot' フォルダを指します。
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAVE_PATH = os.path.join(BASE_DIR, 'screenshot')

# --- スクリーンショットキャプチャループ ---
def capture_loop(settings):
    global is_running
    print(f"キャプチャスレッドを開始します。設定: {settings}")

    interval = float(settings.get('interval', 5.0))
    resolution_scale = float(settings.get('resolution', 1.0))

    os.makedirs(SAVE_PATH, exist_ok=True)

    with mss.mss() as sct:
        while True:
            with thread_lock:
                if not is_running:
                    break

            try:
                # ファイル名: screenshot_YYYY-MM-DD_HH-MM-SS.png
                timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
                filename = f"screenshot_{timestamp}.png"
                output_path = os.path.join(SAVE_PATH, filename)
                temp_output_path = os.path.join(SAVE_PATH, f"temp_{filename}")

                # 1. 全モニタをキャプチャ (仮想スクリーン)
                monitor = sct.monitors[0]
                sct_img = sct.grab(monitor)
                tools.to_png(sct_img.rgb, sct_img.size, output=temp_output_path)

                # 2. 解像度調整 (Pillow)
                if resolution_scale != 1.0:
                    with Image.open(temp_output_path) as img:
                        width, height = img.size
                        new_size = (int(width * resolution_scale), int(height * resolution_scale))
                        resized_img = img.resize(new_size, Image.Resampling.LANCZOS)
                        resized_img.save(output_path)
                    os.remove(temp_output_path)
                else:
                    os.rename(temp_output_path, output_path)

                print(f"キャプチャを保存しました: {output_path}")

            except Exception as e:
                print(f"キャプチャ中にエラーが発生しました: {e}")

            # 3. 次のキャプチャまで待機 (停止フラグの確認を含む)
            elapsed = 0.0
            check_interval = 0.1
            while elapsed < interval:
                with thread_lock:
                    if not is_running:
                        break
                time.sleep(check_interval)
                elapsed += check_interval

    print("キャプチャスレッドを終了します。")

# --- API エンドポイント ---

@app.route('/start', methods=['POST'])
def start_capturing():
    global screenshot_thread, is_running
    with thread_lock:
        if is_running:
            return jsonify({"status": "warning", "message": "既に実行中です。"}), 400

        settings = request.get_json()
        if not settings:
            settings = {'interval': 5.0, 'resolution': 1.0}

        is_running = True
        screenshot_thread = threading.Thread(target=capture_loop, args=(settings,))
        screenshot_thread.start()

        return jsonify({"status": "success", "message": "スクリーンショットのキャプチャを開始します。"})

@app.route('/stop', methods=['POST'])
def stop_capturing():
    global screenshot_thread, is_running
    with thread_lock:
        if not is_running:
            return jsonify({"status": "warning", "message": "既に停止しています。"}), 400

        print("停止リクエストを受信しました...")
        is_running = False
    
    if screenshot_thread:
        screenshot_thread.join() # スレッドが完全に終了するまで待機
        screenshot_thread = None

    print("キャプチャは完全に停止しました。")
    return jsonify({"status": "success", "message": "スクリーンショットのキャプチャを停止しました。"})

if __name__ == '__main__':
    # Electronで子プロセスとして実行される場合、デバッグモードとリローダーを無効にする必要があります。
    app.run(port=5001, debug=False, use_reloader=False)