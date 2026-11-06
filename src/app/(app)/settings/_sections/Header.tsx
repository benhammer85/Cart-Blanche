// Server-safe header (no client hooks) for static settings pages.
export function PageHeaderStatic({ title }: { title: string }) {
  return (
    <header className="pt-safe px-5">
      <div className="h-11" />
      <h1 className="large-title mt-1">{title}</h1>
    </header>
  );
}
