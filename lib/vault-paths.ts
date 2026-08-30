export type VaultCrumb = {
  name: string;
  path: string;
  isRoot: boolean;
};

/** Root-first crumbs for the folder currently listed in a vault. */
export function vaultBreadcrumbs(folder: string, rootLabel: string): VaultCrumb[] {
  const crumbs: VaultCrumb[] = [{ name: rootLabel, path: "", isRoot: true }];
  if (folder === "") return crumbs;
  let current = "";
  for (const segment of folder.split("/")) {
    if (segment === "") continue;
    current = current === "" ? segment : `${current}/${segment}`;
    crumbs.push({ name: segment, path: current, isRoot: false });
  }
  return crumbs;
}
