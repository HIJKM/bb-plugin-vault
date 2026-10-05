import { useCallback, useEffect, useRef } from "react";
import { useBbContext, useBbNavigate, useRealtime } from "@get-bb/plugin-sdk/app";

import { applyAgentEntry } from "@/lib/agent-entry";
import {
  PANEL_OPEN_CHANNEL,
  THREAD_VAULT_ACTION_ID,
  parsePanelOpenRequest,
  type PanelOpenRequest,
} from "@/lib/panel-open";

export function PanelOpenBridge() {
  const { threadId } = useBbContext();
  const navigate = useBbNavigate();
  const threadIdRef = useRef(threadId);
  const navigateRef = useRef(navigate);
  const pendingRef = useRef<PanelOpenRequest | null>(null);
  threadIdRef.current = threadId;
  navigateRef.current = navigate;

  const tryOpen = useCallback((request: PanelOpenRequest) => {
    applyAgentEntry(request);
    const opened = navigateRef.current.openThreadPanel({
      actionId: THREAD_VAULT_ACTION_ID,
      title: "Vault",
    });
    if (!opened) {
      pendingRef.current = request;
      return;
    }
    if (pendingRef.current?.nonce === request.nonce) pendingRef.current = null;
  }, []);

  useRealtime(PANEL_OPEN_CHANNEL, (payload) => {
    const request = parsePanelOpenRequest(payload);
    if (request === null) return;
    const current = threadIdRef.current;
    if (current !== null && request.threadId !== current) {
      pendingRef.current = request;
      return;
    }
    tryOpen(request);
  });

  useEffect(() => {
    const request = pendingRef.current;
    if (request === null) return;
    if (threadId !== null && request.threadId !== threadId) return;
    tryOpen(request);
  }, [threadId, tryOpen]);

  return null;
}
