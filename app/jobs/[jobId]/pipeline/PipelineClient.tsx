'use client';
// app/jobs/[jobId]/pipeline/PipelineClient.tsx
// Client component: sortable pipeline table + candidate detail sheet.
import React, { useState, useTransition } from 'react';
import { OUTREACH_THRESHOLD } from '@/lib/constants';

const THRESHOLD = OUTREACH_THRESHOLD;

interface MetItem { requirement_id: string; evidence: string; }
interface GapItem { requirement_id: string; note: string; }
interface StandoutItem { item: string; why_it_matters: string; }
interface OutreachRow { id: string; subject: string; body: string; sent: boolean; }

interface CandidateRow {
  candidateId: string;
  name: string;
  email: string | null;
  stage: string;
  score: number;
  rationale: string;
  met: MetItem[];
  gaps: GapItem[];
  standouts: StandoutItem[];
  flagged: boolean;
  used_fallback?: boolean;
  outreach: OutreachRow | null;
}

const STAGE_STYLE: Record<string, string> = {
  new: 'text-slate-400 border-slate-700 bg-slate-800/50',
  scored: 'text-cyan-400 border-cyan-800 bg-cyan-950/50',
  outreach_sent: 'text-green-400 border-green-800 bg-green-950/50',
  responded: 'text-purple-400 border-purple-800 bg-purple-950/50',
  rejected: 'text-red-400 border-red-800 bg-red-950/50',
};

