import * as React from "react";
import { cn } from "../../lib/utils";
import { Eye, EyeOff } from "lucide-react";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label?: string, error?: string, isValid?: boolean }>(
  ({ className, type, label, error, isValid, ...props }, ref) => {
    const id = React.useId();
    const [showPassword, setShowPassword] = React.useState(false);
    const isPassword = type === "password";

    return (
      <div className="w-full min-w-0 space-y-1.5">
        {label && (
          <label htmlFor={id} className="block break-words text-[11px] font-bold uppercase tracking-wide text-slate-500 leading-snug peer-disabled:cursor-not-allowed peer-disabled:opacity-70 sm:text-xs sm:tracking-wider">
            {label}
          </label>
        )}
        <div className="relative min-w-0">
          <input
            id={id}
            type={isPassword ? (showPassword ? "text" : "password") : type}
            className={cn(
              "flex h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-100/50 px-3 py-2 text-xs ring-offset-white file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all sm:text-xs",
              isPassword && "pr-10",
              error && "border-red-500 focus-visible:ring-red-500 bg-red-50/30",
              isValid && !error && "border-green-500 focus-visible:ring-green-500 bg-green-50/30",
              className
            )}
            ref={ref}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors focus:outline-none"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string, error?: string }>(
  ({ className, label, error, children, ...props }, ref) => {
    const id = React.useId();
    return (
      <div className="w-full min-w-0 space-y-1.5">
        {label && (
          <label htmlFor={id} className="block break-words text-[11px] font-bold uppercase tracking-wide text-slate-500 leading-snug sm:text-xs sm:tracking-wider">
            {label}
          </label>
        )}
        <select
          id={id}
          className={cn(
            "h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-100/50 px-3 py-2 text-xs ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all sm:text-xs",
            error && "border-red-500 focus-visible:ring-red-500",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Input, Select };
