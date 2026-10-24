import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ColorScheme = Exclude<Theme, 'system'>

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function readStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem('theme')
    return isTheme(saved) ? saved : 'light'
  } catch {
    return 'light'
  }
}

export const ThemeContext = createContext<{
  theme: Theme
  resolvedTheme: ColorScheme
  setTheme: (theme: string) => void
} | null>(null)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>')
  return context
}
