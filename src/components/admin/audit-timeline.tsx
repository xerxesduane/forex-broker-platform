import { Fragment } from 'react'

export type AuditEventRow = {
  id: string
  action: string
  entity_type: string
  reason: string | null
  correlation_id: string
  actor_role: string
  created_at: string
  before_state: unknown
  after_state: unknown
}

function formatState(state: unknown): string | null {
  if (state === null || state === undefined) return null
  try {
    return JSON.stringify(state)
  } catch {
    return null
  }
}

export function AuditTimeline({ events }: { events: AuditEventRow[] }) {
  if (events.length === 0) {
    return <p className="text-muted-foreground text-sm">No audit events recorded yet.</p>
  }

  return (
    <ol className="border-border relative space-y-6 border-l pl-6">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span
            className="bg-primary absolute top-1 -left-[27px] size-2.5 rounded-full"
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="font-medium">{event.action}</p>
            <time className="text-muted-foreground text-xs" dateTime={event.created_at}>
              {new Date(event.created_at).toLocaleString()}
            </time>
          </div>
          <p className="text-muted-foreground text-xs">
            Actor role: {event.actor_role} · Entity: {event.entity_type} · Correlation:{' '}
            {event.correlation_id.slice(0, 8)}
          </p>
          {event.reason && <p className="mt-1 text-sm">Reason: {event.reason}</p>}
          {(formatState(event.before_state) || formatState(event.after_state)) && (
            <div className="text-muted-foreground mt-1 space-y-0.5 font-mono text-xs">
              {formatState(event.before_state) && (
                <Fragment>
                  <p>before: {formatState(event.before_state)}</p>
                </Fragment>
              )}
              {formatState(event.after_state) && <p>after: {formatState(event.after_state)}</p>}
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
