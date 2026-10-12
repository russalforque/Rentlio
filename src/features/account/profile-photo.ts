import { useMutation, useQuery } from '@tanstack/react-query'
import { useAuth, useProfile } from '@/hooks/use-auth'
import { STORAGE_BUCKETS, supabase } from '@/lib/supabase'

const PHOTO_SIZE = 512
const SOURCE_MAX_BYTES = 15 * 1024 * 1024
const SIGNED_URL_SECONDS = 60 * 60

/** Signed URL for a private profile photo; reused until shortly before it expires. */
export function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['avatar', path ?? ''],
    enabled: !!path,
    staleTime: (SIGNED_URL_SECONDS - 5 * 60) * 1000,
    gcTime: (SIGNED_URL_SECONDS - 5 * 60) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.avatars)
        .createSignedUrl(path as string, SIGNED_URL_SECONDS)
      if (error) throw error
      return data.signedUrl
    },
  })
}

/** Center-crops to a square and scales down, so uploads are small and consistent. */
async function toSquareJpeg(file: File): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('That file could not be read as an image. Use a JPG, PNG or WebP photo.')
  }
  const side = Math.min(bitmap.width, bitmap.height)
  const size = Math.min(side, PHOTO_SIZE)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not process the photo.')
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error('Your browser could not process the photo.')
  return blob
}

async function setAvatarPath(userId: string, path: string | null) {
  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId)
  if (error) throw error
}

async function removeFile(path: string) {
  // Best effort: an orphaned file is harmless and only visible to its owner and the landlord.
  await supabase.storage.from(STORAGE_BUCKETS.avatars).remove([path])
}

export function useUploadAvatar() {
  const profile = useProfile()
  const { refreshProfile } = useAuth()
  return useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
      if (file.size > SOURCE_MAX_BYTES) throw new Error('That photo is too large. Choose one under 15 MB.')
      const photo = await toSquareJpeg(file)
      const path = `${profile.id}/${Date.now()}.jpg`
      const { error } = await supabase.storage
        .from(STORAGE_BUCKETS.avatars)
        .upload(path, photo, { contentType: 'image/jpeg' })
      if (error) throw error
      try {
        await setAvatarPath(profile.id, path)
      } catch (err) {
        await removeFile(path)
        throw err
      }
      if (profile.avatar_path) await removeFile(profile.avatar_path)
    },
    onSuccess: () => refreshProfile(),
  })
}

export function useRemoveAvatar() {
  const profile = useProfile()
  const { refreshProfile } = useAuth()
  return useMutation({
    mutationFn: async () => {
      if (!profile.avatar_path) return
      await setAvatarPath(profile.id, null)
      await removeFile(profile.avatar_path)
    },
    onSuccess: () => refreshProfile(),
  })
}
