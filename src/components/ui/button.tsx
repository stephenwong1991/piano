import { cva } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border border-blue-400/60 bg-blue-500/15 text-blue-100 hover:bg-blue-500/30",
        secondary: "border border-slate-500 bg-slate-700/30 text-slate-100 hover:bg-slate-700/60",
        warning: "border border-amber-400/60 bg-amber-500/10 text-amber-100 hover:bg-amber-500/25",
        ghost: "border border-transparent bg-transparent text-slate-100 hover:bg-slate-800/60"
      },
      size: {
        default: "h-9 px-3 py-2",
        sm: "h-8 rounded-md px-2.5 text-xs",
        icon: "size-8 shrink-0 rounded-md p-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "warning" | "ghost";
  size?: "default" | "sm" | "icon";
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size = "default", ...props }, ref) {
  return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});

export { Button, buttonVariants };
