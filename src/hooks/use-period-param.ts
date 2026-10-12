import { useSearchParams } from 'react-router'
import { currentPeriod, isValidPeriod } from '@/lib/dates'

/** The selected billing month, kept in the URL (?period=yyyy-MM-01) so it survives reloads and links. */
export function usePeriodParam(): [string, (period: string) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('period')
  const period = isValidPeriod(raw) ? raw : currentPeriod()
  const setPeriod = (next: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.set('period', next)
        return p
      },
      { replace: true },
    )
  return [period, setPeriod]
}
