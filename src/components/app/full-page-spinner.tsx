import { BrandMark } from '@/components/app/brand'

export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <BrandMark className="size-12 motion-safe:animate-pulse" />
        <span className="text-sm font-medium text-muted-foreground">{label}…</span>
      </div>
    </div>
  )
}
