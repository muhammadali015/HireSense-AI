// apply-schema.mjs
// Applies the Supabase schema using the Management API (pg_dump / exec style).
// Run: node apply-schema.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// We'll use the Supabase REST API /rest/v1/rpc endpoint.
// If exec_sql doesn't exist, we'll create each table individually.
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Test by checking if jobs table exists
const { data: existsCheck, error: checkErr } = await supabase.from('jobs').select('id').limit(1);

if (!checkErr) {
  console.log('✅ jobs table already exists — schema already applied.');
  process.exit(0);
}

console.log('jobs table missing:', checkErr?.message);
console.log('Applying schema via Supabase Management API…');

// Use the pg endpoint (project ref from URL)
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!projectRef) { console.error('Could not parse project ref from URL:', SUPABASE_URL); process.exit(1); }

const sql = readFileSync('./supabase/schema.sql', 'utf-8')
  .replace(/create table/gi, 'CREATE TABLE IF NOT EXISTS');

const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  }
);

const text = await res.text();
console.log('Status:', res.status);
console.log('Response:', text);
