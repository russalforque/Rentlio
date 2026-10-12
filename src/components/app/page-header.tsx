import type { ReactNode } from 'react'

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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[13px] text-muted-foreground">{eyebrow}</p>}
        <h1 className="font-display text-[22px] leading-tight font-semibold sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{description}</p>}
        {tabs && <div className="mt-3">{tabs}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:pt-0.5">{actions}</div>}
    </div>
  )
}
