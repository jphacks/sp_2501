'use client';

import { FormEvent, useCallback, useEffect, useState } from "react";

type AnalysisResponse = {
  error: string;
  analysis?: string;
};

type SuccessResponse = {
  image: string;
};

export default function Home() {
  const [imageA, setImageA] = useState<File | null>(null);
  const [imageB, setImageB] = useState<File | null>(null);
  const [previewA, setPreviewA] = useState<string | null>(null);
  const [previewB, setPreviewB] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewA) {
        URL.revokeObjectURL(previewA);
      }
      if (previewB) {
        URL.revokeObjectURL(previewB);
      }
    };
  }, [previewA, previewB]);

  const updateFile = useCallback((slot: "A" | "B", fileList: FileList | null) => {
    const file = fileList?.[0] ?? null;

    if (slot === "A") {
      if (previewA) {
        URL.revokeObjectURL(previewA);
      }
      setImageA(file);
      setPreviewA(file ? URL.createObjectURL(file) : null);
    } else {
      if (previewB) {
        URL.revokeObjectURL(previewB);
      }
      setImageB(file);
      setPreviewB(file ? URL.createObjectURL(file) : null);
    }
  }, [previewA, previewB]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!imageA || !imageB) {
        setError("差分を比較するには2枚の画像を選択してください。");
        return;
      }

      setIsLoading(true);
      setError(null);
      setResultImage(null);
      setAnalysis(null);

      const formData = new FormData();
      formData.append("imageA", imageA);
      formData.append("imageB", imageB);

      try {
        const response = await fetch("/api/diff", {
          method: "POST",
          body: formData,
        });

        const payload: AnalysisResponse | SuccessResponse = await response.json();

        if (!response.ok) {
          const failure = payload as AnalysisResponse;
          setError("error" in failure ? failure.error ?? "画像の差分を取得できませんでした。" : "画像の差分を取得できませんでした。");
          setAnalysis("analysis" in failure ? failure.analysis ?? null : null);
          return;
        }

        if ("image" in payload && payload.image) {
          setResultImage(payload.image);
        } else {
          setError("画像の差分を取得できませんでした。");
        }
      } catch (fetchError) {
        console.error("Diff request failed", fetchError);
        setError("サーバーへのリクエストに失敗しました。ネットワーク状態を確認してください。");
      } finally {
        setIsLoading(false);
      }
    },
    [imageA, imageB],
  );

  const resetForm = useCallback(() => {
    if (previewA) {
      URL.revokeObjectURL(previewA);
    }
    if (previewB) {
      URL.revokeObjectURL(previewB);
    }
    setImageA(null);
    setImageB(null);
    setPreviewA(null);
    setPreviewB(null);
    setResultImage(null);
    setAnalysis(null);
    setError(null);
  }, [previewA, previewB]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 px-4 py-10 text-white sm:px-8">
      <header className="mx-auto w-full max-w-4xl">
        <h1 className="text-balance text-3xl font-semibold sm:text-4xl">
          OpenAI差分ビューワー
        </h1>
        <p className="mt-3 text-sm text-slate-300 sm:text-base">
          2枚の画像をアップロードすると、OpenAI API が差分を抽出したハイライト画像を生成します。
        </p>
      </header>

      <main className="mx-auto mt-10 flex w-full max-w-4xl flex-1 flex-col gap-8">
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-6 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-sm sm:grid-cols-2"
        >
          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">
              画像A
            </legend>
            <label className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-slate-700 bg-slate-900/60 p-6 text-center transition hover:border-slate-500">
              <span className="text-sm text-slate-400">ファイルを選択</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => updateFile("A", event.target.files)}
              />
              {previewA ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewA}
                  alt="プレビュー画像A"
                  className="max-h-48 w-full rounded-md object-cover"
                />
              ) : (
                <span className="text-xs text-slate-500">
                  JPG / PNG / WEBP などに対応
                </span>
              )}
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">
              画像B
            </legend>
            <label className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-slate-700 bg-slate-900/60 p-6 text-center transition hover:border-slate-500">
              <span className="text-sm text-slate-400">ファイルを選択</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => updateFile("B", event.target.files)}
              />
              {previewB ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewB}
                  alt="プレビュー画像B"
                  className="max-h-48 w-full rounded-md object-cover"
                />
              ) : (
                <span className="text-xs text-slate-500">
                  JPG / PNG / WEBP などに対応
                </span>
              )}
            </label>
          </fieldset>

          <div className="sm:col-span-2 flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              onClick={resetForm}
            >
              リセット
            </button>
            <button
              type="submit"
              className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-inner transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-700/40"
              disabled={isLoading}
            >
              {isLoading ? "解析中..." : "差分を生成"}
            </button>
          </div>
        </form>

        {(error || analysis) && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-5 text-sm text-red-200">
            {error && <p className="font-semibold">{error}</p>}
            {analysis && <p className="mt-2 whitespace-pre-wrap text-red-100">{analysis}</p>}
          </div>
        )}

        {resultImage && (
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white">差分結果</h2>
            <p className="mt-2 text-sm text-slate-300">
              OpenAIが生成した差分画像です。重要な箇所がハイライトされています。
            </p>
            <div className="mt-6 overflow-hidden rounded-lg border border-slate-800 bg-black/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resultImage}
                alt="差分結果"
                className="w-full"
              />
            </div>
          </section>
        )}
      </main>

      <footer className="mx-auto mt-12 w-full max-w-4xl text-xs text-slate-500">
        <p>OPENAI_API_KEY を設定したサーバー環境で実行してください。</p>
      </footer>
    </div>
  );
}
