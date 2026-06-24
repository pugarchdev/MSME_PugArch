import React from 'react';
import { cn } from '../../../../lib/utils';
import { fieldContainerClass, fieldInputClass, fieldTextareaClass } from '../../utils/fieldStyles';

export default function FormField({
  label,
  required,
  error,
  help,
  className,
  fieldId,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string[];
  help?: string;
  className?: string;
  fieldId?: string;
  children: React.ReactNode;
}) {
  const hasError = Boolean(error?.length);

  const enhancedChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;

    if (hasError) {
      if (child.type === 'input') {
        return React.cloneElement(child as React.ReactElement<any>, {
          className: cn(fieldInputClass(true), (child.props as any).className),
          'aria-invalid': true,
        });
      }
      if (child.type === 'textarea') {
        return React.cloneElement(child as React.ReactElement<any>, {
          className: cn(fieldTextareaClass(true), (child.props as any).className),
          'aria-invalid': true,
        });
      }
      return React.cloneElement(child as React.ReactElement<any>, { error });
    }

    return child;
  });

  return (
    <div
      id={fieldId}
      data-field-error={hasError ? 'true' : undefined}
      className={cn('block space-y-1.5', fieldContainerClass(hasError), className)}
    >
      <span className={cn('text-[11px] font-black uppercase', hasError ? 'text-red-700' : 'text-slate-500')}>
        {label} {required && <span className="text-red-600">*</span>}
      </span>
      {enhancedChildren}
      {help && <span className="block text-xs font-semibold text-slate-500">{help}</span>}
      {hasError ? (
        <span className="flex items-center gap-1 text-xs font-bold text-red-600">
          {error![0]}
        </span>
      ) : null}
    </div>
  );
}
