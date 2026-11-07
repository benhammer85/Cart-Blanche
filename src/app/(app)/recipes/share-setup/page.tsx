import { PageHeader } from "@/components/ui";

export const metadata = { title: "Share button setup · Cart Blanche" };

// One shortcut for every site: it sends the page you have open in Safari, so it
// works on sites that don't let apps read them too.
const STEPS = [
  "Open the Shortcuts app and tap + to make a new shortcut. Name it “Send page to Cart Blanche”.",
  "Tap ⓘ, turn on Show in Share Sheet, and set Receives to Safari web pages.",
  "Add the action Run JavaScript on Web Page. Replace its script with the line below.",
  "Add Copy to Clipboard (it copies the Result).",
  "Add Open URLs with https://cart-blanche-eight.vercel.app/recipes/new?mode=paste, then tap Done.",
];

export default function ShareSetupPage() {
  return (
    <div>
      <PageHeader title="Share button setup" back="/recipes" subtitle="Save a recipe from any site in Safari, in one tap." />
      <div className="px-4">
        <ol className="card mt-5 divide-y divide-line overflow-hidden">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-3 px-4 py-3.5 text-[16px] leading-relaxed">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[13px] font-bold text-bg">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <pre className="card mt-3 overflow-x-auto p-4 text-[13px] leading-relaxed select-all">completion(document.documentElement.outerHTML);</pre>
        <h2 className="recipe-title mt-8 px-1 text-[22px] font-semibold">Using it</h2>
        <p className="mt-2 px-1 text-[15px] leading-relaxed">
          On a recipe page in Safari, tap Share, then Send page to Cart Blanche. In the app, tap Paste from clipboard and read. A page with several recipes shows a list to choose from.
        </p>
        <p className="mt-3 px-1 text-[15px] leading-relaxed text-muted">
          In another app (NYT Cooking, Instagram), copy the link instead, then go to Recipes, tap +, and choose From a link. It opens in Safari, so sign in there once.
        </p>
      </div>
    </div>
  );
}
