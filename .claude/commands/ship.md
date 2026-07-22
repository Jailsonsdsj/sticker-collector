---
description: Verify, commit and open a PR for the current backlog task
---

1. Run `pnpm typecheck && pnpm lint && pnpm test`. Fix anything that fails.
2. Run `pnpm --filter web build` and `npx wrangler deploy --dry-run`.
3. Re-read the "Done when" column for this task in docs/backlog.md and confirm
   each criterion is actually met. Say which, one line each.
4. Write a conventional-commit message derived from the diff.
5. Update the progress table at the bottom of docs/backlog.md.
6. Open a PR whose body links the backlog task ID and lists the Done-when checks.
