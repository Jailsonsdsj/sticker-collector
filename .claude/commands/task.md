---
description: Start a backlog task with exactly the right context
---

Read the row for task $1 in docs/backlog.md.

Then read ONLY the files named in that row's `Load` column, plus CLAUDE.md.
Do NOT read docs/prd/README.md, other PRD sections, or the full architecture
document unless the Load column names them explicitly.

Then:
1. Restate the task and its "Done when" criteria in three lines.
2. Produce a plan: files to create, files to edit, tests to write.
3. Stop and wait for approval before writing any code.

If the task looks like more than ~90 minutes of work, say so and propose a
split instead of starting.
