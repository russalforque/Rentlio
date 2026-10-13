import { BarChart3, DoorOpen, Gauge, ReceiptText } from 'lucide-react'
import { Link } from 'react-router'
import { InsightRow, Panel, StatusPill } from '@/components/app/panel'
import { cn } from '@/lib/utils'
import { buildActionRows, type ActionInput } from './action-items'

export function ActionCenter({ input, className }: { input: ActionInput; className?: string }) {
  const { todoCount, rows } = buildActionRows(input)

  return (
    <Panel
      title="Action center"
      className={className}
      action={todoCount > 0 ? <StatusPill tone="destructive">{todoCount} to do</StatusPill> : <StatusPill tone="success">All caught up</StatusPill>}
    >
      <ul className="space-y-2">
        {rows.map((t) => (
          <li key={t.key}>
            <InsightRow
              icon={t.icon}
              title={t.title}
              note={t.note}
              to={t.to}
              trailing={t.trailing && <span className={cn('tabular', t.trailing.alert && 'text-destructive')}>{t.trailing.text}</span>}
            />
          </li>
        ))}
      </ul>
      {/* Phones reach these from the tab bar and More sheet. */}
      <div className="mt-auto hidden pt-5 md:block">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Quick actions</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { to: `/billing?period=${input.period}`, icon: ReceiptText, label: 'Billing' },
            { to: `/billing/readings?period=${input.period}`, icon: Gauge, label: 'Readings' },
            { to: '/rooms', icon: DoorOpen, label: 'Rooms' },
            { to: '/reports', icon: BarChart3, label: 'Reports' },
          ].map((a) => (
            <Link
              key={a.label}
              to={a.to}
              className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:min-h-10"
            >
              <a.icon className="size-4 text-muted-foreground" aria-hidden />
              {a.label}
            </Link>
          ))}
        </div>
      </div>
    </Panel>
  )
}
