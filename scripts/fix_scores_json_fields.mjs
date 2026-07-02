import fs from 'fs';
import path from 'path';

function loadDotenv(filePath) {
  try {
    const contents = fs.readFileSync(filePath, 'utf8');
    return contents.split(/\r?\n/).reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return acc;
      const [key, ...rest] = trimmed.split('=');
      acc[key] = rest.join('=');
      return acc;
    }, {});
  } catch {
    return {};
  }
}

const env = {
  ...loadDotenv(path.resolve(process.cwd(), '.env')),
  ...loadDotenv(path.resolve(process.cwd(), '.env.local')),
  ...process.env,
};

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase connection values. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment or .env.local file.');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const isValidArray = (value) => Array.isArray(value) && value.every((item) => item && typeof item === 'object');

const parseJsonField = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

console.log('Scanning scores rows for malformed JSON fields...');

const { data: rows, error } = await supabaseAdmin
  .from('scores')
  .select('id, candidate_id, met, gaps, standouts');

if (error) {
  console.error('Failed to query scores:', error);
  process.exit(1);
}

const repairCandidates = [];
for (const row of rows ?? []) {
  const original = {
    met: row.met,
    gaps: row.gaps,
    standouts: row.standouts,
  };

  const repaired = {
    met: original.met,
    gaps: original.gaps,
    standouts: original.standouts,
  };

  if (!isValidArray(original.met)) {
    const parsed = parseJsonField(original.met);
    if (isValidArray(parsed)) repaired.met = parsed;
  }

  if (!isValidArray(original.gaps)) {
    const parsed = parseJsonField(original.gaps);
    if (isValidArray(parsed)) repaired.gaps = parsed;
  }

  if (!isValidArray(original.standouts)) {
    const parsed = parseJsonField(original.standouts);
    if (isValidArray(parsed)) repaired.standouts = parsed;
  }

  const changed =
    !Object.is(repaired.met, original.met) ||
    !Object.is(repaired.gaps, original.gaps) ||
    !Object.is(repaired.standouts, original.standouts);

  if (!changed) continue;

  const updatePayload = {};
  if (repaired.met !== original.met) updatePayload.met = repaired.met;
  if (repaired.gaps !== original.gaps) updatePayload.gaps = repaired.gaps;
  if (repaired.standouts !== original.standouts) updatePayload.standouts = repaired.standouts;

  if (Object.keys(updatePayload).length === 0) continue;

  const { error: updateError } = await supabaseAdmin
    .from('scores')
    .update(updatePayload)
    .eq('id', row.id);

  if (updateError) {
    console.error(`Failed to update score row ${row.id}:`, updateError);
    continue;
  }

  repairCandidates.push({ id: row.id, candidate_id: row.candidate_id, updatePayload });
}

console.log(`Repaired ${repairCandidates.length} score row(s).`);
if (repairCandidates.length > 0) {
  console.table(repairCandidates.map((item) => ({ id: item.id, candidate_id: item.candidate_id, fields: Object.keys(item.updatePayload).join(', ') })));
}
console.log('Done.');
