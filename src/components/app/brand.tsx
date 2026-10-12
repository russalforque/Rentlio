import { cn } from '@/lib/utils'

/** Logo: a roofline over a lit window, on an ink tile. */
export function BrandMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-lg',
        inverted ? 'bg-hero-foreground text-hero' : 'bg-primary text-primary-foreground',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[58%]" fill="none" aria-hidden>
        <path d="M3.5 11 12 4l8.5 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 10v9.5h12V10" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <rect x="9.6" y="12.4" width="4.8" height="4.8" rx="1" fill="var(--highlight)" />
      </svg>
    </span>
  )
}

export function Brand({ className, name = 'Rentlio', inverted }: { className?: string; name?: string; inverted?: boolean }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <BrandMark inverted={inverted} />
      <span className={cn('truncate text-base font-semibold tracking-tight', inverted && 'text-hero-foreground')}>{name}</span>
    </div>
  )
}
