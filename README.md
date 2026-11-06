# Cart Blanche

A private, phone-first web app for our household: plan the week's dinners from our favorite recipes, turn them into a shopping list split by store and aisle, and shop from one shared list that updates live on both phones, even with bad signal.

**Stack:** Next.js 16 (App Router) + TypeScript + Tailwind 4 on Vercel (free tier), Supabase (free tier) for Postgres, Auth, Realtime and Storage. The only AI it can call is the Google Gemini free tier, which is optional. The built-in rule-based planner always works without it.

---

## What's inside

| Area | Where |
|---|---|
| Database schema, row-level security, live-sync and last-write-wins rules | `supabase/migrations/` |
| Default stores, store rules, ingredient categories, pantry staples, kids' favorites | `src/lib/seed/defaults.ts` (applied automatically on first login) |
| Ingredient parser, unit table, name normalization | `src/lib/ingredientParser.ts`, `src/lib/units.ts`, `src/lib/normalize.ts` |
| Rule-based planner (scoring explained in comments) | `src/lib/planner/planner.ts` |
| Shopping-list builder and store assignment | `src/lib/list/` |
| Live, offline-tolerant list sync | `src/lib/offline/useSharedList.ts`, `public/sw.js` |
| Crouton / URL / Claude-bridge importers | `src/lib/import/` |
| Gemini provider (plain `fetch`, no SDK) | `src/lib/ai/` |
| Alexa skill endpoint and interaction model | `src/app/api/alexa/`, `alexa/interaction-model.json` |
| Tests | `tests/` (`npm test`) |

---

## One-time setup (about 15 minutes)

### 1. Supabase

1. Create a free project at <https://supabase.com> (any name, e.g. `cart-blanche`). Pick a region near Boston (us-east-1).
2. **SQL Editor → New query:** paste the whole contents of `supabase/migrations/20261106000001_init.sql` and click **Run**. This creates all tables, security rules, the live-sync publication and the `recipe-images` storage bucket.
3. **Authentication → Sign In / Providers → Email:** make sure Email is enabled. Under **Authentication → Settings**, you can leave "Allow new users to sign up" on: only allowlisted emails can request a code, and anyone else has no household and sees nothing.
4. **Authentication → Emails → Magic Link** template: replace the body with this, so the email has both a code (for the home-screen app) and a link (for Safari):

   ```html
   <h2>Your Cart Blanche sign-in code</h2>
   <p style="font-size:28px;letter-spacing:4px"><b>{{ .Token }}</b></p>
   <p>Or tap: <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in to Cart Blanche</a></p>
   ```

5. **Authentication → URL Configuration:** set **Site URL** to your Vercel URL (e.g. `https://cart-blanche.vercel.app`) and add `https://cart-blanche.vercel.app/**` to **Redirect URLs**.
6. **Project Settings → API:** copy the **Project URL**, the **anon / publishable** key and the **service_role / secret** key for step 2.

> Supabase's built-in email sender only allows a few emails per hour. That's fine for two people. If you hit the limit, add free SMTP (e.g. Resend) under Authentication → Emails → SMTP.

### 2. Vercel

1. At <https://vercel.com>, choose **Add New → Project** and import the `benhammer85/cart-blanche` GitHub repo. The defaults are right (framework: Next.js).
2. Add these **Environment Variables** (also listed in `.env.example`):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key (server-only) |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-app>.vercel.app` |
   | `ALLOWED_EMAILS` | `ben@…=Ben,molly@…=Molly` |
   | `AI_PROVIDER` | `gemini` (optional) |
   | `AI_MODEL` | e.g. `gemini-2.5-flash-lite` (pick any Flash/Flash-Lite model AI Studio lists) |
   | `AI_API_KEY` | your Google AI Studio key (optional) |
   | `ALEXA_SKILL_ID` | from step 4 (optional) |

3. Click **Deploy**. Every push to `main` redeploys automatically.

### 3. On each iPhone

1. Open the Vercel URL in **Safari** and sign in with the 6-digit code from the email.
2. **Share → Add to Home Screen.** Open the app from the home screen and sign in once more with a fresh code. (iOS keeps home-screen apps separate from Safari, so links in emails open in Safari. That's why the email includes a code.)
3. The first login creates the household with your stores, store rules, people, pantry staples and kids' favorites. The second person joins the same household automatically.

### 4. Gemini (optional)

Create a free key at <https://aistudio.google.com/apikey> with a personal Google account, set `AI_API_KEY` in Vercel and redeploy. "Plan with AI" then appears in Plan. Each plan or swap is one request, and the Plan screen shows "AI requests today". Only the food profile is sent: portion counts, kids' ages, recipe titles, ingredients, tags and history. Never names or emails. If Gemini fails or is rate-limited, the app falls back to the rule-based planner and says so.

### 5. Alexa (optional): "Alexa, tell Cart Blanche to add cookies"

1. At <https://developer.amazon.com/alexa/console/ask>, choose **Create Skill**: name *Cart Blanche*, type **Custom**, hosting **Provision your own**, template **Start from scratch**.
2. **Interaction Model → JSON Editor:** paste `alexa/interaction-model.json` and click **Save** → **Build**.
3. **Endpoint → HTTPS:** enter `https://<your-app>.vercel.app/api/alexa` and choose the SSL option *"My development endpoint has a certificate from a trusted certificate authority"*.
4. Copy the **Skill ID** (`amzn1.ask.skill.…`) into Vercel as `ALEXA_SKILL_ID` and redeploy.
5. **Test tab:** set it to *Development*. Your Echo devices on the same Amazon account can now use it, with no publishing needed.

