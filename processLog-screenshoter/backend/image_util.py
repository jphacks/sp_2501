# backend/image_util.py

import base64
import mimetypes # ファイル拡張子から MIME タイプを推測

def encode_image_to_base64_data_uri(filepath):
    """
    画像ファイルを読み込み data:image/png;base64,... 形式の文字列に変換します。
    """
    try:
        # 1. ファイルの MIME タイプを推測 (例: 'image/png')
        mime_type, _ = mimetypes.guess_type(filepath)
        if not mime_type or not mime_type.startswith('image'):
            print(f"MIME タイプを判別できません: {filepath}")
            return None

        # 2. ファイルをバイナリで読み込む
        with open(filepath, 'rb') as image_file:
            binary_data = image_file.read()

    # 3. Base64 にエンコード (bytes -> str)
        base64_encoded_string = base64.b64encode(binary_data).decode('utf-8')

        # 4. Data URI 形式に組み立て
        return f"data:{mime_type};base64,{base64_encoded_string}"
        
    except Exception as e:
        print(f"Base64 エンコードエラー ({filepath}): {e}")
        return None