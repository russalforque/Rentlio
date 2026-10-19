/** Reset private client state before publishing a changed session. Token refresh
 * for the same identity must preserve the current screen and its queries. */
export function createSessionHandler<T extends { user: { id: string } }>(
  clearPrivateState: () => void,
  setSession: (session: T | null) => void,
) {
  let previousUserId: string | null | undefined
  return (_event: string, next: T | null) => {
    const nextUserId = next?.user.id ?? null
    if (nextUserId !== previousUserId) {
      clearPrivateState()
      previousUserId = nextUserId
    }
    setSession(next)
  }
}
