import React from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface LoaderProps extends React.ComponentPropsWithoutRef<typeof RefreshCw> {
  /**
   * If true, ignores color classes (e.g. text-indigo-650, text-[#12335f]) and enforces the brand-gold style.
   * Defaults to true.
   */
  forceGold?: boolean;
}

export const Loader2 = React.forwardRef<SVGSVGElement, LoaderProps>(
  ({ className, forceGold = true, ...props }, ref) => {
    let resolvedClassName = className || '';

    if (forceGold) {
      // Clean up text-... classes to prevent custom colors overriding our brand-gold color
      resolvedClassName = resolvedClassName.replace(/\btext-\S+/g, '').trim();
    }

    return (
      <RefreshCw
        ref={ref}
        className={cn(
          "animate-spin shrink-0",
          forceGold ? "text-brand-gold" : "",
          resolvedClassName
        )}
        {...props}
      />
    );
  }
);

Loader2.displayName = 'Loader2';
