import { useRef } from "react";
import { useBbNavigate, type PluginMessageDirectiveProps } from "@get-bb/plugin-sdk/app";

import { applyAgentEntry } from "@/lib/agent-entry";
import {
  THREAD_VAULT_ACTION_ID,
  fileTitle,
  parseVaultFileAttributes,
  parseVaultGraphAttributes,
  type PanelOpenRequest,
} from "@/lib/panel-open";

function OpenChip({
  label,
  request,
}: {
  label: string;
  request: PanelOpenRequest;
}) {
  const navigate = useBbNavigate();
  const requestRef = useRef(request);
  requestRef.current = request;
  function enter() {
    applyAgentEntry(requestRef.current);
    navigate.openThreadPanel({ actionId: THREAD_VAULT_ACTION_ID, title: "Vault" });
  }
  return (
    <button
      type="button"
      className="inline-flex max-w-full items-center rounded-md border border-border bg-card px-1.5 py-0.5 align-middle text-[13px] text-foreground hover:bg-accent"
      onClick={enter}
    >
      {label}
    </button>
  );
}

export function VaultFileDirective({ attributes, source, message }: PluginMessageDirectiveProps) {
  const target = parseVaultFileAttributes(attributes);
  if (target === null) return <span>{source}</span>;
  const request: PanelOpenRequest = {
    threadId: message.threadId,
    action: "file",
    vaultId: target.vaultId,
    path: target.path,
    title: fileTitle(target.path),
    nonce: `directive:${message.id}`,
  };
  return (
    <OpenChip label={request.title} request={request} />
  );
}

export function VaultGraphDirective({ attributes, source, message }: PluginMessageDirectiveProps) {
  const target = parseVaultGraphAttributes(attributes);
  if (target === null) return <span>{source}</span>;
  const title = target.paths.length === 0 ? "3D 그래프" : `그래프 · ${target.paths.length}`;
  const request: PanelOpenRequest = {
    threadId: message.threadId,
    action: "graph",
    vaultId: target.vaultId,
    paths: target.paths,
    title,
    nonce: `directive:${message.id}`,
  };
  return (
    <OpenChip label={title} request={request} />
  );
}
