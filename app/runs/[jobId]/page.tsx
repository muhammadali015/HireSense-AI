// app/runs/[jobId]/page.tsx
// Server Component: fetches and renders batch-run results with gap/standout chips.
import React from 'react';
import Link from 'next/link';
import { supabaseAdmin } from '../../../supabase/client';
import { OUTREACH_THRESHOLD } from '@/lib/constants';

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-slate-400',
  processing: 'text-yellow-400 animate-pulse',
  done: 'text-cyan-400',
  error: 'text-red-400',
};

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-slate-500',
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

  const THRESHOLD = OUTREACH_THRESHOLD;

  const formatRequirementLabel = (value: unknown) => {
    if (value == null) return 'requirement';
    const normalized = String(value).replace(/_/g, ' ');
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  return (
    <main className="min-h-screen">
      <div className="hud-page space-y-6">
        {/* Header */}
        <div className="hud-panel hud-panel-strong sticky top-0 z-10 border-cyan-500/20">
          <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs hud-subtle uppercase tracking-widest font-mono mb-1">Batch Run Results</p>
              <h1 className="text-2xl font-bold hud-heading">{job?.title || 'Batch Run'}</h1>
              <p className="text-xs hud-subtle font-mono mt-0.5">{jobId}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`hud-chip ${run?.status === 'complete' ? 'hud-chip-accent' : 'hud-chip-warning'}`}>
                {run?.status || 'Unknown'}
              </span>
              <Link
                href={`/jobs/${jobId}/pipeline`}
                className="hud-chip hud-chip-muted hud-btn"
              >
                Pipeline Table →
              </Link>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-4 grid grid-cols-1 lg:grid-cols-5 gap-6">
          <section className="lg:col-span-2 hud-panel p-6 self-start">
            <h2 className="text-sm font-semibold hud-subtle uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="text-lg">•</span> Processing Log
            </h2>
            {todos.length === 0 ? (
              <p className="text-sm hud-subtle">No run data…</p>
            ) : (
              <ul className="space-y-3">
                {todos.map((t: { resume: number; name: string; status: string }, idx: number) => (
                  <li key={idx} className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[t.status] || 'bg-gray-500'}`} />
                    <span className="text-xs hud-subtle w-5 shrink-0">#{t.resume}</span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm hud-heading font-medium truncate">{t.name || `Resume ${t.resume}`}</span>
                      <span className={`text-[10px] uppercase tracking-wider font-semibold ${STATUS_COLOR[t.status] || 'text-slate-400'}`}>{t.status}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="lg:col-span-3 flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold hud-subtle uppercase tracking-widest flex items-center gap-2">
                <span className="text-lg">•</span> Ranked Candidates
              </h2>
              <span className="text-xs hud-subtle font-mono">Threshold: {THRESHOLD}/100</span>
            </div>

            {ranked.some(s => s.score >= THRESHOLD) && ranked.some(s => s.score < THRESHOLD) && (
              <div className="relative flex items-center gap-2 my-1">
                <span className="text-[10px] text-yellow-500 font-mono uppercase tracking-widest shrink-0">Threshold {THRESHOLD}</span>
                <div className="flex-1 border-t border-dashed border-yellow-500/40" />
              </div>
            )}

            {ranked.length === 0 ? (
              <div className="hud-panel p-8 text-center hud-subtle text-sm">
                No candidates scored yet…
              </div>
            ) : (
              <ul className="space-y-3">
                {ranked.map((s, i) => (
                  <li key={s.candidateId} className={`rounded-2xl border ${s.score >= THRESHOLD ? 'border-cyan-900/60 bg-slate-950/80' : 'border-slate-800 bg-slate-950/65'} overflow-hidden`}>
                    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-cyan-400 font-bold text-xs font-mono">
                          #{i + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="hud-heading font-semibold">{s.name}</span>
                            {s.flagged && (
                              <span className="hud-chip hud-chip-warning text-[10px] px-2 py-0.5 rounded-full uppercase">⚑ Review</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className={`font-mono text-lg font-bold px-3 py-1 rounded-full ${s.score >= THRESHOLD ? 'text-cyan-400 bg-cyan-400/10' : 'text-red-400 bg-red-400/10'}`}>
                        {s.score}/100
                      </span>
                    </div>

                    {s.gaps.length > 0 && (
                      <div className="px-4 pb-2 flex flex-wrap gap-2">
                        {s.gaps.map((g, gi) => (
                          <span key={gi} className="hud-chip hud-chip-warning text-[11px] px-2 py-0.5 rounded-md">
                            ✗ {formatRequirementLabel(g.requirement_id)}
                          </span>
                        ))}
                      </div>
                    )}

                    {s.standouts.length > 0 && (
                      <div className="px-4 pb-2 flex flex-wrap gap-2">
                        {s.standouts.map((st, si) => (
                          <span key={si} className="hud-chip hud-chip-accent text-[11px] px-2 py-0.5 rounded-md">
                            ★ {st.item}
                          </span>
                        ))}
                      </div>
                    )}

                    {s.rationale && (
                      <details className="px-4 pb-4 group">
                        <summary className="text-xs hud-subtle cursor-pointer hover:text-cyan-400 transition-colors select-none list-none flex items-center gap-1 mb-2">
                          <span className="group-open:hidden">▶</span>
                          <span className="hidden group-open:inline">▼</span>
                          Full Rationale
                        </summary>
                        <p className="text-sm text-slate-300 leading-relaxed">
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
      </div>
    </main>
  );
}
