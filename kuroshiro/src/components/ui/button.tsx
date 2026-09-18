import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium select-none transition-[transform,background-color,border-color,box-shadow,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone/40 focus-visible:ring-offset-2 focus-visible:ring-offset-ink disabled:pointer-events-none disabled:opacity-40 active:scale-[0.985]",
  {
    variants: {
      variant: {
        primary: "bg-stone text-ink shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:brightness-105",
        secondary: "bg-ink-2 text-paper border border-line shadow-sm hover:-translate-y-0.5 hover:bg-ink-3",
        ghost: "text-mute hover:text-paper hover:bg-ink-2/80",
        danger: "bg-ink-2 text-danger border border-danger/30 hover:bg-danger/10",
      },
      size: {
        sm: "h-10 px-3.5 text-sm rounded-md",
        md: "h-12 px-4 text-sm rounded-lg",
        lg: "h-14 px-5 text-base rounded-xl",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
