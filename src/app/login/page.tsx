import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col px-6">
      <div className="mt-[18vh]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="mb-6 h-20 w-20 rounded-[1.4rem] shadow-md" />
        <h1 className="large-title text-[2.75rem]">Cart Blanche</h1>
        <p className="recipe-title mt-1 text-[19px] text-muted italic">Dinner and groceries, together.</p>
      </div>
      <LoginForm next={next} />
    </main>
  );
}
