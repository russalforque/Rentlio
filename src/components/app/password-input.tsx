import { ArrowBigUp, Eye, EyeOff } from 'lucide-react'
import { useState, type ComponentProps, type KeyboardEvent } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function PasswordInput({ className, onKeyUp, onKeyDown, onBlur, ...props }: Omit<ComponentProps<typeof Input>, 'type'>) {
  const [visible, setVisible] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const track = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)

  return (
    <div>
      <div className="relative">
        <Input
          {...props}
          type={visible ? 'text' : 'password'}
          className={cn('pr-11', className)}
          onKeyUp={(e) => (track(e), onKeyUp?.(e))}
          onKeyDown={(e) => (track(e), onKeyDown?.(e))}
          onBlur={(e) => (setCapsLock(false), onBlur?.(e))}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {capsLock && (
        <p role="status" className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-warning-foreground">
          <ArrowBigUp className="size-4" aria-hidden /> Caps Lock is on
        </p>
      )}
    </div>
  )
}
