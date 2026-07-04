# HireSense AI — Recruiting Pipeline Deep Agent Co-pilot

A weekend build for the Z360 Deep Agent Harness challenge: an AI agent that screens a batch of resumes against a job description, scores each candidate against explicit requirements with a traceable rationale, and drafts personalized outreach for the strongest matches.

**Live demo:** `[https://hire-sense-ai-orcin.vercel.app/]`



---

## The problem

A recruiter or hiring manager running one open role gets a folder of resumes for a job description. Today, they open each one, skim it against the JD, mentally score it, decide who to move forward, and — if they remember — write a personalized outreach note. This is slow, and the scoring is inconsistent across candidates reviewed on different days, because there's no fixed rubric behind the judgment.

HireSense AI replaces that manual pass with a consistent, requirement-by-requirement process: paste a JD once, paste a batch of resumes, and get back a ranked pipeline where every score traces back to specific evidence — which requirements were met, which were missing, and what stood out beyond what was asked for.

## What it does

1. **Requirement extraction** — the JD is parsed once into explicit must-have and nice-to-have requirements, so every resume in the batch is judged against the identical bar.
2. **Per-candidate scoring** — each resume is checked against every requirement individually. The agent records what's met (with cited evidence), what's missing (named specifically, e.g. "MongoDB — no evidence found"), and what's a standout beyond the JD's ask.
3. **Broader signals** — beyond requirement matching, the agent separately notes career trajectory, quantifiable impact, and any red flags (employment gaps, short tenures) — the latter surfaced neutrally as a note for the recruiter, never as an automatic score penalty.
4. **Ranked pipeline** — candidates are ranked by score, with gap/standout chips visible directly in the table, so a recruiter can see *why* someone ranked where they did without opening a single resume.
5. **Outreach drafting** — candidates above a score threshold get a personalized outreach email draft, referencing a real strength from their own resume.
6. **Direct chat interface** — a recruiter can ask follow-up questions about any candidate ("why did this person score low?", "redraft their outreach to sound more casual") and get answers grounded in that candidate's actual data, not a generic response.

## Harness design

The agent is built around Google Gemini, with structured output enforced at the API boundary (Zod schemas via `withStructuredOutput`) rather than relying on prompt instructions alone — every scoring/extraction call returns a guaranteed shape, so the UI never receives malformed data.

**Model-calling functions** (the agent's actual judgment):
- `extractRequirements` — splits the JD into must-have/nice-to-have requirements, once per job
- `parseAndScoreResume` — merged parsing + scoring in a single call per resume, returning structured `met`/`gaps`/`standouts`/`signals`/`rationale`
- `draftOutreachEmail` — writes personalized outreach for qualifying candidates
- The chat endpoint, grounded in a candidate's stored profile and score

**Deterministic functions** (no model call, by design):
- Duplicate checking, pipeline stage transitions, and score-threshold comparisons are plain code — not routed through the model, since they're simple lookups/comparisons, not judgment calls.

**Reliability behavior:**
- Every model call has exponential backoff with jitter and respects `Retry-After` on rate limits.
- If a call still fails after retries, a deterministic fallback path produces a usable (if lower-fidelity) result rather than blocking the batch — and every fallback-generated row is explicitly flagged (`used_fallback: true`) and marked in the UI, so a fallback score is never presented as indistinguishable from a real one.
- A run that hits an unhandled error is marked `failed`, not `complete` — the system doesn't report success when it isn't.

## Scoring methodology

The score is *derived* from the requirement check, not asked for independently: each unmet must-have is a significant penalty; nice-to-haves and standouts add smaller positive weight; trajectory and quantifiable impact add a modest corroborating boost; red flags never subtract from the score directly — they're surfaced for human judgment, since gaps and short tenures have many legitimate explanations a resume can't state. The written rationale must trace back to the specific requirements, gaps, standouts, and signals that produced the number.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), Tailwind CSS, shadcn/ui |
| Backend / persistence | Supabase (Postgres) |
| Agent model | Google Gemini (Flash tier) |
| Deployment | Vercel |

## Running it locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables — create `.env.local` (copy from `.env.example` if present):
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   GOOGLE_API_KEY=your-gemini-api-key
   ```

3. Run the Supabase schema migration (`supabase/schema.sql`) against your project via the Supabase SQL editor.

4. Start the dev server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

## Scope cuts — deliberate, not oversights

This was scoped tightly to fit a weekend build. Explicitly out of scope:
- **PDF/DOCX parsing limits** — resumes beyond a certain size/complexity may not extract perfectly; this wasn't hardened for arbitrary document quality.
- **Authentication / multi-tenant support / Supabase RLS** — all writes currently go through a server-side service-role key with no client-side database access or per-user auth. This is the first thing I'd add before this handled real candidate data in a multi-user setting.
- **Real email sending** — outreach is drafted and saved, with a "mark as sent" action; nothing is actually dispatched. A human sends the final email.
- **Automated test coverage** — there are currently no automated tests. The highest-value first test would cover the `met`/`gaps`/`standouts` structured-output contract, since a shape mismatch there was an actual bug encountered and fixed during development.
- **Batch size** — capped to keep runs comfortably within serverless function time limits during a demo.

## What I'd build next, with more time

- Real sub-agent delegation (isolated context per resume) rather than the current sequential per-resume loop, which was a deliberate simplification to reduce complexity and Gemini rate-limit risk within the weekend timeframe.
- Supabase RLS policies and basic auth before any real candidate data touches this.
- An eval set of resumes with human-assigned "correct" scores, to catch rubric drift whenever the prompt changes.
- A bias check: re-run scoring with names/schools redacted and compare score deltas.
- Structured telemetry — model name, retry count, fallback cause — queryable per run, not just present in logs.
- Human-in-the-loop approval before outreach drafts are marked ready to send.

## Time spent

`[FILL IN — approximate hours across the weekend]`

## Learn more

This project was bootstrapped with `create-next-app`. For general Next.js reference:
- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
