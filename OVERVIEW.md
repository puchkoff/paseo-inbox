Inbox puts everything that is waiting on you into one screen: tool permission requests, plans and questions from agents, and agents that finished or failed. Answer a request in one press, or open the agent.

It polls the daemon every couple of seconds, so a request shows up as soon as an agent asks. The sidebar row shows how many items are waiting.

Ticking "Always allow this exact command" on a tool request saves an auto-rule for that project. Rules match the whole command string exactly, so `git status` never covers `git status && something else`. Destructive commands (`rm -rf`, `sudo`, `git push --force`, `terraform apply` and similar) are never auto-allowed and cannot be turned into an allow rule from the screen. The destructive check is a pattern list, not a shell parser.

Rules are stored in the plugin's host settings and shared by every client of that daemon. Requests that no rule matches stay pending for you. Plugins are unsandboxed: auto-rules answer on the daemon host without asking, so review the Auto-rules tab now and then.

Requires Paseo 0.11.4 or later. Finished and error items clear when you open the agent.
