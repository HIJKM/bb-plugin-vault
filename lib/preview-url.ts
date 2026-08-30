export function joinPreviewUrl(baseUrl: string, relative: string): string {
  const base = baseUrl.replace(/\/+$/u, "");
  const rest = relative
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return rest === "" ? base : `${base}/${rest}`;
}
