import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyAlexaRequest } from "@/lib/alexa/verify";
import { parseIngredientLine } from "@/lib/ingredientParser";
import { assignStore, buildKeywordIndex } from "@/lib/list/storeAssign";
import { loadHouseholdData } from "@/lib/data/household";
import { formatAmount } from "@/lib/units";
import type { IngredientInfo } from "@/lib/types";

// "Alexa, tell Cart Blanche to add cookies" → adds to the shared list.
// Verified per Amazon's rules: signature, certificate, timestamp, skill id.

const speak = (text: string, end = true, reprompt?: string) =>
  NextResponse.json({
    version: "1.0",
    response: {
      outputSpeech: { type: "PlainText", text },
      ...(reprompt ? { reprompt: { outputSpeech: { type: "PlainText", text: reprompt } } } : {}),
      shouldEndSession: end,
    },
  });

interface AlexaBody {
  context?: { System?: { application?: { applicationId?: string } } };
  session?: { application?: { applicationId?: string } };
  request: {
    type: string;
    timestamp: string;
    intent?: { name: string; slots?: Record<string, { value?: string }> };
  };
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const problem = await verifyAlexaRequest(request.headers, raw).catch(() => "verification failed");
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  let body: AlexaBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (Math.abs(Date.now() - Date.parse(body.request.timestamp)) > 150_000) return NextResponse.json({ error: "stale" }, { status: 400 });
  const appId = body.context?.System?.application?.applicationId ?? body.session?.application?.applicationId;
  if (!process.env.ALEXA_SKILL_ID || appId !== process.env.ALEXA_SKILL_ID) return NextResponse.json({ error: "wrong skill" }, { status: 400 });

  const { type, intent } = body.request;
  if (type === "LaunchRequest") return speak("What should I add to the list?", false, "Say, for example, add cookies.");
  if (type === "SessionEndedRequest") return NextResponse.json({ version: "1.0", response: {} });
  if (type !== "IntentRequest" || !intent) return speak("Sorry, I didn’t get that.");
  if (intent.name === "AMAZON.HelpIntent") return speak("Say add, then what you need. For example: add two pounds of chicken thighs.", false, "What should I add?");
  if (intent.name === "AMAZON.StopIntent" || intent.name === "AMAZON.CancelIntent" || intent.name === "AMAZON.NavigateHomeIntent") return speak("Okay.");
  if (intent.name !== "AddItemIntent") return speak("You can say: add milk.", false, "What should I add?");

  const spoken = intent.slots?.item?.value?.trim();
  if (!spoken) return speak("What should I add?", false, "Say, for example, add cookies.");

  const db = supabaseAdmin();
  const { data: hh } = await db.from("households").select("id").order("created_at").limit(1).maybeSingle();
  if (!hh) return speak("Cart Blanche isn’t set up yet.");
  const household = await loadHouseholdData(db, hh.id).catch(() => null);
  let { data: list } = await db.from("shopping_lists").select("id").eq("household_id", hh.id).eq("is_active", true).maybeSingle();
  if (!list) list = (await db.from("shopping_lists").insert({ household_id: hh.id, is_active: true }).select("id").single()).data;
  if (!household || !list) return speak("Sorry, I couldn’t reach the list.");

  const parsed = parseIngredientLine(spoken, household.synonyms);
  const ingredients = new Map<string, IngredientInfo>(household.ingredients.filter((i) => i.name_norm).map((i) => [i.name_norm, i]));
  const stores = household.stores.filter((s) => !s.archived);
  const a = assignStore(parsed.nameNorm, {
    selectedStoreIds: stores.map((s) => s.id),
    categories: household.categories,
    rules: household.rules,
    sections: household.sections,
    ingredients,
    keywordIndex: buildKeywordIndex(ingredients),
  });
  const name = parsed.name.charAt(0).toUpperCase() + parsed.name.slice(1);
  const { error } = await db.from("shopping_list_items").insert({
    id: crypto.randomUUID(),
    household_id: hh.id,
    list_id: list.id,
    name,
    name_norm: parsed.nameNorm,
    qty: parsed.qty,
    unit: parsed.unit,
    display_qty: parsed.qty != null ? formatAmount(parsed.qty, parsed.unit, parsed.qtyMax) : null,
    store_id: a.storeId,
    section_id: a.sectionId,
    added_by: "Alexa",
    is_manual: true,
    client_updated_at: new Date().toISOString(),
  });
  if (error) return speak("Sorry, I couldn’t add that.");
  const storeName = stores.find((s) => s.id === a.storeId)?.name;
  return speak(`Added ${spoken}${storeName ? ` for ${storeName}` : ""}.`);
}
