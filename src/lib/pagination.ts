interface Page<T> {
  data: T[] | null
  error: unknown
  count?: number | null
}

/** Fetch complete report/history results. Callers must provide a unique order
 * and request an exact count so a lower server row cap cannot truncate totals. */
export async function fetchAllRows<T>(fetchPage: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[]> {
  const rows: T[] = []
  const pageSize = 1000
  let expectedCount: number | null | undefined
  const seenIds = new Set<unknown>()
  for (;;) {
    const { data, error, count } = await fetchPage(rows.length, rows.length + pageSize - 1)
    if (error) throw error
    if (!data) throw new Error('The server did not return report data. Please try again.')
    if (expectedCount !== undefined && count !== expectedCount) {
      throw new Error('The report changed while loading. Please refresh and try again.')
    }
    expectedCount = count
    for (const row of data) {
      if (row && typeof row === 'object' && 'id' in row) {
        if (seenIds.has(row.id)) throw new Error('The report changed while loading. Please refresh and try again.')
        seenIds.add(row.id)
      }
    }
    rows.push(...data)
    if (count !== null && count !== undefined) {
      if (rows.length >= count) return rows
      if (data.length === 0) throw new Error('The report changed while loading. Please refresh and try again.')
    } else if (data.length < pageSize) return rows
  }
}
