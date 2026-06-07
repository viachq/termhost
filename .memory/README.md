# Project Memory Protocol

Shared memory system for AI coding agents (Claude Code, Codex, Cursor, etc.).
This folder is the single source of truth for project knowledge that cannot be derived from code alone.

## Quick Start for Agents

1. Read `_index.md` first — it lists everything available
2. Read notes relevant to your current task
3. Work on the task
4. Create/update/delete notes if you learned something worth preserving
5. Update `_index.md` after any changes

## Active Learning

Don't just passively read memory — actively maintain it:

- **Ask the user when appropriate** — if you encounter an unclear decision during work and the answer would help you do a better job right now, ask. Don't interrupt workflow with unrelated memory questions. Batch non-urgent questions for natural pauses.
- **Write the answer** into the appropriate note immediately after getting it.
- **Flag unknowns** — if something is unclear but not blocking, create or update a note with a `[?]` marker. Resolve these markers when the topic comes up naturally or during a quiet moment.
- **After significant work** (new feature, major refactor, bug fix), check if memory needs updating. Don't wait to be told.
- **Quick reference is valuable** — short summaries of what exists in code (key names, config keys, command lists) save scanning time. Keep them as compact indexes, not code copies.

## Structure

```
.memory/
├── README.md          ← you are here (protocol, never changes)
├── _index.md          ← auto-maintained catalog of all notes
├── architecture/      ← what exists, how it's built, project structure
├── decisions/         ← why something was done this way (not another)
├── patterns/          ← how to do X correctly in this project
├── gotchas/           ← traps, non-obvious behavior, things that break
└── domain/            ← business logic, terms, rules, domain context
```

New categories can be added when an existing one doesn't fit. Don't force notes into wrong categories.

## Note Format

```markdown
---
updated: YYYY-MM-DD
tags: [tag1, tag2]
related: [[other-note-filename]]
---
# Title

Content goes here.
```

- `updated` — date of last meaningful edit
- `tags` — for filtering and search (lowercase, short)
- `related` — links to other notes by filename (without extension)
- Content — concise, only what's NOT obvious from the code

## What to Write

Write when you discover something that:
- A future agent/session cannot understand from code alone
- Would cause repeated mistakes without documentation
- Explains WHY, not WHAT (code already shows what)
- Captures a constraint, trade-off, or business rule

Examples of good notes:
- "We use decorator X instead of Y because of performance issue Z"
- "Never call this API without rate limiting — it has a 100 req/min hard cap"
- "The billing module assumes UTC everywhere, converting to local tz breaks invoices"

## What NOT to Write

- Code snippets (they go stale)
- Git history or changelogs
- Temporary task state or TODOs
- Anything derivable by reading the code
- Anything already in the codebase's own docs

## When to Update

- Note contradicts current code — update it
- Note is partially correct — fix the outdated parts
- Note is completely irrelevant — delete it
- Significant architectural change happened — reflect it

## When to Delete

- The feature/pattern described no longer exists
- The note has been wrong for a while and nobody needed it
- Information is now obvious from the code itself

## Rules

1. **One note = one topic.** If a note grows beyond ~100 lines, split it.
2. **Filenames are kebab-case.** Example: `api-auth-flow.md`, `billing-gotcha.md`.
3. **Always update `_index.md`** after creating, renaming, or deleting a note.
4. **Don't duplicate across categories.** If a decision led to a pattern, put the "why" in `decisions/` and the "how" in `patterns/`, then link them with `related`.
5. **Prefer updating over creating.** Check if a relevant note already exists before making a new one.
6. **Keep notes short.** If you need more than a screen of text, you're writing too much.
