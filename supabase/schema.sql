create table jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  requirements jsonb, -- [{ id, description, tier: 'must_have' | 'nice_to_have' }]
  created_at timestamptz default now()
);

create table candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id),
  name text,
  email text,
  resume_text text,
  parsed_profile jsonb,
  stage text default 'new', -- new | scored | outreach_sent | responded | rejected
  created_at timestamptz default now()
);

create table scores (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id),
  score int,
  met jsonb,        -- [{ requirement_id, evidence }]
  gaps jsonb,        -- [{ requirement_id, note }]
  standouts jsonb,   -- [{ item, why_it_matters }]
  rationale text,
  signals jsonb,     -- [{type:string, detail:string}]
  flagged_for_review boolean default false,
  created_at timestamptz default now()
);

create table outreach (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id),
  subject text,
  body text,
  sent boolean default false,
  created_at timestamptz default now()
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id),
  todos jsonb,   -- current plan state, for the live "what is the agent doing" panel
  status text,   -- running | complete | failed
  created_at timestamptz default now()
);
