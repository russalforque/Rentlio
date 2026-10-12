import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const RULES = [
  { label: '8+ characters', test: (v: string) => v.length >= 8 },
  { label: 'A letter', test: (v: string) => /[A-Za-z]/.test(v) },
  { label: 'A number', test: (v: string) => /\d/.test(v) },
]

/** Live view of the password rules in lib/validation, ticking off as you type. */
export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Password requirements">
      {RULES.map((r) => {
        const ok = r.test(value)
        return (
          <li key={r.label} className={cn('flex items-center gap-1.5 text-[13px]', ok ? 'text-success' : 'text-muted-foreground')}>
            <span
              className={cn(
                'grid size-4 place-items-center rounded-full border transition-colors',
                ok ? 'border-success bg-success text-white' : 'border-foreground/20',
              )}
              aria-hidden
            >
              {ok && <Check className="size-3" strokeWidth={3} />}
            </span>
            {r.label}
            <span className="sr-only">{ok ? ' met' : ' not met'}</span>
          </li>
        )
      })}
    </ul>
  )
}
