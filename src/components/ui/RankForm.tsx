// src/components/ui/RankForm.tsx
"use client";

import React, { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface FileEntry {
  file: File;
  status: "ready" | "processing" | "done" | "error";
}

export default function RankForm() {
  const [jobDesc, setJobDesc] = useState("");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  /* ── drag-and-drop helpers ─────────────────────────────────────── */
  const addFiles = useCallback((newFiles: File[]) => {
    const pdfs = newFiles.filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    if (pdfs.length === 0) return;
    setFiles(prev => [
      ...prev,
      ...pdfs
        .filter(f => !prev.some(e => e.file.name === f.name))
        .map(f => ({ file: f, status: "ready" as const })),
    ]);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  const removeFile = (name: string) =>
    setFiles(prev => prev.filter(f => f.file.name !== name));

  /* ── submit ─────────────────────────────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!jobDesc.trim()) { setError("Please enter a job description."); return; }
    if (files.length === 0) { setError("Please upload at least one PDF resume."); return; }

    setLoading(true);
    setProgress("Uploading files…");

    const formData = new FormData();
    formData.append("jobDescription", jobDesc);
    files.forEach(({ file }) => formData.append("resumes", file));

    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        body: formData,          // no Content-Type header — browser sets multipart boundary
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server error ${response.status}: ${text}`);
      }

      // Read SSE stream to get jobId and live progress
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let jobId: string | null = null;
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.jobId) jobId = payload.jobId;
              if (payload.message) setProgress(payload.message);
              if (payload.todos) {
                const done = payload.todos.filter((t: { status: string }) => t.status === "done").length;
                setProgress(`Processed ${done} / ${files.length} resumes…`);
              }
            } catch { /* skip malformed */ }
          }
        }
      }

      if (jobId) router.push(`/runs/${jobId}`);
      else setError("Run completed but no jobId received.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  /* ── render ─────────────────────────────────────────────────────── */
  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">

        {/* Job Description */}
        <div className="flex flex-col gap-2">
          <label htmlFor="jobDesc" className="text-sm font-semibold text-indigo-200 uppercase tracking-widest">
            Job Description
          </label>
          <textarea
            id="jobDesc"
            rows={6}
            placeholder="Paste the full job description here…"
            value={jobDesc}
            onChange={e => setJobDesc(e.target.value)}
            disabled={loading}
            className="w-full rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/40 p-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none transition"
          />
        </div>

        {/* PDF Drop Zone */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-indigo-200 uppercase tracking-widest">
            Resume PDFs
          </label>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => !loading && fileInputRef.current?.click()}
            className="relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-white/30 bg-white/5 hover:bg-white/10 hover:border-indigo-400 transition-all cursor-pointer p-8 text-center"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={e => addFiles(Array.from(e.target.files ?? []))}
              disabled={loading}
            />
            <svg className="w-10 h-10 text-indigo-400 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-white/60 text-sm">
              Drag &amp; drop PDF files here, or <span className="text-indigo-400 font-medium">click to browse</span>
            </p>
            <p className="text-white/30 text-xs">Supports multiple PDF resumes at once</p>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <ul className="flex flex-col gap-1.5 mt-1">
              {files.map(({ file, status }) => (
                <li key={file.name} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-red-400 text-xs font-bold bg-red-400/10 px-1.5 py-0.5 rounded">PDF</span>
                    <span className="text-white/80 truncate">{file.name}</span>
                    <span className="text-white/30 text-xs shrink-0">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {status === "processing" && (
                      <span className="text-yellow-400 text-xs animate-pulse">Processing…</span>
                    )}
                    {status === "done" && <span className="text-green-400 text-xs">✓ Done</span>}
                    {status === "error" && <span className="text-red-400 text-xs">✗ Error</span>}
                    {!loading && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(file.name); }}
                        className="text-white/30 hover:text-red-400 transition text-lg leading-none ml-1"
                        aria-label={`Remove ${file.name}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2">{error}</p>
        )}

        {/* Progress */}
        {progress && (
          <p className="text-indigo-300 text-sm animate-pulse">{progress}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || files.length === 0 || !jobDesc.trim()}
          className="w-full py-3 px-6 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-900/50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              {progress || "Ranking…"}
            </span>
          ) : `Rank ${files.length > 0 ? files.length : ""} Resume${files.length !== 1 ? "s" : ""}`}
        </button>
      </form>
    </div>
  );
}

