export type ServerTimingEntry = readonly [name: string, duration: number];

export async function timeServerTask<T>(
  entries: ServerTimingEntry[],
  name: string,
  task: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await task();
  } finally {
    entries.push([name, performance.now() - startedAt]);
  }
}

export function recordServerTiming(entries: ServerTimingEntry[], name: string, startedAt: number) {
  entries.push([name, performance.now() - startedAt]);
}

export function formatServerTiming(entries: ServerTimingEntry[]) {
  return entries.map(([name, duration]) => `${name};dur=${Math.max(0, duration).toFixed(1)}`).join(", ");
}
