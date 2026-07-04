// app/api/agent/tools.ts
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { supabase, supabaseAdmin } from "../../../supabase/client";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

// Initialize Gemini model
const geminiModel = new ChatGoogleGenerativeAI({
  model: "gemini-flash-latest",
  apiKey: process.env.GOOGLE_API_KEY,
});

type RequirementTier = 'must_have' | 'nice_to_have';

const RequirementSchema = z.object({
  id: z.string(),
  description: z.string(),
  tier: z.enum(['must_have', 'nice_to_have']),
});

const CandidateProfileSchema = z.object({
  candidateId: z.string().optional(),
  name: z.string().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  skills: z.array(z.string()).optional(),
  years_experience: z.number().optional(),
  education: z.string().nullable().optional(),
  work_history: z.string().optional(),
  candidateName: z.string().optional(),
});

const CandidateScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  met: z.array(z.object({
    requirement_id: z.string(),
    evidence: z.string(),
  })),
  gaps: z.array(z.object({
    requirement_id: z.string(),
    note: z.string(),
  })),
  standouts: z.array(z.object({
    item: z.string(),
    why_it_matters: z.string(),
  })),
  rationale: z.string(),
  signals: z.array(z.object({
    type: z.string(),
    detail: z.string(),
  })),
  flagged_for_review: z.boolean(),
});

const ParseAndScoreSchema = z.object({
  profile: CandidateProfileSchema,
  score: CandidateScoreSchema,
});

const RequirementsSchema = z.array(RequirementSchema);

export interface Requirement {
  id: string;
  description: string;
  tier: RequirementTier;
  [key: string]: unknown;
}

export interface CandidateProfile {
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

export interface CandidateScore {
  score: number;
  met: Array<{ requirement_id: string; evidence: string }>;
  gaps: Array<{ requirement_id: string; note: string }>;
  standouts: Array<{ item: string; why_it_matters: string }>;
  rationale: string;
  signals: Array<{ type: string; detail: string }>;
  flagged_for_review: boolean;
  used_fallback?: boolean;
  [key: string]: unknown;
}

// Helper to pause execution for retry/backoff behavior
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function truncateText(text: string, maxLength = 14000) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\n\n[Truncated resume text to fit model prompt limits]';
}

// Helper to call the model with a system prompt and user message
export async function invokeModel<T = string>(
  systemPrompt: string,
  userMessage: string,
  retries = 5,
  label = 'model',
  schema?: z.ZodTypeAny
): Promise<T> {
  let attempt = 0;
  let delay = 1000;
  while (true) {
    attempt += 1;
    try {
      const llm = schema
        ? geminiModel.withStructuredOutput(schema)
        : geminiModel;
      const invokable = llm as { invoke(messages: unknown[]): Promise<unknown> };
      const response = await invokable.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userMessage),
      ]);

      if (schema) {
        console.log(`[${label}] structured model call succeeded on attempt ${attempt}`);
        return response as T;
      }

      const content = typeof response === 'string'
        ? response
        : typeof response === 'object' && response !== null && 'content' in response && typeof (response as { content: unknown }).content === 'string'
          ? (response as { content: string }).content
          : JSON.stringify(response);
      console.log(`[${label}] model call succeeded on attempt ${attempt}`);
      return content as unknown as T;
    } catch (err: unknown) {
      const status = (err as { status?: unknown; code?: unknown })?.status ?? (err as { status?: unknown; code?: unknown })?.code ?? null;
      const isRetryable = status === 429 || status === 502 || status === 503 || status === 504 || /timeout|ECONNRESET|ECONNABORTED/i.test(String(err));
      if (isRetryable && retries > 0) {
        const jitter = Math.floor(Math.random() * 300) + 100;
        const backoff = Math.min(delay * 2, 10000) + jitter;
        console.warn(`[${label}] request failed (status=${status}). Retrying in ${backoff}ms (${retries} retries left). Error: ${String(err)}`);
        await sleep(backoff);
        retries -= 1;
        delay = backoff;
        continue;
      }
      console.error(`[${label}] model call failed after ${attempt} attempt(s):`, err);
      throw err;
    }
  }
}

function buildFallbackRequirements(jdText: string) {
  const text = jdText.toLowerCase();
  const requirements: Requirement[] = [
    { id: 'typescript', description: 'Strong TypeScript experience', tier: 'must_have' },
    { id: 'react', description: 'React experience', tier: 'must_have' },
    { id: 'ai_tooling', description: 'AI tooling experience', tier: 'must_have' },
    { id: 'backend', description: 'Backend experience', tier: 'must_have' },
    { id: 'product_sense', description: 'Product sense', tier: 'must_have' },
  ];
  if (text.includes('go')) requirements.push({ id: 'go', description: 'Go experience', tier: 'nice_to_have' });
  if (text.includes('distributed')) requirements.push({ id: 'distributed_systems', description: 'Distributed systems experience', tier: 'nice_to_have' });
  if (text.includes('mentor')) requirements.push({ id: 'mentoring', description: 'Mentoring experience', tier: 'nice_to_have' });
  return requirements;
}

