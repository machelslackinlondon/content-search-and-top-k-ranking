export function normalizeTerm(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en');
}

export function tokenize(value: string): string[] {
  return normalizeTerm(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

export function countTerms(tokens: readonly string[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }
  return frequencies;
}
