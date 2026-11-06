import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col px-6">
      <div className="mt-[18vh]">
        <div className="mb-6 grid h-16 w-16 place-items-center rounded-[1.25rem] bg-accent text-3xl text-accent-ink shadow-md">
          <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" /><circle cx="10" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></svg>
        </div>
        <h1 className="large-title">Cart Blanche</h1>
        <p className="mt-2 text-[17px] text-muted">Dinner plans and one shared list for the whole family.</p>
      </div>
      <LoginForm />
    </main>
  );
}
