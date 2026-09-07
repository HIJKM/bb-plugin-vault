import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  frontmatterFieldLabel,
  itemLabel,
  type FrontmatterField,
  type FrontmatterItem,
} from "@/lib/frontmatter";
import { isRawHash, rawArchiveLabel } from "@/lib/raw-archive";
import { cn } from "@/lib/utils";
import { resolveWikiTarget, type WikiEntry } from "@/lib/wiki-links";

const OPEN_KEY = "vault-frontmatter-open";
const PREVIEW_LIMIT = 3;

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function storeOpen(open: boolean): void {
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
      <div className="text-xs font-medium text-muted-foreground">{frontmatterFieldLabel(field.key)}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-3">
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
            className="text-xs font-normal text-muted-foreground hover:text-foreground"
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
  const textClass = tags ? "text-sm font-normal" : "text-xs font-normal";
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
  const [open, setOpen] = useState(readOpen);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    setExpanded(new Set());
  }, [docPath]);

  if (fields.length === 0) return null;

  return (
    <div className="mt-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-1.5 text-xs text-muted-foreground"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          storeOpen(next);
        }}
      >
        <Icon name={open ? "ChevronDown" : "ChevronRight"} className="size-3.5" />
        속성
      </Button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-2 pt-1">
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
        </div>
      </div>
    </div>
  );
}
