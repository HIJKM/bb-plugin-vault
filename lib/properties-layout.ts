/** The rising sheet is a phone. A narrow fine pointer stays the desktop dock. */
export function propertiesUseSheet(input: {
  compact: boolean;
  coarsePointer: boolean;
}): boolean {
  return input.compact && input.coarsePointer;
}
