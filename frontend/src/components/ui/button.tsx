import * as React from "react";
import { cn } from "../../lib/utils";

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost', size?: 'sm' | 'md' | 'lg' | 'icon' }>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: 'bg-brand-navy text-white hover:bg-brand-deep shadow-sm',
      secondary: 'bg-brand-navy text-white hover:bg-brand-deep shadow-sm',
      outline: 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
      ghost: 'bg-transparent hover:bg-slate-100 text-slate-600',
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs',
      md: 'h-10 px-4 py-2 text-sm',
      lg: 'h-12 px-8 text-base',
      icon: 'h-10 w-10 p-0',
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:opacity-50 active:scale-95 active:translate-y-px hover:-translate-y-0.5 disabled:hover:translate-y-0",
          "focus-visible:ring-brand-navy",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