export default function PipelineClient({ rows, jobId }: { rows: CandidateRow[]; jobId: string }) {
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<CandidateRow | null>(null);
  const [outreachBody, setOutreachBody] = useState('');
  const [marking, startMarking] = useTransition();
  const [markedSent, setMarkedSent] = useState<Set<string>>(new Set());
  
  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState<{role: 'user' | 'assistant', text: string}[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const askChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const question = chatInput.trim();
    setChatInput('');
    setChatLog(prev => [...prev, { role: 'user', text: question }]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, question })
      });

      if (!res.body) {
        throw new Error('No response body');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const lines = part.split('\n');
          const dataLine = lines.find(line => line.startsWith('data:'));
          if (!dataLine) continue;
          try {
            const data = JSON.parse(dataLine.slice(5).trim());
            if (typeof data.text === 'string') {
              assistantText += data.text;
            }
          } catch {
            // Ignore malformed SSE chunks
          }
        }
      }

      setChatLog(prev => [...prev, { role: 'assistant', text: assistantText || 'No response' }]);
    } catch {
      setChatLog(prev => [...prev, { role: 'assistant', text: 'Error communicating with AI' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const sorted = [...rows].sort((a, b) => sortDir === 'desc' ? b.score - a.score : a.score - b.score);

  const openSheet = (row: CandidateRow) => {
    setSelected(row);
    setOutreachBody(row.outreach?.body ?? '');
  };

  const markAsSent = () => {
    if (!selected?.outreach?.id) return;
    const outreachId = selected.outreach.id;
    startMarking(async () => {
      await fetch(`/api/outreach/${outreachId}/mark-sent`, { method: 'POST' });
      setMarkedSent(prev => new Set([...prev, outreachId]));
    });
  };

  const isSent = selected?.outreach?.id ? markedSent.has(selected.outreach.id) || selected.outreach.sent : false;

  const formatRequirementLabel = (value: unknown) => {
    if (value == null) return 'requirement';
    const normalized = String(value).replace(/_/g, ' ');
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  return (
    <>
      {/* Score threshold banner */}
      <div className="flex flex-wrap items-center gap-3 text-xs hud-subtle font-mono">
        <span className="hud-chip hud-chip-warning text-sm">⊙ Score threshold: {THRESHOLD}/100</span>
        <span>—</span>
        <span>{rows.filter(r => r.score >= THRESHOLD).length} above threshold</span>
        <span>·</span>
        <span>{rows.filter(r => r.score < THRESHOLD).length} below</span>
      </div>

      {/* Table */}
      <div className="hud-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cyan-500/10 bg-slate-950/90">
                <th className="text-left px-4 py-4 text-xs hud-subtle uppercase tracking-widest font-semibold w-8">#</th>
                <th className="text-left px-4 py-4 text-xs hud-subtle uppercase tracking-widest font-semibold">Candidate</th>
                <th className="text-left px-4 py-4 text-xs hud-subtle uppercase tracking-widest font-semibold">Stage</th>
                <th
                  className="text-left px-4 py-4 text-xs hud-subtle uppercase tracking-widest font-semibold cursor-pointer hover:text-cyan-300 transition-colors select-none"
                  onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                >
                  Score {sortDir === 'desc' ? '↓' : '↑'}
                </th>
                <th className="text-left px-4 py-4 text-xs hud-subtle uppercase tracking-widest font-semibold">Gaps</th>
                <th className="text-left px-4 py-4 text-xs hud-subtle uppercase tracking-widest font-semibold">Standouts</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr
                  key={row.candidateId}
                  className="border-b border-cyan-500/10 hover:bg-slate-950/70 cursor-pointer transition-colors"
                  onClick={() => openSheet(row)}
                >
                  <td className="px-4 py-4 text-slate-400 font-mono text-xs">{i + 1}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="hud-heading font-semibold">{row.name}</span>
                        {row.flagged && (
                          <span className="hud-chip hud-chip-warning text-[10px] px-2 py-0.5 rounded-full">⚑</span>
                        )}
                        {row.used_fallback && (
                          <span className="hud-chip hud-chip-muted text-[10px] px-2 py-0.5 rounded-full">Estimated</span>
                        )}
                        {row.score >= THRESHOLD && (
                          <span className="hud-chip hud-chip-accent text-[10px] px-2 py-0.5 rounded-full">Above threshold</span>
                        )}
                      </div>
                      {row.email && <p className="text-xs hud-subtle">{row.email}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${STAGE_STYLE[row.stage] || STAGE_STYLE.new}`}>
                      {row.stage}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-baseline gap-2">
                      <span className={`font-mono font-bold text-base ${row.score >= THRESHOLD ? 'text-cyan-300' : 'text-red-400'}`}>
                        {row.score}
                      </span>
                      <span className="text-xs hud-subtle">/100</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 max-w-xs">
                    <div className="flex flex-wrap gap-2">
                      {row.gaps.slice(0, 3).map((g, gi) => (
                        <span key={gi} className="hud-chip hud-chip-warning text-[10px] rounded-md">
                          ✗ {formatRequirementLabel(g.requirement_id)}
                        </span>
                      ))}
                      {row.gaps.length > 3 && (
                        <span className="text-[10px] hud-subtle">+{row.gaps.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 max-w-xs">
                    <div className="flex flex-wrap gap-2">
                      {row.standouts.slice(0, 2).map((st, si) => (
                        <span key={si} className="hud-chip hud-chip-accent text-[10px] rounded-md">
                          ★ {st.item}
                        </span>
                      ))}
                      {row.standouts.length > 2 && (
                        <span className="text-[10px] hud-subtle">+{row.standouts.length - 2}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center hud-subtle text-sm">No candidates scored yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Candidate Detail Sheet/Dialog — Item 3 */}
      {selected && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelected(null)}>
          {/* Overlay */}
          <div className="flex-1 bg-slate-950/80 backdrop-blur-sm" />
          {/* Panel */}
          <div
            className="w-full max-w-2xl hud-panel hud-panel-strong overflow-y-auto flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Sheet header */}
            <div className="sticky top-0 hud-panel-strong border-b border-cyan-500/10 px-6 py-4 flex items-start justify-between z-10">
              <div>
                <h2 className="text-xl font-bold hud-heading">{selected.name}</h2>
                {selected.email && <p className="text-xs hud-subtle mt-0.5">{selected.email}</p>}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${STAGE_STYLE[selected.stage] || STAGE_STYLE.new}`}>
                    {selected.stage}
                  </span>
                  <span className={`font-mono font-bold text-lg ${selected.score >= THRESHOLD ? 'text-cyan-300' : 'text-red-400'}`}>
                    {selected.score}/100
                  </span>
                  {selected.flagged && (
                    <span className="hud-chip hud-chip-warning text-[10px] rounded-full">⚑ Flagged for Review</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-white text-2xl leading-none transition-colors mt-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex-1 px-6 py-5 space-y-6">
              {/* Rationale */}
              {selected.rationale && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Rationale</h3>
                  <p className="text-sm text-slate-300 leading-relaxed">{selected.rationale}</p>
                </div>
              )}

              {/* Standouts */}
              {selected.standouts.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-cyan-400 uppercase tracking-widest mb-2">★ Standouts</h3>
                  <ul className="space-y-2">
                    {selected.standouts.map((st, i) => (
                      <li key={i} className="rounded-lg bg-cyan-950/30 border border-cyan-900/40 px-3 py-2">
                        <p className="text-sm font-semibold text-cyan-300">{st.item}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{st.why_it_matters}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Met Requirements with Evidence */}
              {selected.met.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-green-400 uppercase tracking-widest mb-2">✓ Met Requirements</h3>
                  <ul className="space-y-2">
                    {selected.met.map((m, i) => (
                      <li key={i} className="rounded-lg bg-green-950/20 border border-green-900/30 px-3 py-2">
                        <p className="text-[11px] font-mono text-green-400 mb-0.5">{m.requirement_id}</p>
                        <p className="text-xs text-slate-300">{m.evidence}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Gaps */}
              {selected.gaps.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-2">✗ Gaps</h3>
                  <ul className="space-y-2">
                    {selected.gaps.map((g, i) => (
                      <li key={i} className="rounded-lg bg-red-950/20 border border-red-900/30 px-3 py-2">
                        <p className="text-[11px] font-mono text-red-400 mb-0.5">{g.requirement_id}</p>
                        <p className="text-xs text-slate-300">{g.note}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Outreach Draft — Item 4 */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Outreach Draft</h3>
                {selected.outreach ? (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-slate-950 border border-cyan-500/10 px-3 py-2">
                      <p className="text-xs hud-subtle mb-0.5">Subject</p>
                      <p className="text-sm hud-heading">{selected.outreach.subject}</p>
                    </div>
                    <textarea
                      className="w-full rounded-2xl bg-slate-950 border border-cyan-500/10 text-sm text-slate-100 px-4 py-3 resize-none focus:outline-none focus:border-cyan-400 transition-colors min-h-[160px]"
                      value={outreachBody}
                      onChange={e => setOutreachBody(e.target.value)}
                      placeholder="Edit outreach email body…"
                    />
                    <button
                      onClick={markAsSent}
                      disabled={marking || isSent}
                      className={`w-full py-3 rounded-2xl text-sm font-semibold transition-all ${
                        isSent
                          ? 'bg-green-900/40 border border-green-700 text-green-400 cursor-default'
                          : 'bg-cyan-600 hover:bg-cyan-500 text-black font-bold'
                      } disabled:opacity-60`}
                    >
                      {isSent ? '✓ Marked as Sent' : marking ? 'Marking…' : 'Mark as Sent'}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs hud-subtle bg-slate-950/60 border border-slate-800 rounded-2xl px-3 py-3">
                    No outreach draft generated for this candidate. This is expected if Gemini failed to produce the email or the score was below threshold.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recruiter Assistant Chat Panel */}
      <div className="mt-12 hud-panel rounded-2xl overflow-hidden flex flex-col h-96 max-h-[50vh]">
        <div className="px-4 py-3 border-b border-cyan-500/10 bg-slate-950 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-cyan-300">Recruiter Assistant AI</h3>
          <span className="text-xs hud-subtle font-mono">Powered by Gemini</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatLog.length === 0 ? (
            <p className="text-xs hud-subtle italic">Ask me anything about this candidate batch... (e.g., &quot;Why did Faisal score lower than Ali?&quot;)</p>
          ) : (
            chatLog.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${msg.role === 'user' ? 'bg-cyan-900/40 text-cyan-50 border border-cyan-800' : 'bg-slate-950/70 text-slate-100 border border-slate-800'}`}>
                  {msg.text}
                </div>
              </div>
            ))
          )}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-slate-950/70 text-slate-400 border border-slate-800 flex items-center gap-2">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse delay-75">●</span>
                <span className="animate-pulse delay-150">●</span>
              </div>
            </div>
          )}
        </div>
        <form onSubmit={askChat} className="p-3 border-t border-cyan-500/10 bg-slate-950 flex gap-2">
          <input
            type="text"
            className="flex-1 bg-slate-950 border border-cyan-500/10 rounded-2xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 transition-colors"
            placeholder="Ask a question about the batch..."
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            disabled={chatLoading}
          />
          <button
            type="submit"
            disabled={chatLoading || !chatInput.trim()}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-black font-semibold rounded-2xl text-sm transition-colors disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </>
  );
}
