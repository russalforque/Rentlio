import { ArrowUpRight, CheckCheck, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { Panel, StatusPill } from '@/components/app/panel'
import { buildTodos, type ActionInput } from './action-items'

export function ActionCenter({ input, className }: { input: ActionInput; className?: string }) {
  const tasks = buildTodos(input)

  return (
    <Panel
      title="Needs attention"
      description="Your next steps, in one place."
      className={className}
      action={<StatusPill tone={tasks.length ? 'warning' : 'success'}>{tasks.length ? `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}` : 'All clear'}</StatusPill>}
    >
      {tasks.length ? (
        <ul className="-mx-2 divide-y">
          {tasks.map((task) => (
            <li key={task.key}>
              <Link to={task.to!} className="group flex min-h-16 items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning-foreground" aria-hidden><task.icon className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-snug font-semibold">{task.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{task.note}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl bg-success/5 px-4 py-6 text-center">
          <CheckCheck className="mx-auto mb-3 size-7 text-success" aria-hidden />
          <p className="text-sm font-semibold">You're all caught up</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Payment reviews, billing tasks, and tenant requests will appear here.</p>
        </div>
      )}
      <Link to={`/billing?period=${input.period}`} className="mt-4 flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        Open this month's billing <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </Panel>
  )
}
