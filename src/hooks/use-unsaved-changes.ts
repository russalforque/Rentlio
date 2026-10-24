import { useEffect } from 'react'
import { useBlocker } from 'react-router'

/** Protect long reading grids from refreshes and ordinary in-app navigation. */
export function useUnsavedChanges(dirty: boolean, subject = 'meter readings') {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && (
    currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search
  ))
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(`Discard unsaved ${subject} and leave this page?`)) blocker.proceed()
    else blocker.reset()
  }, [blocker, subject])
  useEffect(() => {
    if (!dirty) return
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', unload)
    return () => {
      window.removeEventListener('beforeunload', unload)
    }
  }, [dirty, subject])
}