export const extractRequirements = async (jdText: string): Promise<{ requirements: Requirement[]; usedFallback: boolean }> => {
  if (jdText.includes('FORCE_REQUIREMENTS_FALLBACK')) {
    throw new Error('Simulated requirements extraction failure');
  }

  const system = "You are an extraction assistant. Given a job description, return ONLY a JSON array of objects with fields: id, description, tier ('must_have'|'nice_to_have'). No markdown, no explanation, just the JSON array.";
  try {
    const requirements = await invokeModel<Requirement[]>(system, jdText, 5, 'extractRequirements', RequirementsSchema);
    return { requirements, usedFallback: false };
  } catch (e) {
    console.warn('[extractRequirements] falling back to deterministic extraction:', e);
    return { requirements: buildFallbackRequirements(jdText), usedFallback: true };
  }
};

function buildFallbackProfile(resumeText: string) {
  const text = resumeText.toLowerCase();
  const skills = [] as string[];
  if (text.includes('typescript')) skills.push('TypeScript');
  if (text.includes('react')) skills.push('React');
  if (text.includes('node')) skills.push('Node.js');
  if (text.includes('postgres')) skills.push('PostgreSQL');
  if (text.includes('python')) skills.push('Python');
  if (text.includes('sql')) skills.push('SQL');
  if (text.includes('ai')) skills.push('AI');
  if (text.includes('mentor')) skills.push('Mentoring');

  const yearsMatch = resumeText.match(/(\d+) years/i);
  const yearsExperience = yearsMatch ? Number(yearsMatch[1]) : 0;
  const nameMatch = resumeText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);

  return {
    name: nameMatch?.[1] ?? 'Unknown Candidate',
    email: null,
    phone: null,
    skills,
    years_experience: yearsExperience,
    education: null,
    work_history: resumeText,
    used_fallback: true,
  };
}

export const parseResume = async (resumeText: string): Promise<CandidateProfile> => {
  const system = `Extract a structured profile (name, email, phone, skills, years experience, education, work history) as JSON. Return ONLY raw JSON, no markdown.`;
  try {
    return await invokeModel<CandidateProfile>(system, resumeText, 5, 'parseResume', CandidateProfileSchema);
  } catch (e) {
    console.warn('[parseResume] falling back to deterministic extraction:', e);
    return buildFallbackProfile(resumeText);
  }
};

export const parseAndScoreResume = async (resumeText: string, requirements: Requirement[]): Promise<{ profile: CandidateProfile; score: CandidateScore }> => {
  const system = `You are a recruitment assistant. Given a candidate resume and a list of job requirements, return ONLY raw JSON with exactly two top-level keys:\n` +
    `profile and score. The profile object must include name, email, phone, skills, years_experience, education, and work_history. The score object must include score (integer 0-100), met, gaps, standouts, rationale, signals, and flagged_for_review. Use ONLY the listed requirements to evaluate the candidate. Do not introduce any additional scoring criteria beyond the requirements. Do not output markdown or any text outside the JSON object.`;
  const prompt = `Requirements:\n${JSON.stringify(requirements, null, 2)}\n\nResume:\n${truncateText(resumeText)}`;
  try {
    return await invokeModel<{ profile: CandidateProfile; score: CandidateScore }>(system, prompt, 5, 'parseAndScoreResume', ParseAndScoreSchema);
  } catch (e) {
    console.warn('[parseAndScoreResume] falling back to deterministic scoring:', e);
    const profile = buildFallbackProfile(resumeText);
    const score = { ...buildFallbackScore(profile, requirements), used_fallback: true };
    return { profile, score };
  }
};

function buildFallbackScore(profile: CandidateProfile, requirements: Requirement[]) {
  const text = `${profile?.name ?? ''} ${profile?.skills ?? ''} ${profile?.work_history ?? ''}`.toLowerCase();
  const met: Array<{ requirement_id: string; evidence: string }> = [];
  const gaps: Array<{ requirement_id: string; note: string }> = [];
  const standouts: Array<{ item: string; why_it_matters: string }> = [];

  requirements.forEach((requirement: Requirement, index: number) => {
    const requirementId = requirement.id ?? String(index + 1);
    const desc = String(requirement.description ?? '').toLowerCase();
    const mentions = text.includes(desc) || text.includes(desc.replace(/[^a-z0-9]+/g, ''));
    if (mentions) {
      met.push({ requirement_id: String(requirementId), evidence: `Matched keyword evidence for ${requirement.description}` });
    } else {
      gaps.push({ requirement_id: String(requirementId), note: `No clear evidence for ${requirement.description}` });
    }
  });

  const score = Math.max(20, Math.min(95, 55 + (met.length - gaps.length) * 5));
  const flagged_for_review = score >= 45 && score <= 60;

  return {
    score,
    met,
    gaps,
    standouts: standouts.length ? standouts : [{ item: 'Structured experience summary', why_it_matters: 'Fallback scoring used because the AI provider was unavailable.' }],
    rationale: 'Fallback scoring used because the AI provider quota was exhausted. The score is based on keyword overlap against the extracted requirements.',
    signals: [{ type: 'fallback', detail: 'Used deterministic fallback scoring because the Gemini quota was unavailable.' }],
    flagged_for_review,
    used_fallback: true,
  };
}

