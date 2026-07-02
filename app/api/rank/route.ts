// app/api/rank/route.ts
// Lightweight ranking endpoint – scores resumes and returns a sorted list.
// Does NOT persist to Supabase (use /api/agent/run for the full pipeline).
import { NextRequest, NextResponse } from 'next/server';
import { extractRequirements, parseAndScoreResume, Requirement } from '../agent/tools';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { jobDescription, resumes } = (await req.json()) as {
    jobDescription: string;
    resumes: string[];
  };

  let requirements: Requirement[] = [];
  try {
    requirements = await extractRequirements(jobDescription);
  } catch {
    // Fall back to empty requirements — scoring will still run with empty list
  }

  const results: Array<{ name: string; score: number; error?: string }> = [];

  for (let i = 0; i < resumes.length; i++) {
    const resumeText = resumes[i].trim();
    if (!resumeText) continue;
    try {
      const { profile, score } = await parseAndScoreResume(resumeText, requirements);
      results.push({ name: profile.name ?? `Candidate ${i + 1}`, score: score.score ?? 0 });
    } catch (err) {
      results.push({ name: `Candidate ${i + 1}`, score: 0, error: String(err) });
    }
  }

  // Sort descending by score
  const ranking = results.sort((a, b) => b.score - a.score);

  return NextResponse.json({ ranking });
}
