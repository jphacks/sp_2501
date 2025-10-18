import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

// --- 型定義 ---

// uploader.py が送信するJSONペイ로드内の各スクリーンショットの型
interface ScreenshotPayload {
  filename: string;
  data: string; // data:image/png;base64,... 形式のData URI文字列
}

// uploader.py が送信するリクエストボディ全体の型
interface UploadRequestBody {
  screenshots: ScreenshotPayload[];
}

// サーバーからの応答の型
type ApiResponse = {
  status: 'success' | 'error';
  message: string;
  processedFiles?: { filename: string; size: number }[];
};

// --- ヘルパー関数 ---

/**
 * Data URI (data:image/png;base64,...) 形式の文字列を
 * バイナリバッファとMIMEタイプに変換します。
 * @param dataURI Base64 Data URI文字列
 * @returns { buffer: Buffer, mimeType: string }
 */
function parseDataURI(dataURI: string): { buffer: Buffer; mimeType: string } {
  try {
    const regex = /^data:(.+);(base64),(.+)$/;
    const match = dataURI.match(regex);

    if (!match || match.length < 4) {
      throw new Error('無効なData URI形式です');
    }

    const mimeType = match[1]; // 例: 'image/png'
    const base64Data = match[3]; // Base64文字列本体

    // Base64文字列をNode.jsのバイナリ 'Buffer' に変換
    const buffer = Buffer.from(base64Data, 'base64');

    return { buffer, mimeType };
  } catch (e: any) {
    console.error('Data URIのパースに失敗:', e.message);
    throw new Error('無効なData URI');
  }
}

// --- API メインハンドラ (App Router 形式) ---

/**
 * POSTリクエストを処理します (api/diff)
 */
export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse>> {

  try {
    // 1. uploader.pyから送信されたJSONペイロードを取得
    // (App Routerでは await request.json() を使用)
    const body = (await request.json()) as UploadRequestBody;
    const { screenshots } = body;

    if (!screenshots || !Array.isArray(screenshots)) {
      return NextResponse.json(
        {
          status: 'error',
          message: '無効なペイロードです。"screenshots" 配列が見つかりません。',
        },
        { status: 400 }
      );
    }

    console.log(`受信したスクリーンショット: ${screenshots.length}件`);

    const processedFiles = [];

    // 2. 受け取った各スクリーンショットを処理
    for (const shot of screenshots) {
      const { filename, data } = shot;

      // 3. Base64 Data URI をバイナリバッファに戻す
      const { buffer } = parseDataURI(data);

  // 4. 플랫폼 독립적인 임시 디렉터리에 저장 (os.tmpdir())
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, filename);
  fs.writeFileSync(tempFilePath, buffer);

      processedFiles.push({ filename: filename, size: buffer.length });
      console.log(`一時ファイルとして保存完了: ${tempFilePath}`);

      // 5. ★★★ JPHacks 次のステップ ★★★
      // この 'buffer' または 'tempFilePath' をOpenAI APIに送信します。
    }

    // 6. uploader.py に成功応答を返す
    return NextResponse.json({
      status: 'success',
      message: `サーバー側で ${processedFiles.length}件 のファイルを受信・処理しました。`,
      processedFiles,
    });

  } catch (error: any) {
    console.error('アップロード処理エラー:', error);
    return NextResponse.json(
      { status: 'error', message: `サーバー内部エラー: ${error.message}` },
      { status: 500 }
    );
  }
}