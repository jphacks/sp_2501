# 画像差分ビューワー (APIserver/my-api-server)

## 概要
- Next.js (App Router) をベースにしたフロントエンド＋API サーバーです。
- フロント側で 2 枚の画像を選択してアップロードすると、`/api/diff` エンドポイントが OpenAI Responses API を呼び出し、差分をハイライトした画像を生成します。
- 生成に失敗した場合は、モデルから返ってきたテキスト解析メッセージをフロントに返却します。

## 主なディレクトリ
| パス | 内容 |
| --- | --- |
| `src/app/page.tsx` | 画像アップロード UI と結果表示を行うクライアントコンポーネント |
| `src/app/api/diff/route.ts` | 2 枚の画像を受け取り OpenAI API にリクエストする Next.js Route Handler |
| `public/` | 静的ファイル置き場（現状はプレースホルダー `.gitkeep` のみ） |

## 必須要件
- Node.js 20 以上（開発環境では v22.16.0 を使用）
- npm / pnpm / yarn などのパッケージマネージャ
- OpenAI API キー

## セットアップ
1. 依存パッケージをインストールします。
   ```bash
   cd APIserver/my-api-server
   npm install
   ```
2. `.env.local` を用意し、少なくとも以下を設定してください。
   ```bash
   OPENAI_API_KEY="あなたの OpenAI API キー"
   OPENAI_IMAGE_DIFF_MODEL="gpt-4.1-mini"    # 任意。既定値は gpt-4.1-mini
   OPENAI_IMAGE_DIFF_SIZE="1024x1024"        # 任意。既定値は 1024x1024
   ```
   ※ 実際の API キーは Git などにコミットしないでください。

## 開発サーバーの起動
```bash
npm run dev
```
ブラウザで [http://localhost:3000](http://localhost:3000) を開くと、画像差分ビューアーが表示されます。

## API の使い方
- エンドポイント: `POST /api/diff`
- リクエスト形式: `multipart/form-data`
  - フィールド名 `imageA`, `imageB` に画像ファイルを添付します。
- レスポンス例:
  ```jsonc
  {
    "image": "data:image/png;base64,...." // 成功時
  }
  ```
  もしくは
  ```jsonc
  {
    "error": "Image diff could not be generated. See textual analysis for details.",
    "analysis": "...モデルから返却されたテキスト..."
  }
  ```

## テスト・検証
- コードスタイルチェック: `npm run lint`
- 手動テスト: 開発サーバーを起動し、ブラウザから 2 枚の画像をアップロードして動作を確認してください。
- スクリプトなどで API を検証する場合は、`multipart/form-data` で画像を送信するツール（`curl`, `Postman`, 任意の Node.js スクリプトなど）を利用してください。

## デプロイ時の注意
- Vercel 等のホスティングサービスにデプロイする場合は、環境変数に `OPENAI_API_KEY` および任意の設定値を忘れずに追加してください。
- 静的アセットを配置する場合は `public/` に追加します。
- `node_modules/` は Git に含めず、サーバー側で再インストールされる前提です。
