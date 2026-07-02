// app/runs/[jobId]/page.tsx
// Server Component: fetches and renders batch-run results with gap/standout chips.
import React from 'react';
import Link from 'next/link';
import { supabaseAdmin } from '../../../supabase/client';

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-gray-500',
  processing: 'text-yellow-400 animate-pulse',
  done: 'text-cyan-400',
  error: 'text-red-400',
};

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-gray-500',
  processing: 'bg-yellow-400 animate-pulse',
  done: 'bg-cyan-400',
  error: 'bg-red-400',
};

export default async function RunPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  const { data: job } = await supabaseAdmin.from('jobs').select('*').eq('id', jobId).single();
  const { data: run } = await supabaseAdmin.from('agent_runs').select('*').eq('job_id', jobId).single();

  // Fetch candidates with their scores and outreach
  const { data: candidates } = await supabaseAdmin
    .from('candidates')
    .select('*, scores(*), outreach(*)')
    .eq('job_id', jobId);

  const todos = run?.todos || [];

  // Build ranked list from scores
  const ranked = (candidates || [])
    .map(c => {
      const scoreRow = c.scores?.[0];
      return {
        candidateId: c.id,
        name: c.name,
        score: scoreRow?.score ?? 0,
        rationale: scoreRow?.rationale ?? '',
        gaps: (scoreRow?.gaps ?? []) as { requirement_id: string; note: string }[],
        standouts: (scoreRow?.standouts ?? []) as { item: string; why_it_matters: string }[],
        flagged: scoreRow?.flagged_for_review ?? false,
      };
    })
    .sort((a, b) => b.score - a.score);

  const THRESHOLD = 50;

  const formatRequirementLabel = (value: unknown) => {
    if (value == null) return 'requirement';
    const normalized = String(value).replace(/_/g, ' ');
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  return (
    <main className="min-h-screen bg-black text-white" style={{ fontFamily: "'Inter', 'SF Pro Display', sans-serif" }}>
      {/* Header */}
      <div className="border-b border-cyan-900/40 bg-black/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-cyan-500 uppercase tracking-widest font-mono mb-1">Batch Run Results</p>
            <h1 className="text-2xl font-bold text-white">
              {job?.title || 'Batch Run'}
            </h1>
            <p className="text-xs text-gray-600 font-mono mt-0.5">{jobId}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold uppercase px-3 py-1.5 rounded-full border ${
              run?.status === 'complete'
                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400'
                : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400'
            }`}>
              {run?.status || 'Unknown'}
            </span>
            <Link
              href={`/jobs/${jobId}/pipeline`}
              className="text-xs font-semibold px-4 py-2 rounded-lg border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 transition-colors"
            >
              Pipeline Table →
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Processing Log — narrower left panel */}
        <section className="lg:col-span-2 border border-gray-800 rounded-2xl bg-gray-950 p-5 self-start">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="text-lg">📋</span> Processing Log
          </h2>
          {todos.length === 0 ? (
            <p className="text-gray-600 text-sm">No run data…</p>
          ) : (
            <ul className="space-y-3">
              {todos.map((t: { resume: number; name: string; status: string }, idx: number) => (
                <li key={idx} className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[t.status] || 'bg-gray-500'}`} />
                  <span className="text-xs text-gray-500 w-5 shrink-0">#{t.resume}</span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm text-white font-medium truncate">{t.name || `Resume ${t.resume}`}</span>
                    <span className={`text-[10px] uppercase tracking-wider font-semibold ${STATUS_COLOR[t.status] || 'text-gray-400'}`}>{t.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ranked Candidates — wider right panel */}
        <section className="lg:col-span-3 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <span className="text-lg">🏆</span> Ranked Candidates
            </h2>
            <span className="text-xs text-gray-600 font-mono">Threshold: {THRESHOLD}/100</span>
          </div>

          {/* Threshold line indicator */}
          {ranked.some(s => s.score >= THRESHOLD) && ranked.some(s => s.score < THRESHOLD) && (
            <div className="relative flex items-center gap-2 my-1">
              <span className="text-[10px] text-yellow-500 font-mono uppercase tracking-widest shrink-0">Threshold {THRESHOLD}</span>
              <div className="flex-1 border-t border-dashed border-yellow-500/40" />
            </div>
          )}

          {ranked.length === 0 ? (
            <div className="border border-gray-800 rounded-xl p-8 text-center text-gray-600 text-sm bg-gray-950">
              No candidates scored yet…
            </div>
          ) : (
            <ul className="space-y-3">
              {ranked.map((s, i) => (
                <li key={s.candidateId} className={`rounded-xl border ${s.score >= THRESHOLD ? 'border-cyan-900/60 bg-gray-950' : 'border-gray-800 bg-gray-950/50'} overflow-hidden`}>
                  {/* Card header */}
                  <div className="flex items-center justify-between p-4 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-800 text-cyan-400 font-bold text-xs font-mono">
                        #{i + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold">{s.name}</span>
                          {s.flagged && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 font-bold uppercase">
                              ⚑ Review
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`font-mono text-lg font-bold px-3 py-1 rounded-lg ${
                      s.score >= 70 ? 'text-cyan-400 bg-cyan-400/10' :
                      s.score >= THRESHOLD ? 'text-green-400 bg-green-400/10' :
                      'text-red-400 bg-red-400/10'
                    }`}>
                      {s.score}/100
                    </span>
                  </div>

                  {/* Gap chips */}
                  {s.gaps.length > 0 && (
                    <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                      {s.gaps.map((g, gi) => (
                        <span key={gi} className="text-[11px] px-2 py-0.5 rounded-md bg-red-950/60 border border-red-800/60 text-red-400 font-medium">
                          ✗ {formatRequirementLabel(g.requirement_id)}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Standout chips */}
                  {s.standouts.length > 0 && (
                    <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                      {s.standouts.map((st, si) => (
                        <span key={si} className="text-[11px] px-2 py-0.5 rounded-md bg-cyan-950/60 border border-cyan-800/60 text-cyan-400 font-medium">
                          ★ {st.item}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Expandable rationale */}
                  {s.rationale && (
                    <details className="px-4 pb-4 group">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-cyan-400 transition-colors select-none list-none flex items-center gap-1 mb-2">
                        <span className="group-open:hidden">▶</span>
                        <span className="hidden group-open:inline">▼</span>
                        Full Rationale
                      </summary>
                      <p className="text-sm text-gray-400 leading-relaxed">
                        {s.rationale}
                      </p>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
