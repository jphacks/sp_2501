from flask import Flask, request, jsonify
import threading  # バックグラウンドでスクリーンショットを撮るためのスレッド
import time       # 撮影間隔のためのtime.sleep
import os         # フォルダ作成のためのos
import mss        # マルチモニタースクリーンショットのためのmss
from mss import tools
from PIL import Image # 画像リサイズのためのPillow
from datetime import datetime # ファイル名生成のためのdatetime

app = Flask(__name__)

# --- グローバル変数 ---
screenshot_thread = None # スクリーンショット作業を実行するスレッドオブジェクト
is_running = False       # スクリーンショット作業の実行有無を制御するフラグ
thread_lock = threading.Lock() # グローバル変数保護用ロック

# --- 実際のスクリーンショット作業を行う関数 ---
def capture_loop(settings):
    global is_running
    print(f"キャプチャスレッド開始。設定: {settings}")

    try:
        # 設定値抽出
            # 保存先パスを固定: プロジェクトルートの screenshot フォルダ (root/screenshot)
        repo_root = os.path.dirname(os.path.dirname(__file__))
        save_path = os.path.join(repo_root, 'screenshot')
        # settings に savePath が含まれていても無視する
        interval = float(settings.get('interval', 5.0))     # 撮影間隔 (秒)
        resolution_scale = float(settings.get('resolution', 1.0)) # 解像度スケール

        # 保存先が存在しない場合は作成
        os.makedirs(save_path, exist_ok=True)
        print(f"'{save_path}' フォルダ確認/作成完了.")

        # mss インスタンス生成
        with mss.mss() as sct:
            while True:
                with thread_lock:
                    if not is_running:
                        break
                # 現在時間でファイル名生成
                timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
                # 一時ファイル名 (リサイズ前)
                temp_filename = os.path.join(save_path, f"temp_{timestamp}.png")
                # 最終ファイル名
                final_filename = os.path.join(save_path, f"screenshot_{timestamp}.png")

                # 1. すべてのモニター(仮想全体画面)をキャプチャして1枚の画像として保存
                #    mssのsct.monitors[0]はすべてのモニターを合成した"virtual screen"を表します。
                monitor = sct.monitors[0]
                sct_img = sct.grab(monitor)
                # mss.tools.to_pngを使用してPNGとして保存 (すべてのモニターが合成されたvirtual screen)
                tools.to_png(sct_img.rgb, sct_img.size, output=temp_filename)

                # 2. (任意) 解像度調整 (Pillow使用)
                if resolution_scale != 1.0:
                    with Image.open(temp_filename) as img:
                        width, height = img.size
                        new_size = (int(width * resolution_scale), int(height * resolution_scale))
                        resized_img = img.resize(new_size, Image.Resampling.LANCZOS)
                        resized_img.save(final_filename)
                    os.remove(temp_filename) # 一時ファイル削除
                    print(f"キャプチャ保存 (リサイズ済): {final_filename}")
                else:
                    # リサイズ不要の場合はファイル名変更
                    os.rename(temp_filename, final_filename)
                    print(f"キャプチャ保存 (オリジナル): {final_filename}")

                # 3. 設定された間隔だけ待機
                # is_runningフラグをより頻繁に確認するために短い間隔で待機
                elapsed = 0.0
                check_interval = 0.1  # 0.1秒ごとにフラグを確認
                while elapsed < interval:
                    with thread_lock:
                        if not is_running:
                            break
                    time.sleep(check_interval)
                    elapsed += check_interval
            
    except Exception as e:
        print(f"キャプチャスレッドエラー発生: {e}")

    print("キャプチャスレッド終了.")

# --- API エンドポイント ---

@app.route('/start', methods=['POST'])
def start_recording():
    global screenshot_thread, is_running

    with thread_lock:
        if is_running:
            print("バックエンド受信: 既に実行中です。")
            return jsonify({"status": "warning", "message": "既にスクリーンショット保存が実行中です。"})

        # Electronから設定値を受信
        settings = request.get_json()
        print(f"バックエンド受信: 録画開始リクエスト。設定: {settings}")

            # 保存先パスを固定 (プロジェクトルートの screenshot フォルダ) — 開始前にフォルダが存在するか確認し
            # 存在しない場合は作成を試みます。作成に失敗した場合はエラーを返します。
        try:
            repo_root = os.path.dirname(os.path.dirname(__file__))
            save_path = os.path.join(repo_root, 'screenshot')
            os.makedirs(save_path, exist_ok=True)
            print(f"保存先フォルダ準備完了: {save_path}")
        except Exception as e:
            print(f"保存先フォルダの作成に失敗しました: {e}")
            return jsonify({"status": "error", "message": f"保存先フォルダの作成に失敗しました: {e}"}), 500

        # スレッド開始
        is_running = True
        screenshot_thread = threading.Thread(target=capture_loop, args=(settings,))
        screenshot_thread.start()
    
    return jsonify({"status": "success", "message": "スクリーンショットの保存を開始します。"})

@app.route('/stop', methods=['POST'])
def stop_recording():
    global screenshot_thread, is_running

    with thread_lock:
        if not is_running:
            print("バックエンド受信: 既に中止されています。")
            return jsonify({"status": "warning", "message": "スクリーンショット保存が既に中止状態です。"})

        print("バックエンド受信: 録画停止リクエスト")

        # スレッド終了フラグ設定
        is_running = False

    if screenshot_thread:
        screenshot_thread.join() # スレッドが完全に終了するまで待機

    return jsonify({"status": "success", "message": "スクリーンショットの保存を停止しました。"})

if __name__ == '__main__':
    # Disable debug reloader when run as subprocess to avoid it spawning a
    # child process that may send signals (SIGINT) causing sibling process
    # (Electron) to exit.
    app.run(port=5001, debug=False, use_reloader=False)