# Working the Backlog in Claude Code — Token Strategy

Target repo path: `docs/claude-code-workflow.md`

You asked for fewer tokens without giving up model quality. The mechanism is not shorter prompts. It's **making sure the model never reads anything it doesn't need for the task in front of it.**

A rough sense of where tokens actually go in an agentic build:

| | Share of spend |
|---|---|
| Files the agent reads to orient itself | ~50% |
| Rework caused by missing or stale context | ~25% |
| The actual code being written | ~15% |
| Your prompts | ~5% |

Your prompts are noise in that budget. Optimising them is optimising the wrong thing. Everything below attacks the first two rows.

---

## 1. The rule of one

**One backlog task = one session = one branch = one PR = one `/clear`.**

Context is not free and it does not decay gracefully. A session that has been running for three tasks is carrying two tasks' worth of dead file contents into every single turn, and it's paying for them again on every message. Worse, it starts confusing the previous task's patterns with the current one's.

Never let a session roll into the next task. Finish, merge, `/clear`, start clean.

---

## 2. Split the spec — this is the single biggest win

Right now `Colecionador_de_Figurinhas.md` is one 500-line file. If it stays that way, every task that needs the album rules also loads the reports section, the task rules, the data model, and the whole services chapter. Fifty tasks × the entire spec is an enormous amount of nothing.

**First action, before any code:** split it into `docs/prd/`, one file per section, exactly as the source document is already structured:

```
00-flow.md  01-coins.md  02-tasks.md  03-epics.md  04-albums.md
05-stickers.md  06-export.md  07-services.md  08-reports.md  09-data-model.md
```

Nothing is rewritten — it's a `split`, not an edit. Now the `Load` column in the backlog is real: task `A-07` reads `04-albums.md` and nothing else, and pays for ~90 lines instead of ~500. Across the build that's roughly an 80% cut in specification tokens, for twenty minutes of work.

Keep the original as `docs/prd/README.md` with a link table, so nothing is lost.

The same logic drives `docs/design-system.md` (task `D-05`). After Phase 1, the agent reads a 60-line component inventory instead of the design bundle. **Build indexes, then read the indexes.**

---

## 3. CLAUDE.md is always-on. Treat every line as rent.

CLAUDE.md is prepended to *every* turn of *every* session, forever. A 400-line CLAUDE.md is a 400-line tax on all fifty tasks. This is the most commonly wasted context in a Claude Code project.

Rules I'd hold you to:
- **Under 100 lines.** See `05-CLAUDE.md` for the drop-in version.
- **Only what cannot be inferred from the code.** "We use React" is inferable from `package.json` — delete it. "D1 has no interactive transactions, use `db.batch()`" is not inferable and will be violated repeatedly if unsaid.
- **Pointers, not content.** `Album rules: docs/prd/04-albums.md` is nine tokens. The album rules are nine hundred.
- Run `/context` occasionally. If CLAUDE.md plus tools have eaten a meaningful slice before you've said a word, cut.
- Rules phrased as "prefer X over Y" land better than "never do Z".

Symlink `AGENTS.md → CLAUDE.md` so the same file works if you ever try another tool.

---

## 4. Let the agent do the reading — in someone else's context window

Subagents are the highest-leverage feature here and the most underused. Each one <cite index="9-1">has its own context window, runs one focused job, and returns a single result</cite>. The reading happens somewhere else; only the conclusion comes back.

Use one <cite index="1-1">when a side task would flood your main conversation with search results, logs, or file contents you won't reference again</cite>.

Three worth defining in `.claude/agents/`:

**`explore`** — "Find where X is implemented and report file paths plus a two-line summary each. Do not modify anything." Reads twenty files, returns eight lines. Model: `haiku`.

**`test-runner`** — "Run `pnpm test`. If it fails, report only the failing test names and assertion messages." Otherwise a failing suite dumps hundreds of lines of stack traces into your main window. Model: `haiku`.

**`reviewer`** — "Review this diff against `docs/prd/<file>` and `docs/architecture.md`. Report violations only." Runs before every PR. Model: `sonnet`.

Cost control is an explicit benefit here — you can <cite index="1-1">control costs by routing tasks to faster, cheaper models like Haiku</cite>. There is no reason for Opus to be grepping.

---

## 5. Plan before writing, for anything touching more than three files

Plan mode costs one cheap round-trip and routinely saves an expensive one. A plan you reject after 400 tokens is far cheaper than an implementation you reject after 15,000.

The failure mode it prevents: the agent picks a slightly wrong abstraction on file one, propagates it through file five, and you only notice at review. Now you're paying to unwind it.

For Phase 0 and every `opus` task in the backlog: plan first, read the plan, then approve.

---

## 6. Route models deliberately

The backlog's `Model` column is not decoration. The heuristic:

- **Opus** — where a subtle error is *expensive and invisible*: money, dates, concurrency, immutability. `F-03`, `F-05`, `F-06`, `T-01`, `T-04`, `T-05`, `A-01`, `A-03`, `A-04`, `E-01`, `R-01`, `H-03`. Roughly twelve of fifty tasks.
- **Sonnet** — anything with a test or a screen that tells you immediately whether it's right. Most of the build.
- **Haiku** — scaffolding, config, seed data, boilerplate, inventory files.

