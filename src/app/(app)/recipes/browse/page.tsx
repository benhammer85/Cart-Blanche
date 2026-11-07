import { PageHeader } from "@/components/ui";
import { Sources } from "./Sources";

export const metadata = { title: "Browse recipe sites · Cart Blanche" };

export default function BrowsePage() {
  return (
    <div>
      <PageHeader title="Browse" back="/recipes" subtitle="Trusted sites whose recipes save cleanly. Open one and tick what you want." />
      <div className="px-4 pb-8">
        <Sources />
      </div>
    </div>
  );
}
