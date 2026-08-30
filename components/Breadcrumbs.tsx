import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { vaultBreadcrumbs } from "@/lib/vault-paths";

export interface BreadcrumbsProps {
  folder: string;
  rootLabel: string;
  onNavigate: (path: string) => void;
  className?: string;
}

export function Breadcrumbs({ folder, rootLabel, onNavigate, className }: BreadcrumbsProps) {
  const crumbs = vaultBreadcrumbs(folder, rootLabel);

  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="vault-breadcrumbs"
      className={cn("flex w-max min-w-0 items-center gap-0.5", className)}
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <div key={`${crumb.isRoot ? "root" : crumb.path}`} className="flex shrink-0 items-center gap-0.5">
            {index === 0 ? null : (
              <Icon name="ChevronRight" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <button
              type="button"
              aria-current={isLast ? "page" : undefined}
              className={cn(
                "flex h-7 items-center gap-1 rounded-md px-1.5 whitespace-nowrap",
                "hover:bg-state-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isLast ? "text-sm font-semibold text-foreground" : "text-sm text-muted-foreground",
              )}
              onClick={() => {
                if (!isLast) onNavigate(crumb.path);
              }}
            >
              {crumb.isRoot ? <Icon name="FolderOpen" className="size-4 shrink-0" aria-hidden="true" /> : null}
              <span>{crumb.name}</span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
