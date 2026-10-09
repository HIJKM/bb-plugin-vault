export type QuerySpan = { text: string; match: boolean };

/** Contiguous, case-insensitive slices. The text keeps its original letters. */
export function queryBoldSpans(text: string, query: string): QuerySpan[] {
  const shown = text.normalize("NFC");
  const needle = query.trim().normalize("NFC").toLowerCase();
  if (needle === "") return [{ text: shown, match: false }];
  const haystack = shown.toLowerCase();
  const spans: QuerySpan[] = [];
  let cursor = 0;
  let index = haystack.indexOf(needle, cursor);
  while (index !== -1) {
    if (index > cursor) spans.push({ text: shown.slice(cursor, index), match: false });
    spans.push({ text: shown.slice(index, index + needle.length), match: true });
    cursor = index + needle.length;
    index = haystack.indexOf(needle, cursor);
  }
  if (spans.length === 0) return [{ text: shown, match: false }];
  if (cursor < shown.length) spans.push({ text: shown.slice(cursor), match: false });
  return spans;
}
