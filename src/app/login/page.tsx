import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col px-6">
      <div className="mt-[18vh]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/beret.webp" alt="" width={480} height={302} className="mb-5 w-40" />
        <h1 className="large-title text-[2.75rem]">Cart Blanche</h1>
      </div>
      <LoginForm next={next} />
    </main>
  );
}
