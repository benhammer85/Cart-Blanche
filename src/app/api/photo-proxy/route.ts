import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { isPrivateHost, UA } from "@/lib/import/fetchRecipe";

// Fetches a chosen photo so the app can save its own copy (browsers can't read
// other sites' images directly). Signed-in only; images only; 12 MB at most.
export async function GET(request: NextRequest) {
  const db = await supabaseServer();
  if (!(await getAuthUser(db))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let target: URL;
  try {
    target = new URL(request.nextUrl.searchParams.get("url") ?? "");
    if (!["http:", "https:"].includes(target.protocol) || isPrivateHost(target.hostname)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Bad address" }, { status: 400 });
  }
  try {
    const res = await fetch(target, { headers: { "user-agent": UA, accept: "image/*" }, signal: AbortSignal.timeout(12_000), cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return NextResponse.json({ error: "Not an image" }, { status: 422 });
    const body = await res.arrayBuffer();
    if (body.byteLength > 12_000_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
    return new NextResponse(body, { headers: { "content-type": type, "cache-control": "private, max-age=600" } });
  } catch {
    return NextResponse.json({ error: "Couldn’t load the photo" }, { status: 422 });
  }
}
