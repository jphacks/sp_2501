const examplePayload = `{
  "screenshots": [
    {
      "filename": "screenshot_2025-10-18_13-00-05.png",
      "data": "data:image/png;base64,iVBORw0KGgoAAA..."
    },
    {
      "filename": "screenshot_2025-10-18_13-00-10.png",
      "data": "data:image/png;base64,iVBORw0KGgoAAA..."
    }
  ]
}`;

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-16 text-slate-100">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold sm:text-4xl">Image Diff API</h1>
        <p className="text-sm text-slate-300 sm:text-base">
          This service accepts two screenshots via JSON, forwards them to the OpenAI Responses API, and returns a
          diff-highlighted image. Use the instructions below to call the endpoint directly from your client.
        </p>
      </header>

      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold text-white">Endpoint</h2>
        <p className="text-sm text-slate-300 sm:text-base">
          <code className="rounded bg-slate-800 px-2 py-1 text-sm text-slate-100">POST /api/diff</code>
        </p>
        <p className="text-sm text-slate-300 sm:text-base">
          Set the <code>Content-Type</code> header to <code>application/json</code> and send a payload shaped like the
          following:
        </p>
        <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs text-slate-200 sm:text-sm">
          {examplePayload}
        </pre>
        <p className="text-xs text-slate-400 sm:text-sm">
          The <code>data</code> field must be a Data URI that begins with <code>data:&lt;mime&gt;;base64,</code>.
        </p>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold text-white">Response</h2>
        <p className="text-sm text-slate-300 sm:text-base">
          Successful requests return a diff image in Data URI form. If the model cannot render an output image, the API
          falls back to a textual analysis.
        </p>
        <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs text-slate-200 sm:text-sm">
{`// success
{
  "image": "data:image/png;base64,...."
}

// failure
{
  "error": "Image diff could not be generated. See textual analysis for details.",
  "analysis": "..."
}`}
        </pre>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold text-white">Testing</h2>
        <p className="text-sm text-slate-300 sm:text-base">
          Use any HTTP client (curl, Postman, a Node.js script, etc.) to send a request in the format above. The
          repository README describes environment variables and additional tips for automation.
        </p>
      </section>

      <footer className="mt-auto border-t border-slate-800 pt-6 text-xs text-slate-500 sm:text-sm">
        <p>
          Configure <code>OPENAI_API_KEY</code> and optionally <code>OPENAI_IMAGE_DIFF_MODEL</code> /{" "}
          <code>OPENAI_IMAGE_DIFF_SIZE</code> before calling the API.
        </p>
        <p className="mt-2">Refer to the README for setup details and sample scripts.</p>
      </footer>
    </div>
  );
}
