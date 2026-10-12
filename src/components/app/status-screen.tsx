import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Brand } from '@/components/app/brand'
import { cn } from '@/lib/utils'

/** Full-page message used outside the app shell: broken links, blocked accounts, 404. */
export function StatusScreen({
  icon: Icon,
  tone = 'neutral',
  title,
  children,
  actions,
}: {
  icon: LucideIcon
  tone?: 'neutral' | 'destructive'
  title: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="px-5 py-5 sm:px-8">
        <Brand />
      </header>
      <main className="flex flex-1 items-center justify-center px-5 pb-20">
        <div className="w-full max-w-md text-center">
          <span
            className={cn(
              'mx-auto mb-6 grid size-14 place-items-center rounded-xl border',
              tone === 'destructive' ? 'border-destructive/20 bg-destructive/10 text-destructive' : 'bg-card text-foreground/70',
            )}
          >
            <Icon className="size-7" aria-hidden />
          </span>
          <h1 className="font-display text-2xl font-semibold">{title}</h1>
          <div className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
          {actions && <div className="mt-8 grid gap-2">{actions}</div>}
        </div>
      </main>
    </div>
  )
}
