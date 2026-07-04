// app/jobs/[jobId]/pipeline/page.tsx
// Pipeline table view — one row per candidate with sorting, chips, detail sheet.
// This is a separate page from the live run view at /runs/[jobId].
import React from 'react';
import Link from 'next/link';
import { supabaseAdmin } from '../../../../supabase/client';
import PipelineClient from './PipelineClient';

export default async function PipelinePage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  const { data: job } = await supabaseAdmin.from('jobs').select('*').eq('id', jobId).single();

  const { data: candidates } = await supabaseAdmin
    .from('candidates')
    .select('*, scores(id, score, rationale, met, gaps, standouts, flagged_for_review, used_fallback), outreach(*)')
    .eq('job_id', jobId);

  const rows = (candidates || []).map(c => {
    const scoreRow = c.scores?.[0] ?? {};
    const outreachRow = c.outreach?.[0] ?? null;
    return {
      candidateId: c.id,
      name: c.name ?? 'Unknown',
      email: c.email ?? null,
      stage: c.stage ?? 'new',
      score: scoreRow.score ?? 0,
      rationale: scoreRow.rationale ?? '',
      met: scoreRow.met ?? [],
      gaps: scoreRow.gaps ?? [],
      standouts: scoreRow.standouts ?? [],
      flagged: scoreRow.flagged_for_review ?? false,
      used_fallback: scoreRow.used_fallback ?? false,
      outreach: outreachRow,
    };
  });

  const requirements = (job?.requirements ?? []) as { id: string; description: string; tier: string }[];

  return (
    <main className="min-h-screen">
      <div className="hud-page space-y-6">
        <div className="hud-panel hud-panel-strong sticky top-0 z-20 border-cyan-500/20">
          <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs hud-subtle uppercase tracking-widest font-mono mb-1">Pipeline</p>
              <h1 className="text-2xl font-bold hud-heading">{job?.title ?? 'Job'}</h1>
              <p className="text-xs hud-subtle font-mono mt-0.5">{jobId}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs hud-subtle font-mono">{rows.length} candidates</span>
              <Link
                href={`/runs/${jobId}`}
                className="hud-chip hud-chip-muted hud-btn"
              >
                ← Run View
              </Link>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-4 space-y-6">
          <details className="group hud-panel overflow-hidden">
            <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none list-none hover:bg-slate-950 transition-colors">
              <span className="text-sm font-semibold hud-heading flex items-center gap-2">
                <span className="text-cyan-400">⚙</span> Scoring Requirements
                <span className="text-xs hud-subtle font-normal">({requirements.filter(r => r.tier === 'must_have').length} must-have, {requirements.filter(r => r.tier === 'nice_to_have').length} nice-to-have)</span>
              </span>
              <span className="text-xs hud-subtle group-open:hidden">Show ▼</span>
              <span className="text-xs hud-subtle hidden group-open:inline">Hide ▲</span>
            </summary>
            <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <p className="text-xs text-red-400 uppercase tracking-widest font-semibold mb-2">Must-Have</p>
                <ul className="space-y-1.5">
                  {requirements.filter(r => r.tier === 'must_have').map(r => (
                    <li key={r.id} className="text-xs hud-subtle flex items-start gap-2">
                      <span className="text-red-500 shrink-0 mt-0.5">●</span>
                      <span><span className="text-slate-500 font-mono mr-1">[{r.id}]</span>{r.description}</span>
                    </li>
                  ))}
                  {requirements.filter(r => r.tier === 'must_have').length === 0 && (
                    <li className="text-xs hud-subtle">None extracted</li>
                  )}
                </ul>
              </div>
              <div>
                <p className="text-xs text-cyan-400 uppercase tracking-widest font-semibold mb-2">Nice-to-Have</p>
                <ul className="space-y-1.5">
                  {requirements.filter(r => r.tier === 'nice_to_have').map(r => (
                    <li key={r.id} className="text-xs hud-subtle flex items-start gap-2">
                      <span className="text-cyan-600 shrink-0 mt-0.5">●</span>
                      <span><span className="text-slate-500 font-mono mr-1">[{r.id}]</span>{r.description}</span>
                    </li>
                  ))}
                  {requirements.filter(r => r.tier === 'nice_to_have').length === 0 && (
                    <li className="text-xs hud-subtle">None extracted</li>
                  )}
                </ul>
              </div>
            </div>
          </details>

          <PipelineClient rows={rows} jobId={jobId} />
        </div>
      </div>
    </main>
  );
}
