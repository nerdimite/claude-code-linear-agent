import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Flat and ink-first: 36 / 32 tall, radius 8, 13px at 500, icons at 16. One primary per region. */
export const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-8 border",
    "type-ui font-medium leading-none transition-colors duration-100",
    "disabled:cursor-not-allowed disabled:opacity-50 aria-busy:cursor-progress aria-busy:opacity-100",
  ],
  {
    variants: {
      variant: {
        primary: "border-transparent bg-inverse text-on-inverse hover:bg-inverse-hover",
        secondary: "border-control bg-card text-primary hover:border-border-hover",
        tonal: "border-transparent bg-track text-primary hover:bg-selected",
        ghost: "border-transparent bg-transparent text-secondary hover:bg-hover hover:text-primary",
        destructive: "border-transparent bg-error-fg text-on-inverse hover:bg-error-hover",
      },
      size: {
        default: "h-control-md px-4",
        sm: "h-control-sm px-3",
        icon: "size-control-sm",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { icon?: ReactNode; loading?: boolean };

export function Button({ className, variant, size, icon, loading, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : icon}
      {children}
    </button>
  );
}
