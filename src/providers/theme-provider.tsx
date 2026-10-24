import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { isTheme, readStoredTheme, ThemeContext, type ColorScheme } from './theme-context'

const SYSTEM_DARK = '(prefers-color-scheme: dark)'

/** Client-only theme state: no server hydration script is rendered into React. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState(readStoredTheme)
  const [systemTheme, setSystemTheme] = useState<ColorScheme>(() => window.matchMedia(SYSTEM_DARK).matches ? 'dark' : 'light')
  const resolvedTheme = theme === 'system' ? systemTheme : theme

  useLayoutEffect(() => {
    // Apply before paint and prevent control transitions during a theme change.
    const style = document.createElement('style')
    style.textContent = '*,*::before,*::after{transition:none!important}'
    document.head.appendChild(style)
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)
    root.style.colorScheme = resolvedTheme
    void window.getComputedStyle(root).color
    const frame = window.requestAnimationFrame(() => style.remove())
    return () => {
      window.cancelAnimationFrame(frame)
      style.remove()
    }
  }, [resolvedTheme])

  useEffect(() => {
    const media = window.matchMedia(SYSTEM_DARK)
    const onSystemChange = () => setSystemTheme(media.matches ? 'dark' : 'light')
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'theme' || event.key === null) setThemeState(readStoredTheme())
    }
    media.addEventListener('change', onSystemChange)
    window.addEventListener('storage', onStorage)
    return () => {
      media.removeEventListener('change', onSystemChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const setTheme = useCallback((value: string) => {
    if (!isTheme(value)) return
    setThemeState(value)
    try {
      localStorage.setItem('theme', value)
    } catch {
      // The selected theme still works when browser storage is unavailable.
    }
  }, [])

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
