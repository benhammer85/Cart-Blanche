import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { aiPlan, type AiPlanRequest } from "@/lib/ai/aiPlanner";
import { AiError, getAiProvider } from "@/lib/ai/provider";

// GET: is AI configured + today's request count. POST: plan with AI.
export async function GET() {
  const db = await supabaseServer();
  const { data } = await db.from("ai_usage").select("requests").eq("day", new Date().toISOString().slice(0, 10)).maybeSingle();
  return NextResponse.json({ enabled: !!getAiProvider(), requestsToday: data?.requests ?? 0 });
}

export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  const body = (await request.json()) as AiPlanRequest;
  try {
    return NextResponse.json({ ok: true, ...(await aiPlan(db, body)) });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError("AI request failed", "failed");
    return NextResponse.json({ ok: false, kind: err.kind, error: err.message });
  }
}
