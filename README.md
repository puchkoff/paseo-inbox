# Inbox — a Paseo plugin

![Inbox: Paseo plugin screen (illustration)](docs/hero.svg)

One screen for everything waiting on you, with auto-rules for permission requests.

Collects tool permission requests, plans and questions from agents, and agents that finished or failed. Answer in one press or open the agent. A Running section below the queue lists working agents. Polls every couple of seconds; the sidebar row shows the count.

**Auto-rules:** ticking *Always allow this exact command* saves a per-project rule that matches the whole command string exactly. Destructive commands (`rm -rf`, `sudo`, `git push --force`, `terraform apply`, …) are never auto-allowed; that check is a pattern list, not a shell parser. Rules are stored in the plugin's host settings, shared by every client of that daemon. Plugins are unsandboxed, so review the Auto-rules tab now and then.

## Install

Requires Paseo 0.11.4 or later.

```bash
paseo plugin install https://github.com/puchkoff/paseo-inbox
```

Or from a local clone: `paseo plugin install ./paseo-inbox`. Check with `paseo plugin ls`.

## Develop

```bash
npm install
npm run typecheck
npm test
```

The in-app description shown by Paseo lives in [OVERVIEW.md](OVERVIEW.md).
