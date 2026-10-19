import { cn } from '@/lib/utils'
import './tenant-illustration.css'

type TenantIllustrationProps = {
  src: string
  width: number
  height: number
  size?: 'thumbnail' | 'compact' | 'empty'
  loading?: 'eager' | 'lazy'
  className?: string
} & ({ decorative: true; alt?: never } | { decorative?: false; alt: string })

/** Import assets at the call site so each route loads only its own artwork. */
export function TenantIllustration({
  src, width, height, size = 'empty', loading = 'lazy', className, decorative, alt,
}: TenantIllustrationProps) {
  return (
    <img
      src={src}
      width={width}
      height={height}
      alt={decorative ? '' : alt}
      aria-hidden={decorative || undefined}
      loading={loading}
      decoding="async"
      data-size={size}
      className={cn('tenant-illustration', className)}
    />
  )
}
