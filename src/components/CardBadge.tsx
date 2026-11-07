import { StoreBadge } from "./StoreBadge";

/**
 * One badge per recipe card, the most useful one:
 * an untried Idea, then something only one store sells, then Kids' menu,
 * then Loved, then Kid-friendly.
 */
export function CardBadge({ idea, store, kidsMenu, loved, kidFriendly }: { idea?: boolean; store?: string | null; kidsMenu?: boolean; loved?: boolean; kidFriendly?: boolean }) {
  const pill = "absolute top-2 left-2 flex max-w-[calc(100%-3rem)] items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur";
  if (idea) return <span className={pill}>Idea</span>;
  if (store)
    return (
      <span className={pill + " pl-0.5"}>
        <StoreBadge name={store} size={16} />
        <span className="truncate">{store}</span>
      </span>
    );
  if (kidsMenu) return <span className={pill}>Kids’ menu</span>;
  if (loved) return <span className={pill}>♥ Loved</span>;
  if (kidFriendly) return <span className={pill}>Kid-friendly</span>;
  return null;
}
