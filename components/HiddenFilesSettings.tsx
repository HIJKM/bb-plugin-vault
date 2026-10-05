import { useState, type FormEvent } from "react";
import type { PluginSettingsSectionProps } from "@get-bb/plugin-sdk/app";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { acceptHiddenName } from "@/lib/hidden-files";
import { addHiddenName, removeHiddenName, setShowHidden, useHiddenPrefs } from "@/lib/hidden-prefs";

export function HiddenFilesSettings(_props: PluginSettingsSectionProps) {
  const { showHidden, names } = useHiddenPrefs();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.trim() === "") return;
    if (acceptHiddenName(draft) === null) {
      setError("경로는 넣지 않습니다. 이름만 넣습니다.");
      return;
    }
    if (!addHiddenName(draft)) {
      setError("이미 있는 이름입니다.");
      return;
    }
    setDraft("");
    setError("");
  }

  return (
    <div className="w-full space-y-3" data-testid="vault-hidden-settings">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2"
        aria-pressed={showHidden}
        aria-label="숨김 파일 표시"
        onClick={() => setShowHidden(!showHidden)}
      >
        <Icon name={showHidden ? "Eye" : "EyeOff"} className="size-4" aria-hidden="true" />
        숨김 파일 표시
      </Button>
      <form className="flex flex-wrap items-center gap-2" onSubmit={onSubmit}>
        <Input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error !== "") setError("");
          }}
          placeholder="파일 또는 폴더 이름"
          aria-label="숨길 이름"
          className="min-w-0 flex-1 font-mono"
        />
        <Button type="submit" size="sm" disabled={draft.trim() === ""}>
          추가
        </Button>
      </form>
      {error !== "" ? <p className="text-sm text-destructive">{error}</p> : null}
      {names.length > 0 ? (
        <ul className="space-y-1">
          {names.map((name) => (
            <li
              key={name}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-sm">{name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={`${name} 제거`}
                onClick={() => removeHiddenName(name)}
              >
                <Icon name="Trash2" className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
