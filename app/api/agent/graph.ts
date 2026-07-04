import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { supabaseAdmin } from "../../../supabase/client";
import { OUTREACH_THRESHOLD } from "@/lib/constants";
import { parseAndScoreResume, draftOutreachEmail, Requirement } from "./tools";

type EmitEvent = (event: string, data: Record<string, unknown>) => void;

type ResumeText = { name: string; text: string };

type BatchTodo = { resume: number; name: string; status: string };

interface WriterTask {
  profile: CandidateProfile;
  scoreData: CandidateScore;
  name: string;
  resumeIndex: number;
  runId: string;
}

interface CandidateProfile {
  candidateId?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  skills?: string[];
  years_experience?: number;
  education?: string | null;
  work_history?: string;
  candidateName?: string;
  [key: string]: unknown;
}

interface CandidateScore {
  score: number;
  met: Array<{ requirement_id: string; evidence: string }>;
  gaps: Array<{ requirement_id: string; note: string }>;
  standouts: Array<{ item: string; why_it_matters: string }>;
  rationale: string;
  signals: Array<{ type: string; detail: string }>;
  flagged_for_review: boolean;
  [key: string]: unknown;
}

// Define the state schema for the overall batch
export interface BatchState {
  jobId: string;
  runId: string;
  requirements: Requirement[];
  resumeTexts: ResumeText[];
  todos: BatchTodo[];
  completed: number;
}

// Define the state for individual candidate processing
export interface CandidateState {
  jobId: string;
  runId: string;
  resumeIndex: number;
  name: string;
  text: string;
  requirements: Requirement[];
}

// Helper to update todos without race conditions in Supabase
async function updateTodoStatus(runId: string, index: number, status: string, emitEvent: EmitEvent) {
  const { data } = await supabaseAdmin.from('agent_runs').select('todos').eq('id', runId).single();
  if (data && data.todos) {
    const todos = [...data.todos];
    todos[index].status = status;
    await supabaseAdmin.from('agent_runs').update({ todos }).eq('id', runId);
    emitEvent('todos', { todos });
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createAgentGraph(emitEvent: EmitEvent = () => {}) {
  // Orchestrator Node: processes resumes one at a time to avoid parallel model calls.
  const orchestratorNode = async (state: typeof GraphState.State) => {
    let completed = 0;

    for (let idx = 0; idx < state.resumeTexts.length; idx += 1) {
      const resume = state.resumeTexts[idx];
      const resumeName = resume.name || `Resume ${idx + 1}`;

      if (!resume.text.trim() || resume.text.startsWith('[PDF extraction failed')) {
        await updateTodoStatus(state.runId, idx, 'done', emitEvent);
        completed += 1;
        continue;
      }

      await updateTodoStatus(state.runId, idx, 'processing', emitEvent);
      emitEvent('status', { message: `Scoring ${resumeName}…` });
      console.log(`\n=== SEQUENTIAL SCORING START: ${resumeName} ===`);
      console.log(JSON.stringify({ resumeIndex: idx, textLength: resume.text.length, preview: resume.text.slice(0, 240) }, null, 2));

      try {
        const { profile, score: scoreData } = await parseAndScoreResume(resume.text, state.requirements || []);
        profile.candidateName = profile.name ?? resumeName;

        const { data: candidateRow, error: candErr } = await supabaseAdmin
          .from('candidates')
          .insert({
            job_id: state.jobId,
            name: profile.name ?? resumeName,
            email: profile.email ?? null,
            resume_text: resume.text,
            parsed_profile: profile,
            stage: 'new',
          })
          .select('id')
          .single();

        if (candErr || !candidateRow) throw new Error(candErr?.message ?? 'candidate insert failed');

        const candidateId: string = candidateRow.id;
        profile.candidateId = candidateId;

        const { data: scoreRow, error: scoreErr } = await supabaseAdmin.from('scores').insert({
          candidate_id: candidateId,
          score: scoreData.score,
          met: scoreData.met,
          gaps: scoreData.gaps,
          standouts: scoreData.standouts,
          rationale: scoreData.rationale,
          signals: scoreData.signals,
          flagged_for_review: scoreData.flagged_for_review ?? false,
          used_fallback: scoreData.used_fallback ?? state.requirementsFallback ?? false,
        }).select('id').single();

        if (scoreErr || !scoreRow) {
          console.error('Score insert failed for candidate', { candidateId, error: scoreErr?.message });
          throw new Error(scoreErr?.message ?? 'Score insert failed');
        }

        emitEvent('score', { candidateId, score: scoreData.score, name: profile.name ?? resumeName });

        if (scoreData.score >= OUTREACH_THRESHOLD) {
          await writerNode({ profile, scoreData, name: resumeName, resumeIndex: idx, runId: state.runId });
        } else {
          await updateTodoStatus(state.runId, idx, 'done', emitEvent);
        }
      } catch (err) {
        console.error(`\n=== ERROR PROCESSING RESUME ${resumeName} ===\n`, err, '\n=======================================\n');
        await updateTodoStatus(state.runId, idx, 'error', emitEvent);
        state.hadErrors = true;
        emitEvent('resumeError', { resume: idx + 1, name: resumeName, detail: String(err) });
      }

      completed += 1;
      const pause = 1500 + Math.floor(Math.random() * 500);
      await sleep(pause);
    }

    return { completed };
  };

  // Writer Node: Drafts outreach and persists per-candidate state
  const writerNode = async (state: WriterTask) => {
    console.log(`\n=== WRITER NODE INVOCATION: ${state.name} ===`);
    console.log(`Score: ${state.scoreData.score}`);
    console.log(`================================================\n`);

    try {
      await draftOutreachEmail(state.profile, state.scoreData.standouts ?? [], state.scoreData.gaps ?? []);
    } catch (outreachErr) {
      console.error(`\n=== OUTREACH DRAFT FAILED FOR ${state.name} ===\n`, outreachErr, '\n=======================================\n');
    }

    await supabaseAdmin.from('candidates').update({ stage: 'scored' }).eq('id', state.profile.candidateId);
    await updateTodoStatus(state.runId, state.resumeIndex, 'done', emitEvent);
    return {};
  };

  const endNode = async () => ({});

  const GraphState = Annotation.Root({
    jobId: Annotation<string>(),
    runId: Annotation<string>(),
    requirements: Annotation<Requirement[]>(),
    resumeTexts: Annotation<ResumeText[]>(),
    todos: Annotation<BatchTodo[]>(),
    requirementsFallback: Annotation<boolean>(),
    hadErrors: Annotation<boolean>({
      reducer: (a: boolean | undefined, b: boolean | undefined) => Boolean(a || b),
      default: () => false,
    }),
    completed: Annotation<number>({
      reducer: (a: number, b: number) => (a ?? 0) + (b ?? 0),
      default: () => 0,
    }),
  });

  const builder = new StateGraph(GraphState)
    .addNode('orchestrator_node', orchestratorNode)
    .addNode('end_node', endNode)
    .addEdge(START, 'orchestrator_node')
    .addEdge('orchestrator_node', 'end_node')
    .addEdge('end_node', END);

  return builder.compile();
}

export const agentGraph = createAgentGraph();
