import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

import {
  MAX_HIGHLIGHT_PATHS,
  PANEL_OPEN_CHANNEL,
  openVaultFile,
  openVaultGraph,
  type OpenDeps,
  type PanelOpenRequest,
} from "./panel-open.ts";

const fileParameters = z
  .object({
    vaultId: z.string().min(1).optional(),
    path: z.string().min(1),
  })
  .strict();

const graphParameters = z
  .object({
    vaultId: z.string().min(1).optional(),
    paths: z.array(z.string().min(1)).max(MAX_HIGHLIGHT_PATHS).optional(),
  })
  .strict();

export function registerVaultAgentTools(
  bb: BbPluginApi,
  deps: Pick<OpenDeps, "loadVaults" | "listEntries">,
): void {
  const openDeps = (): OpenDeps => ({
    loadVaults: deps.loadVaults,
    listEntries: deps.listEntries,
    publish: (payload: PanelOpenRequest) => {
      bb.realtime.publish(PANEL_OPEN_CHANNEL, payload);
    },
  });

  bb.agents.registerTool({
    name: "vault_open_file",
    description: "Open one vault file in the thread side panel Vault. Do not navigate to the plugin page.",
    instructions:
      "이 스레드 오른쪽 패널의 Vault에서 파일을 연다. 플러그인 전체 페이지로 이동하지 않는다. path는 볼트 안 상대 경로다. 볼트가 둘 이상이면 vaultId가 필요하다. 성공하면 반환된 ::vault-file 지시문 한 줄을 답변에 그대로 포함한다.",
    presentation: {
      label: {
        pending: "볼트 파일을 여는 중",
        completed: "볼트 파일을 열었습니다",
      },
    },
    parameters: fileParameters,
    async execute(params, ctx) {
      return openVaultFile(params, { threadId: ctx.threadId }, openDeps());
    },
  });

  bb.agents.registerTool({
    name: "vault_open_graph",
    description:
      "Open the thread side panel Vault graph. Marks are bright red lights with no connecting lines. A later call on the same vault adds lights and does not reload the graph. Do not navigate to the plugin page.",
    instructions:
      "이 스레드 오른쪽 패널의 Vault에서 3D 그래프를 연다. 플러그인 전체 페이지로 이동하지 않는다. paths의 노트는 연결선 없이 밝은 붉은색으로 켜진다. 같은 볼트에서 다시 호출하면 그래프를 다시 그리지 않고 그 노드만 추가로 켠다. paths를 생략하면 새 불 없이 그래프만 연다. 성공하면 반환된 ::vault-graph 지시문 한 줄을 답변에 그대로 포함한다.",
    presentation: {
      label: {
        pending: "볼트 그래프를 여는 중",
        completed: "볼트 그래프를 열었습니다",
      },
    },
    parameters: graphParameters,
    async execute(params, ctx) {
      return openVaultGraph(params, { threadId: ctx.threadId }, openDeps());
    },
  });
}
