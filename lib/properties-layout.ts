/** Document column width, excluding the file list, at or under which properties rise from the bottom. */
export const PROPERTIES_SHEET_BELOW_PX = 640;

export function propertiesUseSheet(contentWidth: number): boolean {
  if (!Number.isFinite(contentWidth) || contentWidth <= 0) return false;
  return contentWidth <= PROPERTIES_SHEET_BELOW_PX;
}
