import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

interface FormFieldProps {
  id: string
  label: string
  error?: string
  hint?: ReactNode
  children: ReactNode
}

/**
 * Label + control + hint/error. The error is announced to screen readers when
 * it appears (role="alert") and wraps rather than widening the layout.
 */
export function FormField({ id, label, error, hint, children }: FormFieldProps) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] wrap-anywhere text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-[13px] text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
