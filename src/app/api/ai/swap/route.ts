import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { aiSwap, type AiPlanRequest } from "@/lib/ai/aiPlanner";
import { AiError } from "@/lib/ai/provider";

export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  const body = (await request.json()) as AiPlanRequest & { keepTitles: string[]; replacing: string };
  try {
    return NextResponse.json({ ok: true, ...(await aiSwap(db, body)) });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError("AI request failed", "failed");
    return NextResponse.json({ ok: false, kind: err.kind, error: err.message });
  }
}
