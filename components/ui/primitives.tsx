import type { HTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-12 border border-border bg-card shadow-card", className)} {...props} />;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col-reverse items-start gap-3 border-b border-border-subtle px-5 py-5 sm:flex-row sm:justify-between sm:gap-4 sm:px-6">
      <div className="flex flex-col gap-1">
        <h2 className="type-title-sub text-primary">{title}</h2>
        {description ? <p className="type-body text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-5 sm:px-6", className)} {...props} />;
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("type-ui font-medium text-primary", className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-control-md w-full rounded-8 border border-control bg-card px-3 type-ui text-primary",
        "placeholder:text-faint hover:border-border-hover focus-visible:border-focus-ring focus-visible:outline-none",
        "aria-invalid:border-error-fg",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, hint, error, htmlFor, children }: { label: string; hint?: ReactNode; error?: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="type-small text-error-fg">{error}</p> : hint ? <p className="type-small text-subtle-fg">{hint}</p> : null}
    </div>
  );
}

const badgeTone = {
  neutral: "border-border bg-track text-secondary",
  success: "border-success-border bg-success-bg text-success-fg",
  warning: "border-warning-border bg-warning-bg text-warning-fg",
  error: "border-error-border bg-error-bg text-error-fg",
} as const;

export function Badge({ tone = "neutral", icon, children }: { tone?: keyof typeof badgeTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 type-small font-medium", badgeTone[tone])}>
      {icon}
      {children}
    </span>
  );
}

const alertTone = {
  info: "border-border bg-subtle text-secondary",
  success: "border-success-border bg-success-bg text-success-fg",
  warning: "border-warning-border bg-warning-bg text-warning-fg",
  error: "border-error-border bg-error-bg text-error-fg",
} as const;

export function Alert({ tone = "info", icon, title, children }: { tone?: keyof typeof alertTone; icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-8 border px-4 py-3", alertTone[tone])}>
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="flex flex-col gap-1">
        <p className="type-body-strong">{title}</p>
        {children ? <div className="type-body text-secondary">{children}</div> : null}
      </div>
    </div>
  );
}
