import type { PluginLifecycleRegistration } from "@getpaseo/plugin/server";
import { type Rule, commandOf, findRule, isDestructive } from "../shared/rules.ts";
import { workspaceIndex } from "../shared/inbox.ts";

// Answers tool permission requests that match a saved rule. Anything else stays pending for the Inbox screen.
export function registerAutoAnswer(
  server: PluginLifecycleRegistration,
  readRules: () => Promise<readonly Rule[]>,
) {
  server.on("agent.permission_requested", async ({ agent, request }, { paseo }) => {
    if (request.kind !== "tool" || !agent.workspaceId) return;
    const command = commandOf(request.input);
    if (!command) return;
    try {
      const projectId = (await workspaceIndex(paseo)).get(agent.workspaceId)?.projectId;
      const rule = projectId ? findRule(await readRules(), projectId, command) : undefined;
      // A rule can't allow a destructive command, even if one was saved by hand.
      if (!rule || (rule.action === "allow" && isDestructive(command))) return;
      await paseo.agents.ref(agent.id).respondToPermission({
        requestId: request.id,
        response:
          rule.action === "allow"
            ? { behavior: "allow" }
            : { behavior: "deny", message: "Denied by an Inbox rule" },
      });
    } catch (error) {
      console.error("[paseo-inbox] auto-answer failed", error);
    }
  });
}
