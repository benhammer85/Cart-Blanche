// Shown instantly while a tab loads, so taps feel immediate.
export default function Loading() {
  return (
    <div className="pt-safe animate-pulse px-5" aria-busy="true" aria-label="Loading">
      <div className="h-11" />
      <div className="mt-1 h-9 w-48 rounded-xl bg-soft" />
      <div className="mt-3 h-4 w-32 rounded-lg bg-soft" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card flex gap-3 p-3">
            <div className="h-16 w-16 shrink-0 rounded-xl bg-soft" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 w-3/4 rounded bg-soft" />
              <div className="h-3 w-1/2 rounded bg-soft" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
