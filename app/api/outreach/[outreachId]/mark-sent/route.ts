// app/api/outreach/[outreachId]/mark-sent/route.ts
// Flips outreach.sent = true in Supabase.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../supabase/client';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ outreachId: string }> }
) {
  const { outreachId } = await params;

  const { error } = await supabaseAdmin
    .from('outreach')
    .update({ sent: true })
    .eq('id', outreachId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