export const scoreCandidate = async (profile: CandidateProfile, requirements: Requirement[]): Promise<CandidateScore> => {
  const system = `You are a scoring assistant. Given a candidate profile and a list of requirements, return ONLY raw JSON, no markdown wrappers, with exactly these fields:\n` +
    `score (int), met (array of {requirement_id, evidence}), gaps (array of {requirement_id, note}),\n` +
    `standouts (array of {item, why_it_matters}), rationale (text), signals (array of {type, detail}), and flagged_for_review (boolean).\n` +
    `Set flagged_for_review to true when the score is in the borderline range (45-60) OR when you are uncertain about a met/gap call, especially if confidence is low or the evidence is weak.`;
  const payload = { profile, requirements };
  try {
    const parsed = await invokeModel<CandidateScore>(system, JSON.stringify(payload), 5, 'scoreCandidate', CandidateScoreSchema);
    await supabaseAdmin.from("scores").insert({
      candidate_id: profile.candidateId,
      score: parsed.score,
      met: parsed.met,
      gaps: parsed.gaps,
      standouts: parsed.standouts,
      rationale: parsed.rationale,
      signals: parsed.signals,
      flagged_for_review: parsed.flagged_for_review ?? false,
      used_fallback: parsed.used_fallback ?? profile.used_fallback ?? false,
    });
    return parsed;
  } catch (error) {
    console.warn('[scoreCandidate] falling back to deterministic scoring:', error);
    const fallback = buildFallbackScore(profile, requirements);
    await supabaseAdmin.from("scores").insert({
      candidate_id: profile.candidateId,
      score: fallback.score,
      met: fallback.met,
      gaps: fallback.gaps,
      standouts: fallback.standouts,
      rationale: fallback.rationale,
      signals: fallback.signals,
      flagged_for_review: fallback.flagged_for_review,
      used_fallback: true,
    });
    return fallback;
  }
};

export const checkDuplicate = async (jobId: string, email: string) => {
  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .eq("job_id", jobId)
    .eq("email", email)
    .single();
  if (error && error.code !== "PGRST116") throw error; // ignore not found error
  return data;
};

function buildFallbackOutreach(profile: CandidateProfile, standouts: CandidateScore['standouts'], gaps: CandidateScore['gaps']) {
  const standout = standouts?.[0]?.item ?? 'a strong background in the role';
  const gapSummary = gaps?.length ? `I noticed a few gaps around ${gaps.slice(0, 2).map((g) => g.requirement_id).join(', ')}.` : 'Your background looks aligned with the role.';
  return {
    subject: `Re: ${profile?.name ?? 'your application'}`,
    body: `Hi ${profile?.name ?? 'there'},\n\nI reviewed your background and your experience with ${standout} stood out. ${gapSummary}\n\nIf you're open to a conversation, I'd love to share more about the opportunity.\n\nBest,\nRecruiter`,
  };
}

export const draftOutreachEmail = async (
  profile: CandidateProfile,
  standouts: CandidateScore['standouts'],
  gaps: CandidateScore['gaps']
): Promise<{ subject: string; body: string }> => {
  const system = "Compose a personalized outreach email. Reference at least one standout and acknowledge any must-have gaps if present. RETURN ONLY RAW JSON with two string keys: 'subject' and 'body'. No markdown wrappers.";
  const payload = { profile, standouts, gaps };
  const OutreachSchema = z.object({
    subject: z.string(),
    body: z.string(),
  });
  try {
    const parsed = await invokeModel<{ subject: string; body: string }>(system, JSON.stringify(payload), 5, 'draftOutreachEmail', OutreachSchema);
    await supabaseAdmin.from("outreach").insert({ candidate_id: profile.candidateId, subject: parsed.subject, body: parsed.body });
    return parsed;
  } catch (error) {
    console.warn('[draftOutreachEmail] falling back to deterministic outreach draft:', error);
    const fallback = buildFallbackOutreach(profile, standouts, gaps);
    await supabaseAdmin.from("outreach").insert({ candidate_id: profile.candidateId, subject: fallback.subject, body: fallback.body });
    if (profile.candidateId) {
      await supabaseAdmin.from("scores").update({ used_fallback: true }).eq("candidate_id", profile.candidateId);
    }
    return fallback;
  }
};

export const updatePipelineStage = async (candidateId: string, stage: string) => {
  const { error } = await supabaseAdmin
    .from("candidates")
    .update({ stage })
    .eq("id", candidateId);
  if (error) throw error;
};

export const persist = async (type: "candidate" | "score" | "outreach", payload: Record<string, unknown>) => {
  const table = type === "candidate" ? "candidates" : type === "score" ? "scores" : "outreach";
  const { error } = await supabaseAdmin.from(table).insert(payload);
  if (error) throw error;
};

export const getCandidateContext = async (candidateId: string) => {
  const { data, error } = await supabase
    .from("candidates")
    .select("resume_text, parsed_profile")
    .eq("id", candidateId)
    .single();
  if (error) throw error;
  return data;
};
