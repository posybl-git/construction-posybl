/**
 * Helper to fetch all rows across multiple pages from Supabase PostgREST,
 * overcoming the default 1,000-row single-response limit.
 */
export async function fetchAllPages<T = any>(
  fetchChunk: (from: number, to: number) => PromiseLike<{ data: any; error: any }> | Promise<{ data: any; error: any }>,
  chunkSize = 1000
): Promise<T[]> {
  let allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const to = from + chunkSize - 1;
    const res = await fetchChunk(from, to);
    const data = res.data;
    const error = res.error;

    if (error || !data || !Array.isArray(data) || data.length === 0) {
      if (error) {
        console.error('Error fetching chunk:', error);
      }
      break;
    }

    allData = allData.concat(data as T[]);

    if (data.length < chunkSize) {
      hasMore = false;
    } else {
      from += chunkSize;
    }
  }

  return allData;
}
