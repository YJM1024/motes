export type VersionDiffSummary = { added: number; removed: number } | { added: null; removed: null };

/** Exact line edit counts. Returns unavailable instead of guessing when work exceeds the budget. */
export function summarizeLineChanges(before: string, after: string, maxCells = 1_000_000): VersionDiffSummary {
  const lines = (value: string) => value.split(/\r?\n/);
  const a = lines(before), b = lines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const n = endA - start, m = endB - start;
  if (n * m > maxCells) return { added: null, removed: null };
  const row = new Uint32Array(m + 1);
  for (let i = 0; i < n; i++) {
    let diagonal = 0;
    for (let j = 0; j < m; j++) {
      const prior = row[j + 1];
      row[j + 1] = a[start + i] === b[start + j] ? diagonal + 1 : Math.max(row[j + 1], row[j]);
      diagonal = prior;
    }
  }
  const common = row[m];
  return { removed: n - common, added: m - common };
}
