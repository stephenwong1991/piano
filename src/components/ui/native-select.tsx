import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type NativeSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(function NativeSelect(
  { className, children, ...props },
  ref
) {
  return (
    <div className="relative inline-flex h-9 w-full min-w-0 items-stretch">
      <select
        ref={ref}
        className={cn(
          "min-h-0 min-w-[120px] w-full flex-1 appearance-none rounded-lg border border-slate-500/80 bg-slate-900/90 py-0 pl-3 pr-10 text-sm leading-none text-slate-50 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-300">
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      </span>
    </div>
  );
});
