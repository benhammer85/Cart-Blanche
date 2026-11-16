import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Called once a day by Vercel (see vercel.json) so the free Supabase project
// sees activity and isn't paused for being idle. One tiny read, nothing else.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 });
  const { error } = await supabaseAdmin().from("households").select("id").limit(1);
  return NextResponse.json({ ok: !error, at: new Date().toISOString() });
}
