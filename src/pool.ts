/**
 * Run `worker` over `items` with at most `concurrency` tasks in flight.
 *
 * Results keep the input order regardless of completion order. The pool is a
 * fixed set of runners pulling from a shared cursor, which is enough for a
 * local batch job and keeps the implementation auditable.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  const runners = Math.max(1, Math.min(Math.floor(concurrency), items.length));
  let cursor = 0;

  const run = async (): Promise<void> => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;

      // The bounds check above guarantees the element exists.
      const item = items[index] as T;
      results[index] = await worker(item, index);
    }
  };

  await Promise.all(Array.from({ length: runners }, run));
  return results;
}
