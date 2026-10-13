import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAvatarUrl } from './profile-photo'

interface UserAvatarProps {
  path: string | null | undefined
  name: string | null | undefined
  email?: string | null
  className?: string
  fallbackClassName?: string
}

/** Profile photo, or the person's initials while it loads or when there is none. */
export function UserAvatar({ path, name, email, className, fallbackClassName }: UserAvatarProps) {
  const { data: url } = useAvatarUrl(path)
  return (
    <Avatar className={className}>
      {url && <AvatarImage src={url} alt="" className="object-cover" />}
      <AvatarFallback className={cn('font-semibold', fallbackClassName)}>
        {initials(name, email?.[0]?.toUpperCase())}
      </AvatarFallback>
    </Avatar>
  )
}
