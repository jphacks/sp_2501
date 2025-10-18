import base64
import mimetypes

def encode_image_to_base64_data_uri(filepath):
    """
    画像ファイルを読み込み、Base64エンコードされた
    Data URI文字列 (例: data:image/png;base64,...) を返す。
    """
    try:
        # ファイルのMIMEタイプを推測 (例: 'image/png')
        mime_type, _ = mimetypes.guess_type(filepath)
        if mime_type is None:
            mime_type = 'application/octet-stream' # 不明な場合はバイナリとして扱う

        with open(filepath, 'rb') as image_file:
            # バイナリデータを読み込む
            binary_data = image_file.read()
            # Base64にエンコード
            base64_encoded_data = base64.b64encode(binary_data)
            # UTF-8文字列にデコード
            base64_string = base64_encoded_data.decode('utf-8')
            
            # Data URI 形式で返す
            return f"data:{mime_type};base64,{base64_string}"
            
    except Exception as e:
        print(f"Base64エンコード中にエラー発生 ({filepath}): {e}")
        return None