Say: *"Alexa, tell Cart Blanche to add cookies"*, *"Alexa, ask Cart Blanche to add two pounds of chicken thighs"*, or *"Alexa, open Cart Blanche"* and then *"add milk"*. Items go to the store your rules pick and show **Alexa** as who added them. Amazon requires the app's name in the phrase. The endpoint checks Amazon's request signature, certificate, timestamp and skill ID.

---

## Importing from Crouton

1. In Crouton, select recipes, tap **Share**, then **Export**. AirDrop or save the `.crumb` files (or a `.zip`) somewhere you can reach.
2. In Cart Blanche, go to **Recipes → + → Import from Crouton** and pick the files. This also works from a laptop browser.
3. Review the preview. Lines that look garbled (e.g. `% teaspoon`) are flagged in red; tap **Review** to fix them. Already-imported recipes (same Crouton ID, link or title) are skipped.
4. Photos are shrunk to about 1000 px before upload (Crouton stores 3–4 MB per recipe).

The parser was written against real exports and handles Crouton's quirks: amounts stored only as `secondaryAmount`, ranges, units inside the name, blank rows, and prep/cook minutes.

## Adding more recipes

- **From a link:** reads the recipe data most recipe sites include (schema.org JSON-LD).
- **Type or paste:** ingredients one per line, a blank line, then the steps.
- **Ideas from Claude:** copy a ready-made prompt into your Claude app, paste the JSON reply back, then save the recipes or add them straight to this week's plan.

---

## How the planner works

See the comments at the top of `src/lib/planner/planner.ts`. In short:

1. Filter favorites by meal type, prep time (unknown prep time is allowed), excluded tags, excluded ingredients and the avoid list.
2. Score each one: +1 if never made; −3 if made in the last 21 days; up to +2 the longer it has rested; +0.5×log2(times made); +1.5 if the kids eat it too; +1 for bonus tags like "Molly Favorites"; +1.5 per "use up" ingredient (max +3); plus a little seeded randomness.
3. Pinned and locked meals go in first, then one meal per "must include" tag, then the highest scores. With variety on: no repeated main protein and at most one soup.
4. Every dinner the kids won't eat gets a kids' favorite (hot dogs, spaghetti, SpaghettiOs, nuggets, meatballs), rotating least-recently-made first.
5. If there aren't enough matches, it says which filter to relax.

**Portions:** adults count as 1 each. Kids are sized by age (4–8 years old = ½), so Asa and Saul eat 1 adult portion between them. Override this in **Settings → People**.

## How the shared list stays in sync

- Every tap updates the screen immediately, is saved on the phone (IndexedDB), and is queued for the server.
- The queue is sent right away, on reconnect, when the app returns to the foreground, and every 15 s while anything is pending. An **"Offline — N will sync"** pill shows while waiting.
- The database keeps the newest edit for each item (a trigger compares timestamps), so a phone coming back online can never overwrite a newer change.
- Supabase Realtime pushes the other phone's changes (usually within a second or two). After any reconnect, the app reloads the whole list to catch up.
- The service worker caches the app, so it opens with no signal.

---

## Local development

```bash
npm install
```

```bash
cp .env.example .env.local   # fill in your Supabase project values
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run typecheck
```

Test data is created automatically: the first allowlisted login seeds the household (stores, rules, categories, staples, people and five kids' favorites). Import the sample files in `tests/fixtures/` (photos stripped) from **Recipes → Import from Crouton** to get recipes to plan with.
