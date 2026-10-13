import type { LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface Choice<T extends string> {
  value: T
  title: string
  description: ReactNode
  icon?: LucideIcon
  disabled?: boolean
}

/** Large radio options: one clear choice per card, stacked on phones and side by side when there is room. */
export function ChoiceCards<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = 2,
  className,
}: {
  label: string
  value: T | null
  options: Choice<T>[]
  onChange: (v: T) => void
  columns?: 1 | 2
  className?: string
}) {
  const name = useId()
  return (
    <fieldset className={cn('grid gap-2', columns === 2 && 'sm:grid-cols-2', className)}>
      <legend className="sr-only">{label}</legend>
      {options.map((o) => {
        const checked = value === o.value
        const Icon = o.icon
        return (
          <label
            key={o.value}
            className={cn(
              'relative flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3.5 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring',
              checked ? 'border-primary ring-1 ring-primary' : 'hover:bg-muted/50',
              o.disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {Icon && (
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-lg border',
                  checked ? 'border-primary/30 bg-primary/10 text-primary' : 'bg-muted text-foreground/70',
                )}
                aria-hidden
              >
                <Icon className="size-4" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{o.title}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{o.description}</span>
            </span>
            <span
              className={cn(
                'mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full border',
                checked ? 'border-primary bg-primary' : 'border-input bg-background',
              )}
              aria-hidden
            >
              {checked && <span className="size-1.5 rounded-full bg-primary-foreground" />}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
