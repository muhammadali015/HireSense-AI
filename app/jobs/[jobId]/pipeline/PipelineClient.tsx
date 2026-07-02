'use client';
// app/jobs/[jobId]/pipeline/PipelineClient.tsx
// Client component: sortable pipeline table + candidate detail sheet.
import React, { useState, useTransition } from 'react';

const THRESHOLD = 50;

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
  outreach: OutreachRow | null;
}

const STAGE_STYLE: Record<string, string> = {
  new: 'text-gray-400 border-gray-700 bg-gray-800/50',
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
    } catch (err) {
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
      <div className="flex items-center gap-3 text-xs text-gray-500 font-mono">
        <span className="text-yellow-500">⊙ Score threshold: {THRESHOLD}/100</span>
        <span>—</span>
        <span>{rows.filter(r => r.score >= THRESHOLD).length} above threshold</span>
        <span>·</span>
        <span>{rows.filter(r => r.score < THRESHOLD).length} below</span>
      </div>

      {/* Table */}
      <div className="border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-950">
              <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest font-semibold w-8">#</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest font-semibold">Candidate</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest font-semibold">Stage</th>
              <th
                className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest font-semibold cursor-pointer hover:text-cyan-400 transition-colors select-none"
                onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
              >
                Score {sortDir === 'desc' ? '↓' : '↑'}
              </th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest font-semibold">Gaps</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest font-semibold">Standouts</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={row.candidateId}
                className="border-b border-gray-800/50 hover:bg-gray-900 cursor-pointer transition-colors"
                onClick={() => openSheet(row)}
              >
                <td className="px-4 py-3 text-gray-600 font-mono text-xs">{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{row.name}</span>
                    {row.flagged && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 border border-yellow-700/50 text-yellow-400 font-bold">⚑</span>
                    )}
                    {row.score >= THRESHOLD && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800/50 text-cyan-500">above threshold</span>
                    )}
                  </div>
                  {row.email && <p className="text-xs text-gray-600 mt-0.5">{row.email}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded border font-semibold ${STAGE_STYLE[row.stage] || STAGE_STYLE.new}`}>
                    {row.stage}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`font-mono font-bold text-base ${
                    row.score >= 70 ? 'text-cyan-400' : row.score >= THRESHOLD ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {row.score}
                  </span>
                  <span className="text-gray-600 text-xs">/100</span>
                </td>
                <td className="px-4 py-3 max-w-xs">
                  <div className="flex flex-wrap gap-1">
                    {row.gaps.slice(0, 3).map((g, gi) => (
                      <span key={gi} className="text-[10px] px-1.5 py-0.5 rounded bg-red-950/50 border border-red-900/50 text-red-400">
                        ✗ {formatRequirementLabel(g.requirement_id)}
                      </span>
                    ))}
                    {row.gaps.length > 3 && (
                      <span className="text-[10px] text-gray-600">+{row.gaps.length - 3}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 max-w-xs">
                  <div className="flex flex-wrap gap-1">
                    {row.standouts.slice(0, 2).map((st, si) => (
                      <span key={si} className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/50 border border-cyan-900/50 text-cyan-400">
                        ★ {st.item}
                      </span>
                    ))}
                    {row.standouts.length > 2 && (
                      <span className="text-[10px] text-gray-600">+{row.standouts.length - 2}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-600 text-sm">No candidates scored yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Candidate Detail Sheet/Dialog — Item 3 */}
      {selected && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelected(null)}>
          {/* Overlay */}
          <div className="flex-1 bg-black/70 backdrop-blur-sm" />
          {/* Panel */}
          <div
            className="w-full max-w-2xl bg-gray-950 border-l border-cyan-900/40 overflow-y-auto flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Sheet header */}
            <div className="sticky top-0 bg-gray-950 border-b border-gray-800 px-6 py-4 flex items-start justify-between z-10">
              <div>
                <h2 className="text-xl font-bold text-white">{selected.name}</h2>
                {selected.email && <p className="text-xs text-gray-500 mt-0.5">{selected.email}</p>}
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded border font-semibold ${STAGE_STYLE[selected.stage] || STAGE_STYLE.new}`}>
                    {selected.stage}
                  </span>
                  <span className={`font-mono font-bold text-lg ${
                    selected.score >= 70 ? 'text-cyan-400' : selected.score >= THRESHOLD ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {selected.score}/100
                  </span>
                  {selected.flagged && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/15 border border-yellow-700/50 text-yellow-400 font-bold">⚑ Flagged for Review</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-500 hover:text-white text-2xl leading-none transition-colors mt-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex-1 px-6 py-5 space-y-6">
              {/* Rationale */}
              {selected.rationale && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Rationale</h3>
                  <p className="text-sm text-gray-300 leading-relaxed">{selected.rationale}</p>
                </div>
              )}

              {/* Standouts */}
              {selected.standouts.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-cyan-500 uppercase tracking-widest mb-2">★ Standouts</h3>
                  <ul className="space-y-2">
                    {selected.standouts.map((st, i) => (
                      <li key={i} className="rounded-lg bg-cyan-950/30 border border-cyan-900/40 px-3 py-2">
                        <p className="text-sm font-semibold text-cyan-300">{st.item}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{st.why_it_matters}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Met Requirements with Evidence */}
              {selected.met.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-green-500 uppercase tracking-widest mb-2">✓ Met Requirements</h3>
                  <ul className="space-y-2">
                    {selected.met.map((m, i) => (
                      <li key={i} className="rounded-lg bg-green-950/20 border border-green-900/30 px-3 py-2">
                        <p className="text-[11px] font-mono text-green-500 mb-0.5">{m.requirement_id}</p>
                        <p className="text-xs text-gray-300">{m.evidence}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Gaps */}
              {selected.gaps.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-red-500 uppercase tracking-widest mb-2">✗ Gaps</h3>
                  <ul className="space-y-2">
                    {selected.gaps.map((g, i) => (
                      <li key={i} className="rounded-lg bg-red-950/20 border border-red-900/30 px-3 py-2">
                        <p className="text-[11px] font-mono text-red-500 mb-0.5">{g.requirement_id}</p>
                        <p className="text-xs text-gray-300">{g.note}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Outreach Draft — Item 4 */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Outreach Draft</h3>
                {selected.outreach ? (
                  <div className="space-y-2">
                    <div className="rounded-lg bg-gray-900 border border-gray-700 px-3 py-2">
                      <p className="text-xs text-gray-500 mb-0.5">Subject</p>
                      <p className="text-sm text-white">{selected.outreach.subject}</p>
                    </div>
                    <textarea
                      className="w-full rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-200 px-3 py-2 resize-none focus:outline-none focus:border-cyan-600 transition-colors min-h-[160px]"
                      value={outreachBody}
                      onChange={e => setOutreachBody(e.target.value)}
                      placeholder="Edit outreach email body…"
                    />
                    <button
                      onClick={markAsSent}
                      disabled={marking || isSent}
                      className={`w-full py-2 rounded-lg text-sm font-semibold transition-all ${
                        isSent
                          ? 'bg-green-900/40 border border-green-700 text-green-400 cursor-default'
                          : 'bg-cyan-600 hover:bg-cyan-500 text-black font-bold'
                      } disabled:opacity-60`}
                    >
                      {isSent ? '✓ Marked as Sent' : marking ? 'Marking…' : 'Mark as Sent'}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 bg-gray-900/50 border border-gray-800 rounded-lg px-3 py-3">
                    No outreach draft generated for this candidate. This is expected if Gemini failed to produce the email or the score was below threshold.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recruiter Assistant Chat Panel */}
      <div className="mt-12 border border-gray-800 rounded-xl overflow-hidden bg-gray-950 flex flex-col h-96 max-h-[50vh]">
        <div className="px-4 py-3 border-b border-gray-800 bg-black flex items-center justify-between">
          <h3 className="text-sm font-semibold text-cyan-400">Recruiter Assistant AI</h3>
          <span className="text-xs text-gray-500 font-mono">Powered by Gemini</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatLog.length === 0 ? (
            <p className="text-xs text-gray-600 italic">Ask me anything about this candidate batch... (e.g., "Why did Faisal score lower than Ali?")</p>
          ) : (
            chatLog.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${msg.role === 'user' ? 'bg-cyan-900/40 text-cyan-50 border border-cyan-800' : 'bg-gray-800/50 text-gray-200 border border-gray-700'}`}>
                  {msg.text}
                </div>
              </div>
            ))
          )}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-xl px-4 py-3 text-sm bg-gray-800/50 text-gray-400 border border-gray-700 flex items-center gap-2">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse delay-75">●</span>
                <span className="animate-pulse delay-150">●</span>
              </div>
            </div>
          )}
        </div>
        <form onSubmit={askChat} className="p-3 border-t border-gray-800 bg-black flex gap-2">
          <input
            type="text"
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
            placeholder="Ask a question about the batch..."
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            disabled={chatLoading}
          />
          <button
            type="submit"
            disabled={chatLoading || !chatInput.trim()}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-black font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </>
  );
}
