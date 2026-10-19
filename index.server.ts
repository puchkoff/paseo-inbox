import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerAutoAnswer } from "./server/auto.ts";
import { answerRequest, listInbox } from "./server/inbox.ts";
import { answerRequest as answerContract, listInbox as listContract } from "./shared/rpc.ts";
import { rulesSettings } from "./shared/rules.ts";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(rulesSettings);
  server.handle(listContract, listInbox);
  server.handle(answerContract, answerRequest);
  registerAutoAnswer(server, async () => {
    const state = await settings.read();
    return state.status === "ready" ? state.values.rules : [];
  });
  return () => {};
}
