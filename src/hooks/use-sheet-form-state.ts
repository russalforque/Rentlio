import { createContext, useContext, useEffect } from 'react'

export const SheetFormContext = createContext<((state: { dirty: boolean; pending: boolean }) => void) | null>(null)

/** Reports form state without coupling reusable forms to their surrounding dialog. */
export function useSheetFormState(dirty: boolean, pending: boolean) {
  const setState = useContext(SheetFormContext)
  useEffect(() => { setState?.({ dirty, pending }) }, [dirty, pending, setState])
}

