import { StoreBadge } from "./StoreBadge";

/** Small pill on a recipe photo: this recipe uses something only one store sells. */
export function OnlyAtBadge({ store, items }: { store: string; items: string[] }) {
  return (
    <span
      className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-full bg-black/55 py-0.5 pr-2 pl-0.5 text-[11px] font-semibold text-white backdrop-blur"
      title={`${items.join(", ")} from ${store}`}
    >
      <StoreBadge name={store} size={16} />
      <span className="truncate">{store}</span>
    </span>
  );
}
