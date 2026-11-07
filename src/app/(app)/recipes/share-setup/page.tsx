import { PageHeader } from "@/components/ui";

export const metadata = { title: "Share button setup · Cart Blanche" };

const STEPS = [
  "Open the Shortcuts app and tap + to create a new shortcut. Name it “Add to Cart Blanche”.",
  "Open the shortcut’s details (ⓘ) and turn on Show in Share Sheet. Under Receives, choose URLs and Safari web pages.",
  "Add the action URL Encode. It should use the Shortcut Input.",
  "Add a Text action containing https://cart-blanche-eight.vercel.app/recipes/new?url= followed by the URL Encoded Text variable.",
  "Add the action Open URLs, set to the Text from the previous step, and tap Done.",
];

export default function ShareSetupPage() {
  return (
    <div>
      <PageHeader title="Share button setup" back="/recipes" subtitle="Save a recipe from Safari, NYT Cooking or any recipe site with one tap." />
      <div className="px-4">
        <ol className="card mt-5 divide-y divide-line overflow-hidden">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-3 px-4 py-3.5 text-[16px] leading-relaxed">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[13px] font-bold text-bg">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <h2 className="mt-8 px-1 text-[20px] font-bold">For sites that block apps</h2>
        <ol className="card mt-3 divide-y divide-line overflow-hidden">
          {[
            "Make a second shortcut named “Copy recipe to Cart Blanche” with Show in Share Sheet on, receiving Safari web pages.",
            "Add the action Get Details of Safari Web Page and choose Page Contents.",
            "Add Copy to Clipboard.",
            "Add Open URLs with https://cart-blanche-eight.vercel.app/recipes/new?mode=paste, then tap Done.",
            "On a recipe page, tap Share → Copy recipe to Cart Blanche, then tap Paste from clipboard and read.",
          ].map((t, i) => (
            <li key={i} className="flex gap-3 px-4 py-3.5 text-[16px] leading-relaxed">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[13px] font-bold text-bg">{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 px-1 text-[14px] leading-relaxed text-muted">
          Then, on any recipe page, tap Share and choose Add to Cart Blanche. The recipe opens ready to review and save. It opens in Safari, so sign in there once.
        </p>
      </div>
    </div>
  );
}
