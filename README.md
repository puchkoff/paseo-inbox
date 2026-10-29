# Inbox — a Paseo plugin

![Inbox: Paseo plugin screen (illustration)](docs/hero.svg)

One screen for everything waiting on you, what is running, and what just finished.

Collects tool permission requests, plans and questions from agents, and agents that failed. Answer in one press or open the agent. Below, Running lists working agents and Done lists agents that finished in the last 24 hours. Polls every couple of seconds; the sidebar row shows the count.

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
