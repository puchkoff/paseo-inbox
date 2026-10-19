import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const inboxItem = z.object({
  key: z.string(),
  agentId: z.string(),
  title: z.string(),
  provider: z.string(),
  projectId: z.string().nullable(),
  project: z.string(),
  workspace: z.string(),
  at: z.string().nullable(),
  reason: z.enum(["permission", "finished", "error"]),
  request: z
    .object({
      id: z.string(),
      kind: z.enum(["tool", "plan", "question", "mode", "other"]),
      title: z.string(),
      body: z.string(),
      command: z.string().nullable(),
      risky: z.boolean(),
      actions: z.array(
        z.object({ id: z.string(), label: z.string(), behavior: z.enum(["allow", "deny"]) }),
      ),
    })
    .nullable(),
});
export type InboxItem = z.infer<typeof inboxItem>;

export const listInbox = defineRpc({
  name: "inbox.list",
  input: z.object({}),
  output: z.object({ items: z.array(inboxItem) }),
});

export const answerRequest = defineRpc({
  name: "inbox.answer",
  input: z.object({
    agentId: z.string(),
    requestId: z.string(),
    behavior: z.enum(["allow", "deny"]),
    selectedActionId: z.string().optional(),
  }),
  output: z.object({ ok: z.boolean(), error: z.string().optional() }),
});
