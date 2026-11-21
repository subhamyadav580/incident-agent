import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors " +
  "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-white shadow-sm hover:brightness-110",
  secondary: "border border-line-strong bg-surface-2 text-fg hover:bg-hover",
  ghost: "text-fg-2 hover:bg-hover hover:text-fg",
  danger: "border border-line-strong bg-surface-2 text-err hover:bg-err-soft",
};
const sizes: Record<Size, string> = { sm: "h-7 px-2.5 text-[12.5px]", md: "h-9 px-3.5 text-[13.5px]" };

export const buttonClass = (variant: Variant = "secondary", size: Size = "md", className?: string) =>
  cn(base, variants[variant], sizes[size], className);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({ variant, size, loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button type="button" className={buttonClass(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, className, ...props }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
