import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium",
    "transition-[opacity,transform,background-color,border-color,color] duration-[var(--motion-quick)]",
    "ease-[var(--ease-out)] select-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
    "disabled:pointer-events-none disabled:opacity-40",
    "active:not-disabled:scale-[0.96]",
  ].join(" "),
  {
    variants: {
      variant: {
        solid:
          "bg-fg text-bg hover:bg-fg/90",
        ghost:
          "bg-transparent text-fg/80 hover:bg-elevated hover:text-fg border border-transparent",
        outline:
          "bg-surface/70 text-fg border border-border hover:bg-elevated",
        quiet:
          "bg-transparent text-muted hover:text-fg hover:bg-elevated/80",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-10 px-3.5 text-sm",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type, ...props }: Props) {
  return (
    <button
      type={type ?? "button"}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
