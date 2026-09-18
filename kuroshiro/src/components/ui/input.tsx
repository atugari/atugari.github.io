import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-xl border border-line bg-ink-2/95 px-3.5 text-sm text-paper shadow-sm placeholder:text-faint",
        "transition-[border-color,box-shadow] duration-(--motion-quick) ease-(--ease-smooth-out)",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-stone/15 focus-visible:border-stone/45",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
