import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col px-6">
      <div className="mt-[18vh]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="mb-6 h-20 w-20 rounded-[1.4rem] shadow-md" />
        <h1 className="large-title">Cart Blanche</h1>
        <p className="mt-2 text-[17px] text-muted">Dinner plans and one shared list for the whole family.</p>
      </div>
      <LoginForm next={next} />
    </main>
  );
}
