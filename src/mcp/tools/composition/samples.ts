export function takeSample<T>(items: readonly T[], limit: number): T[] {
  return items.slice(0, limit);
}
