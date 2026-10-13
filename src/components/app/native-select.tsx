import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Styled native <select>: best for long lists (timezones) and on phones. */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        className={cn(
          'h-11 w-full appearance-none rounded-lg border border-input bg-card pr-9 pl-3 text-sm shadow-xs outline-none hover:border-foreground/25 dense:h-9',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:opacity-50 dark:bg-input/20',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}
