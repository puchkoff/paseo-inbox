import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerAutoAnswer } from "./server/auto.ts";
import { rulesSettings } from "./shared/rules.ts";

// Listing and answering run in the client (see client/use-inbox.ts); the daemon only applies saved rules.
export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(rulesSettings);
  registerAutoAnswer(server, async () => {
    const state = await settings.read();
    return state.status === "ready" ? state.values.rules : [];
  });
  return () => {};
}