Switch with `/model`. Using Opus for a CSS grid is the same waste as using Haiku for the ledger — just less dangerous.

---

## 7. Give the agent commands, not output

The most expensive habit in agentic development is pasting things.

**Don't** paste a stack trace. **Do** say "`pnpm test` is failing, fix it" — the agent runs it, sees the failure, fixes it, re-runs. One tool call replaces a thousand-token paste, and the agent gets the *current* error rather than the one from four minutes ago.

Same for `wrangler tail`, `git diff`, and build output. It has a terminal. Let it use it.

**Hooks make this automatic.** In `.claude/settings.json`, run `pnpm typecheck && pnpm biome check` after edits. The agent sees its own errors and corrects them before handing the work back, with no round-trip through you.

---

## 8. Tests are compressed specification

Writing "the duplicate refund must always be a net loss under any values the user sets" in a prompt costs tokens once and is forgotten next session. Writing it as a property test costs tokens once and is enforced forever, by a command that costs nothing to run.

This is why `T-01` and `A-01` come first in their phases. They're pure functions, they encode the rules that are easy to get subtly wrong, and once they pass, every downstream task inherits correctness instead of re-deriving it.

Prefer: *"Write the failing test first, show me, then implement."*

---

## 9. Keep files small

The agent reads whole files. A 900-line route file gets read in full to change one handler, every time.

- Route files under 200 lines, one resource each.
- Components under 150 lines.
- If a file crosses 300, splitting it is a real optimisation, not tidiness.

Same reasoning: prefer targeted edits over full-file rewrites. Say "edit only the `completeOccurrence` handler" rather than "update the occurrences route".

---

## 10. Types as free context

Drizzle schema → inferred row types → Zod schemas in `packages/shared` → imported by both Worker and browser.

The agent doesn't need to read the migration SQL to know a column's shape; the type is already in the file it's editing. This is why the schema lives in TypeScript rather than raw SQL, and it's worth the dependency.

---

## 11. The session recipe

```
1.  git checkout -b t/A-07-album-wizard
2.  claude
3.  /task A-07
4.  [read the plan, approve or correct]
5.  [agent implements, hooks run typecheck + lint automatically]
6.  /agents reviewer   → review diff against the PRD
7.  gh pr create       → CI runs
8.  merge, /clear, next task
```

Step 3 is the whole point. Here's the command it runs.

**`.claude/commands/task.md`**

```markdown
---
description: Start a backlog task with exactly the right context
---

Read the row for task $1 in docs/backlog.md.

Then read ONLY the files named in that row's `Load` column, plus CLAUDE.md.
Do not read docs/prd/README.md, other PRD sections, or the full architecture
document unless the Load column names them.

Then:
1. Restate the task and its "Done when" criteria in three lines.
2. Produce a plan: files to create, files to edit, tests to write.
3. Stop and wait for approval before writing any code.

If the task looks like more than ~90 minutes of work, say so and propose
a split instead of starting.
```

Fifteen characters of typing (`/task A-07`), and the agent arrives with precisely the right context and nothing else. That is what your requirement — *the agent must get the context when it needs it* — looks like in practice: on demand, named explicitly, never carried.

Two more worth having:

**`/ship`** — run typecheck, tests, build; write a conventional-commit message from the diff; open a PR that links the backlog task.

**`/ds <ComponentName>`** — read `docs/design-system.md` only, then build the component against the tokens. Never touches the PRD.

---

## 12. Hygiene

- **Don't rely on auto-compact.** When `/context` shows you're getting full, finish the thought, commit, `/clear`. Compaction is a lossy summary written under pressure; a fresh session with a good CLAUDE.md is strictly better.
- **Disconnect MCP servers you aren't using.** Every connected server's tool definitions sit in context on every turn. Check with `/mcp`. For this project you need the Claude Design MCP during Phase 1 and essentially never again — disconnect it after `D-05`.
- **Update the progress table in `backlog.md` at the end of each session.** It's the cheapest possible state handoff between sessions.
- **`.gitignore` the noise** — `dist/`, `.wrangler/`, `node_modules/`, `design/` assets, `.dev.vars`. What isn't in the repo can't be read.

---

## 13. What this adds up to

| Practice | Effect |
|---|---|
| Split the PRD into ten files | ~80% cut in spec tokens per task |
| CLAUDE.md under 100 lines | Compounds across all 50 tasks |
| One task per session, `/clear` between | Removes carried-over dead context |
| Subagents for exploration and test output | Moves the bulkiest reads off your main window |
| Plan mode on multi-file tasks | Cuts the rework quarter of the budget |
| Model routing | ~38 of 50 tasks on cheaper models |
| Commands instead of pasted output | Kills the largest single category of waste |

None of it constrains model capability. Opus still writes the ledger, the recurrence engine, and the album economy — it just doesn't read the reports spec to do it.
