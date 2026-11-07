import { PageHeader } from "@/components/ui";
import { Sources } from "./Sources";

export const metadata = { title: "Browse recipe sites · Cart Blanche" };

export default function BrowsePage() {
  return (
    <div>
      <PageHeader title="Browse" back="/recipes" />
      <div className="px-4 pb-8">
        <Sources />
      </div>
    </div>
  );
}
