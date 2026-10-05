import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";

import {
  frontmatterFieldLabel,
  itemLabel,
  type FrontmatterField,
  type FrontmatterItem,
} from "@/lib/frontmatter";
import { isRawHash, rawArchiveLabel } from "@/lib/raw-archive";
import {
  COARSE_POINTER_TEXT_BASE_CLASS,
  COARSE_POINTER_TEXT_SM_CLASS,
} from "@/components/ui/coarse-pointer-sizing";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { resolveWikiTarget, type WikiEntry } from "@/lib/wiki-links";

const OPEN_KEY = "vault-frontmatter-open";
const PREVIEW_LIMIT = 3;

export function readFrontmatterOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function storeFrontmatterOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
}

function FieldValues({
  field,
  expanded,
  index,
  vaultId,
  rawByHash,
  onOpen,
  onToggle,
}: {
  field: FrontmatterField;
  expanded: boolean;
  index: readonly WikiEntry[];
  vaultId: string | null;
  rawByHash: Readonly<Record<string, string>>;
  onOpen: (vaultId: string, path: string) => void;
  onToggle: () => void;
}) {
  const overflow = field.items.length > PREVIEW_LIMIT;
  const visible = expanded || !overflow ? field.items : field.items.slice(0, PREVIEW_LIMIT);
  const tags = field.key === "tags";
  const raw = field.key === "raw";
  return (
    <div>
      <div className={cn("font-medium text-muted-foreground", COARSE_POINTER_TEXT_SM_CLASS)}>{frontmatterFieldLabel(field.key)}</div>
      <div className="mt-1 flex flex-col items-start gap-1">
        {visible.map((item, offset) => (
          <FieldValue
            key={`${field.key}-${offset}-${itemLabel(item)}`}
            item={item}
            tags={tags}
            raw={raw}
            index={index}
            vaultId={vaultId}
            rawByHash={rawByHash}
            onOpen={onOpen}
          />
        ))}
        {overflow ? (
          <button
            type="button"
            className={cn("font-normal text-muted-foreground hover:text-foreground", COARSE_POINTER_TEXT_SM_CLASS)}
            onClick={onToggle}
          >
            {expanded ? "접기" : "… 펼치기"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function FieldValue({
  item,
  tags,
  raw,
  index,
  vaultId,
  rawByHash,
  onOpen,
}: {
  item: FrontmatterItem;
  tags: boolean;
  raw: boolean;
  index: readonly WikiEntry[];
  vaultId: string | null;
  rawByHash: Readonly<Record<string, string>>;
  onOpen: (vaultId: string, path: string) => void;
}) {
  const text = itemLabel(item);
  const textClass = tags
    ? cn("font-normal", COARSE_POINTER_TEXT_BASE_CLASS)
    : cn("font-normal", COARSE_POINTER_TEXT_SM_CLASS);
  if (item.kind === "wiki") {
    const path = resolveWikiTarget(item.target, index);
    if (path !== null && vaultId !== null) {
      return (
        <button
          type="button"
          className={cn("max-w-full truncate text-left text-primary hover:underline", textClass)}
          onClick={() => onOpen(vaultId, path)}
        >
          {text}
        </button>
      );
    }
  }
  if (raw && item.kind === "text" && isRawHash(item.text) && vaultId !== null) {
    const path = rawByHash[item.text.trim().toLowerCase()];
    if (path !== undefined) {
      const label = rawArchiveLabel(path);
      return (
        <button
          type="button"
          className={cn("max-w-full truncate text-left text-primary hover:underline", textClass)}
          title={item.text}
          onClick={() => onOpen(vaultId, path)}
        >
          {label}
        </button>
      );
    }
  }
  return (
    <span
      className={cn(
        "max-w-full",
        tags ? "rounded-md bg-muted px-1.5 py-0.5 text-foreground" : "break-all text-foreground/80",
        textClass,
      )}
      title={text}
    >
      {text}
    </span>
  );
}

export function PropertiesSheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const [risen, setRisen] = useState(false);
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setRisen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      data-testid="vault-properties-sheet"
      role="region"
      aria-label="속성"
      className={cn(
        "absolute inset-x-0 bottom-0 z-20 flex max-h-[45%] flex-col rounded-t-2xl border border-border bg-background shadow-[0_-12px_32px_rgb(0_0_0/0.16)] dark:shadow-[0_-12px_32px_rgb(0_0_0/0.55)]",
        "transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:translate-y-0 motion-reduce:transition-none",
        risen ? "translate-y-0" : "translate-y-full",
      )}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border pr-1 pl-3 max-md:pointer-coarse:h-12">
        <span className={cn("min-w-0 flex-1 font-medium", COARSE_POINTER_TEXT_BASE_CLASS)}>속성</span>
        <button
          type="button"
          aria-label="닫기"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover hover:text-foreground max-md:pointer-coarse:size-10"
          onClick={onClose}
        >
          <Icon name="X" className="size-4 max-md:pointer-coarse:size-5" />
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto">{children}</div>
    </div>
  );
}

export function FrontmatterPanel({
  fields,
  docPath,
  index,
  vaultId,
  rawByHash,
  onOpen,
}: {
  fields: readonly FrontmatterField[];
  docPath: string;
  index: readonly WikiEntry[];
  vaultId: string | null;
  rawByHash: Readonly<Record<string, string>>;
  onOpen: (vaultId: string, path: string) => void;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    setExpanded(new Set());
  }, [docPath]);

  if (fields.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 px-3 py-3" aria-label="속성">
      {fields.map((field) => (
        <FieldValues
          key={field.key}
          field={field}
          expanded={expanded.has(field.key)}
          index={index}
          vaultId={vaultId}
          rawByHash={rawByHash}
          onOpen={onOpen}
          onToggle={() => {
            setExpanded((current) => {
              const next = new Set(current);
              if (next.has(field.key)) next.delete(field.key);
              else next.add(field.key);
              return next;
            });
          }}
        />
      ))}
    </div>
  );
}
