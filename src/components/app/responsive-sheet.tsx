import { useState, type ReactNode } from 'react'
import { SheetFormContext } from '@/hooks/use-sheet-form-state'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { ConfirmDialog } from './confirm-dialog'
import { Dialog } from '@/components/ui/dialog'

/** Radix supplies focus trapping; DialogContent supplies the mobile bottom-sheet layout. */
interface ResponsiveSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  dirty?: boolean
  pending?: boolean
}

export function ResponsiveSheet(props: ResponsiveSheetProps) {
  return props.open ? <SheetSession {...props} /> : null
}

function SheetSession({ onOpenChange, children, dirty = false, pending = false }: ResponsiveSheetProps) {
  const [state, setState] = useState({ dirty: false, pending: false })
  const [discarding, setDiscarding] = useState(false)
  useUnsavedChanges(state.dirty || state.pending || dirty || pending, 'form changes')
  return (
    <SheetFormContext value={setState}>
      <Dialog open onOpenChange={(open) => {
        if (open || state.pending || pending) return
        if (state.dirty || dirty) setDiscarding(true)
        else onOpenChange(false)
      }}>{children}</Dialog>
      <ConfirmDialog open={discarding} onOpenChange={setDiscarding} title="Discard unsaved changes?"
        description="Your changes have not been saved. Keep editing to finish this record."
        confirmLabel="Discard changes" destructive onConfirm={() => onOpenChange(false)} />
    </SheetFormContext>
  )
}
