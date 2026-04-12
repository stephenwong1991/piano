import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from "react";

function Tabs({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("inline-flex items-center gap-1 rounded-lg border border-slate-600/70 bg-slate-800/60 p-1", className)} {...props} />;
}

type TabsTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(function TabsTrigger(
  { className, active = false, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:text-white",
        active && "bg-slate-100 text-slate-900 shadow",
        className
      )}
      data-active={active ? "true" : "false"}
      {...props}
    />
  );
});

export { Tabs, TabsTrigger };
