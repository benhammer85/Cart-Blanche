import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { getMembershipFor } from "@/lib/household/ensure";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { BUCKET, EVERY_DAYS, backupName, makeBackup, restoreBackup, toPrune, type Backup } from "@/lib/backup";

export const maxDuration = 60;

async function who() {
  const db = await supabaseServer();
  const user = await getAuthUser(db);
  const member = user ? await getMembershipFor(user) : null;
  return member ? { db, householdId: member.householdId } : null;
}

/** The household's saved backups, newest first. Makes the private bucket the first time. */
async function listBackups(householdId: string) {
  const admin = supabaseAdmin();
  let { data, error } = await admin.storage.from(BUCKET).list(householdId, { limit: 100, sortBy: { column: "name", order: "desc" } });
  if (error && /not found/i.test(error.message)) {
    await admin.storage.createBucket(BUCKET, { public: false });
    ({ data, error } = await admin.storage.from(BUCKET).list(householdId, { limit: 100, sortBy: { column: "name", order: "desc" } }));
  }
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((f) => f.name.endsWith(".json"))
    .map((f) => ({ name: f.name, createdAt: f.created_at, size: (f.metadata as { size?: number } | null)?.size ?? null }));
}

// GET: the list, or ?file=… to download one.
export async function GET(request: NextRequest) {
  const me = await who();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const file = request.nextUrl.searchParams.get("file");
  try {
    if (!file) return NextResponse.json({ ok: true, backups: await listBackups(me.householdId) });
    if (!/^[\w-]+\.json$/.test(file)) return NextResponse.json({ error: "Bad file" }, { status: 400 });
    const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(`${me.householdId}/${file}`);
    if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(data, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="cart-blanche-${file}"` } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn’t load backups" });
  }
}

// POST {}: back up if the last one is a week old. {force:true}: back up now. {restore:"file"}: put back what's missing.
export async function POST(request: NextRequest) {
  const me = await who();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { force?: boolean; restore?: string };
  const admin = supabaseAdmin();
  try {
    if (body.restore) {
      if (!/^[\w-]+\.json$/.test(body.restore)) return NextResponse.json({ error: "Bad file" }, { status: 400 });
      const { data, error } = await admin.storage.from(BUCKET).download(`${me.householdId}/${body.restore}`);
      if (error || !data) return NextResponse.json({ ok: false, error: "Couldn’t open that backup." });
      const backup = JSON.parse(await data.text()) as Backup;
      const { added } = await restoreBackup(me.db, backup, me.householdId);
      return NextResponse.json({ ok: true, recipes: added.recipes ?? 0, plans: added.meal_plans ?? 0 });
    }

    const existing = await listBackups(me.householdId);
    const newest = existing[0]?.createdAt ? new Date(existing[0].createdAt).getTime() : 0;
    if (!body.force && Date.now() - newest < EVERY_DAYS * 86_400_000) return NextResponse.json({ ok: true, skipped: true });

    const backup = await makeBackup(me.db);
    const name = backupName(new Date());
    const { error } = await admin.storage.from(BUCKET).upload(`${me.householdId}/${name}`, JSON.stringify(backup), { contentType: "application/json", upsert: false });
    if (error) throw new Error(error.message);
    const old = toPrune([name, ...existing.map((b) => b.name)]);
    if (old.length) await admin.storage.from(BUCKET).remove(old.map((n) => `${me.householdId}/${n}`));
    return NextResponse.json({ ok: true, name, recipes: backup.tables.recipes?.length ?? 0 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Backup failed" });
  }
}
