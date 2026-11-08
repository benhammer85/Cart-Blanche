"use client";
// Shared UI primitives in the Cart Blanche style.
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { IconBack, IconMinus, IconPlus, IconX } from "./icons";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100",
        size === "sm" && "h-9 px-3.5 text-sm",
        size === "md" && "h-11 px-5 text-[15px]",
        size === "lg" && "h-14 px-6 text-[17px]",
        variant === "primary" && "bg-ink text-bg",
        variant === "secondary" && "text-ink ring-1 ring-line ring-inset",
        variant === "ghost" && "text-accent",
        variant === "danger" && "text-[#c0392b] ring-1 ring-line ring-inset",
        className,
      )}
    />
  );
}

export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "h-9 shrink-0 rounded-full px-3.5 text-[14px] font-medium transition active:scale-95",
        active ? "bg-ink text-bg" : "text-ink ring-1 ring-line",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Stepper({ value, min, max, onChange, step = 1, label }: { value: number; min: number; max: number; onChange: (v: number) => void; step?: number; label?: string }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-soft p-1" aria-label={label}>
      <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-card text-lg shadow-sm disabled:opacity-30" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label="Decrease">
        <IconMinus />
      </button>
      <span className="w-8 text-center text-[17px] font-semibold tabular-nums">{value}</span>
      <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-card text-lg shadow-sm disabled:opacity-30" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label="Increase">
        <IconPlus />
      </button>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx("relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors", checked ? "bg-ink" : "bg-line")}
    >
      <span className={cx("absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-[2px]")} />
    </button>
  );
}

export function Segmented<T extends string | number | null>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-soft p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx("h-8 flex-1 rounded-lg text-[14px] font-medium transition", o.value === value ? "bg-card shadow-sm" : "text-muted")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, back, right }: { title: string; subtitle?: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <header className="pt-safe px-5">
      <div className="flex h-11 items-center justify-between">
        {back ? (
          <Link href={back} className="-ml-2 flex items-center text-[17px] text-ink">
            <IconBack className="text-2xl" />
            Back
          </Link>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">{right}</div>
      </div>
      <h1 className="large-title mt-1">{title}</h1>
      {subtitle && <div className="recipe-title mt-1 text-[17px] text-muted italic">{subtitle}</div>}
    </header>
  );
}

export function Section({ title, children, action, className }: { title?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cx("mt-6", className)}>
      {(title || action) && (
        <div className="mb-2 flex items-end justify-between px-1">
          {title && <h2 className="menu-label text-muted">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Row({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className={cx("flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left", className)}>
      {children}
    </Comp>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="animate-fade absolute inset-0 bg-black/35" onClick={onClose} />
      <div className="animate-sheet pb-safe relative max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-t-[1.75rem] bg-bg px-5 pt-3">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[20px] font-bold">{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-soft text-muted" aria-label="Close">
            <IconX />
          </button>
        </div>
        {children}
        <div className="h-4" />
      </div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center">
      {icon && <div className="mb-3 text-5xl text-muted/60">{icon}</div>}
      <p className="text-[17px] font-semibold">{title}</p>
      {children && <div className="mt-1 text-[15px] text-muted">{children}</div>}
    </div>
  );
}

export function TextField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx("h-12 w-full rounded-xl bg-card px-4 text-[16px] ring-1 ring-line outline-none placeholder:text-muted focus:ring-2 focus:ring-accent", props.className)}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx("w-full rounded-xl bg-card p-4 text-[16px] leading-relaxed ring-1 ring-line outline-none placeholder:text-muted focus:ring-2 focus:ring-accent", props.className)}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx("h-12 w-full appearance-none rounded-xl bg-card px-4 text-[16px] ring-1 ring-line outline-none focus:ring-2 focus:ring-accent", props.className)}
    />
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="animate-fade fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+11rem)] z-[60] flex justify-center px-6">
      <div className="rounded-full bg-ink px-4 py-2.5 text-[14px] font-medium text-bg shadow-lg">{message}</div>
    </div>
  );
}
