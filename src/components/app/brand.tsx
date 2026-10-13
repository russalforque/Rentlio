import { cn } from '@/lib/utils'

/** The Rentlio mark (a house outline with an open door), traced from public/image.png. Fills with currentColor. */
export function LogoGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="160 150 930 930" className={className} fill="currentColor" aria-hidden>
      <path d="M369 905V577L585 408Q625 382 665 408L872 580V905A95 95 0 0 0 1062 905V567Q1062 523 1025 492L708 230Q628 171 548 228L222 490Q188 517 188 560V905A90.5 90.5 0 0 0 369 905Z" />
      <path d="M527 666L710 594Q753 578 753 624V1000Q753 1036 718 1030L527 991Q497 985 497 961V704Q497 677 527 666Z" />
    </svg>
  )
}

/** Logo: the mark on an ink tile. */
export function BrandMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-lg',
        inverted ? 'bg-hero-foreground text-hero' : 'bg-primary text-primary-foreground',
        className,
      )}
    >
      <LogoGlyph className="size-[64%]" />
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
