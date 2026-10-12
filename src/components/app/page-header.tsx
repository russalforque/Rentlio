import type { LucideIcon } from 'lucide-react'
import { MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: ReactNode
  /** Small line above the title, e.g. today's date. */
  eyebrow?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** Tabs or filters under the title, as in "View all · Available · Sold". */
  tabs?: ReactNode
}

export function PageHeader({ title, eyebrow, description, actions, tabs }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-[min(100%,15rem)] flex-1">
        {eyebrow && <p className="mb-1 text-[13px] text-muted-foreground">{eyebrow}</p>}
        <h1 className="font-display text-2xl leading-tight font-semibold">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground md:text-[13px]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:pt-0.5">{actions}</div>}
      {tabs && <div className="w-full min-w-0">{tabs}</div>}
    </div>
  )
}

export interface MenuAction {
  label: string
  icon: LucideIcon
  onSelect: () => void
  disabled?: boolean
}

/**
 * Phones: secondary page actions folded into a "⋯" menu so the header stays on
 * one line. Hidden from `sm` up, where the caller shows them as buttons.
 */
export function ActionsMenu({ actions, label = 'More actions', className }: { actions: MenuAction[]; label?: string; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={label} className={cn('sm:hidden', className)}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {actions.map((a) => (
          <DropdownMenuItem key={a.label} onSelect={a.onSelect} disabled={a.disabled}>
            <a.icon /> {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
