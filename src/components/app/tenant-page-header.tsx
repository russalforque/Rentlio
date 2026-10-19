import type { ReactNode } from 'react'

interface TenantPageHeaderProps {
  title: ReactNode
  eyebrow?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  badge?: ReactNode
  tabs?: ReactNode
}

/** Tenant-only heading; back navigation stays in the app's compact top bar. */
export function TenantPageHeader({ title, eyebrow, description, actions, badge, tabs }: TenantPageHeaderProps) {
  return (
    <header className="tenant-page-header">
      <div className="tenant-page-header-copy">
        {eyebrow && <p className="tenant-page-eyebrow">{eyebrow}</p>}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-display">{title}</h1>
          {badge}
        </div>
        {description && <p className="tenant-page-description">{description}</p>}
      </div>
      {actions && <div className="tenant-page-actions">{actions}</div>}
      {tabs && <div className="col-span-full min-w-0">{tabs}</div>}
    </header>
  )
}
