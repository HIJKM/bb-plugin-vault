import { useEffect, useState } from "react";

import { readAgentSnapshot, subscribeAgentEntry, type AgentSnapshot } from "@/lib/agent-entry";

export function useAgentSnapshot(): AgentSnapshot {
  const [snapshot, setSnapshot] = useState(readAgentSnapshot);
  useEffect(() => subscribeAgentEntry(() => setSnapshot(readAgentSnapshot())), []);
  return snapshot;
}
