/** Extra scrollable space after the last line of a document. */
export function DocumentEndSpace() {
  return (
    <div
      aria-hidden="true"
      data-testid="vault-doc-end-space"
      className="pointer-events-none h-24 w-full shrink-0 sm:h-28"
    />
  );
}
