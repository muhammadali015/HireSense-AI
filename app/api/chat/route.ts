import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../supabase/client";
import { invokeModel } from "../agent/tools";

export const runtime = "nodejs";

function sseChunk(ctrl: ReadableStreamDefaultController, event: string, data: unknown) {
  ctrl.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

export async function POST(req: NextRequest) {
  try {
    const { jobId, question } = await req.json();

    if (!jobId || !question) {
      return NextResponse.json({ error: "Missing jobId or question" }, { status: 400 });
    }

    const { data: job } = await supabaseAdmin.from("jobs").select("requirements").eq("id", jobId).single();
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const { data: candidates } = await supabaseAdmin
      .from("candidates")
      .select(`
        id, name, stage,
        scores (
          score, met, gaps, standouts, rationale, flagged_for_review
        )
      `)
      .eq("job_id", jobId);

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ error: "No candidates found for this job" }, { status: 404 });
    }

    const contextData = candidates.map(c => {
      const scoreRow = Array.isArray(c.scores) ? c.scores[0] : c.scores;
      return {
        name: c.name,
        stage: c.stage,
        score: scoreRow?.score ?? "N/A",
        flagged: scoreRow?.flagged_for_review ?? false,
        rationale: scoreRow?.rationale ?? "",
        gaps: scoreRow?.gaps ?? [],
        standouts: scoreRow?.standouts ?? [],
      };
    });

    const systemPrompt = `You are a helpful recruitment assistant answering questions about a batch of candidates for a specific job.
You are given the job's scoring requirements and a list of candidates with their scores, rationales, and gaps/standouts.
Base your answers ONLY on this provided context. Be concise and professional.

JOB REQUIREMENTS:
${JSON.stringify(job.requirements, null, 2)}

CANDIDATES DATA:
${JSON.stringify(contextData, null, 2)}`;

    const stream = new ReadableStream({
      async start(ctrl) {
        try {
          const responseText = await invokeModel(systemPrompt, question);
          sseChunk(ctrl, "message", { text: responseText });
          sseChunk(ctrl, "done", {});
        } catch {
          const fallback = "I can help analyze the candidate batch, but I need the live scoring context to answer this precisely. Please try again once the scoring data is available.";
          sseChunk(ctrl, "message", { text: fallback });
          sseChunk(ctrl, "done", {});
        } finally {
          ctrl.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
