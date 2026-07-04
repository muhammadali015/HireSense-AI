// app/api/agent/run/route.ts
// Streaming SSE endpoint – accepts multipart/form-data with PDF files,
// extracts text from each, processes per-resume, writes to Supabase,
// and streams progress events to the client.
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '../../../../supabase/client';
import { extractRequirements, Requirement } from '../tools';
import { extractText } from 'unpdf';
import { createAgentGraph } from '../graph';

export const runtime = 'nodejs';

async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = await extractText(new Uint8Array(buffer));
  if (data && data.text && Array.isArray(data.text)) {
    return data.text.join('\n');
  }
  return '';
}

function sseChunk(ctrl: ReadableStreamDefaultController, event: string, data: unknown) {
  ctrl.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';
  let jobDescription = '';
  let resumeTexts: { name: string; text: string }[] = [];

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    jobDescription = formData.get('jobDescription')?.toString() ?? '';
    const pdfFiles = formData.getAll('resumes') as File[];
    for (const pdf of pdfFiles) {
      try {
        const buf = Buffer.from(await pdf.arrayBuffer());
        const text = await extractPdfText(buf);
        resumeTexts.push({ name: pdf.name.replace(/\.pdf$/i, ''), text });
      } catch (err) {
        console.error(`\n=== PDF EXTRACTION FAILED FOR ${pdf.name} ===\n`, err, '\n============================================\n');
        resumeTexts.push({ name: pdf.name, text: `[PDF extraction failed: ${String(err)}]` });
      }
    }
  } else {
    const body = (await req.json()) as { jobDescription: string; resumes: string[] };
    jobDescription = body.jobDescription ?? '';
    resumeTexts = (body.resumes ?? []).map((t, i) => ({ name: `Resume ${i + 1}`, text: t }));
  }

  const stream = new ReadableStream({
    async start(ctrl) {
      sseChunk(ctrl, 'status', { message: 'Creating job record…' });

      const { data: jobRow, error: jobErr } = await supabaseAdmin
        .from('jobs')
        .insert({ title: 'Batch run', description: jobDescription })
        .select('id')
        .single();

      if (jobErr || !jobRow) {
        sseChunk(ctrl, 'error', { message: 'Failed to create job', detail: jobErr?.message });
        ctrl.close();
        return;
      }
      const jobId: string = jobRow.id;
      sseChunk(ctrl, 'jobId', { jobId });

      const { data: runRow } = await supabaseAdmin
        .from('agent_runs')
        .insert({ job_id: jobId, status: 'running', todos: [] })
        .select('id')
        .single();
      const runId: string = runRow?.id ?? '';

      const updateTodos = async (todos: unknown[]) => {
        await supabaseAdmin.from('agent_runs').update({ todos }).eq('id', runId);
        sseChunk(ctrl, 'todos', { todos });
      };

      sseChunk(ctrl, 'status', { message: 'Extracting job requirements…' });
      let requirements: Requirement[] = [];
      let requirementsFallback = false;
      try {
        const extraction = await extractRequirements(jobDescription);
        requirements = extraction.requirements;
        requirementsFallback = extraction.usedFallback;
        await supabaseAdmin.from('jobs').update({ requirements }).eq('id', jobId);
      } catch (e) {
        requirementsFallback = true;
        sseChunk(ctrl, 'warn', { message: 'Could not extract requirements, continuing', detail: String(e) });
      }

      const todos = resumeTexts.map((r, i) => ({ resume: i + 1, name: r.name, status: 'pending' }));
      await updateTodos(todos);

      let runFailed = false;
      let runDegraded = false;
      try {
        const agentGraph = createAgentGraph((event: string, data: Record<string, unknown>) => sseChunk(ctrl, event, data));
        const graphResult = await agentGraph.invoke({
          jobId,
          runId,
          requirements,
          requirementsFallback,
          resumeTexts,
          todos,
        });
        runDegraded = Boolean((graphResult as { hadErrors?: boolean }).hadErrors);

        if (!runDegraded) {
          const { data: currentRun } = await supabaseAdmin.from('agent_runs').select('status').eq('id', runId).single();
          if (currentRun?.status === 'degraded') {
            runDegraded = true;
          }
        }
      } catch (err) {
        runFailed = true;
        console.error("Graph execution error:", err);
        await supabaseAdmin.from('agent_runs').update({ status: 'failed' }).eq('id', runId);
        sseChunk(ctrl, 'error', { message: 'Run failed', detail: String(err) });
      }

      if (!runFailed) {
        await supabaseAdmin.from('agent_runs').update({ status: runDegraded ? 'degraded' : 'complete' }).eq('id', runId);
        sseChunk(ctrl, 'done', { jobId, runId });
      }
      ctrl.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
