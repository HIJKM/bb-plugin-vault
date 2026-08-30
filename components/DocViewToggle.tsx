import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type DocViewMode = "source" | "preview";

export function DocViewToggle({
  mode,
  onChange,
}: {
  mode: DocViewMode;
  onChange: (mode: DocViewMode) => void;
}) {
  const options: { mode: DocViewMode; label: string; icon: IconName }[] = [
    { mode: "source", label: "원문", icon: "Code" },
    { mode: "preview", label: "미리보기", icon: "Eye" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="보기"
      className="inline-flex shrink-0 rounded-md bg-muted p-0.5"
      data-testid="vault-doc-mode"
    >
      {options.map((option) => {
        const selected = mode === option.mode;
        return (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            data-testid={`vault-doc-mode-${option.mode}`}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-[6px]",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onChange(option.mode)}
          >
            <Icon name={option.icon} className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
