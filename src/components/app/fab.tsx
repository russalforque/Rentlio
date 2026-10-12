import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Phones only: the page's primary action as a floating button above the tab bar,
 * within thumb reach. Larger screens show the same action in the page header.
 */
export function Fab({ icon: Icon, label, onClick, className }: { icon: LucideIcon; label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 inline-flex h-14 items-center gap-2 rounded-2xl bg-primary pr-5 pl-4 text-[15px] font-semibold text-primary-foreground shadow-lg shadow-black/15 transition-transform focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-none active:scale-95 md:hidden',
        className,
      )}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </button>
  )
}
