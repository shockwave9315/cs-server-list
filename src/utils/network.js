export async function mapLimit(items, limit, mapper, options = {}) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('mapLimit limit must be a positive integer');
  }

  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;

      try {
        results[current] = await mapper(items[current], current);
      } catch (error) {
        if (options.onItemError) {
          options.onItemError(error, items[current], current);
        }
        results[current] = null;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
