# AGENTS.md

Guidance for Codex agents working in this repository.

## Working agreement
- Always inspect git branch + remote state first (`git rev-parse --abbrev-ref HEAD`, `git remote -v`).
- Never work directly on `main`; use a feature branch.
- Keep diffs small, practical, and PR-friendly.
- Prefer lightweight changes that preserve the current architecture.

## Architecture guardrails
- Do **not** rewrite the app into a new framework unless explicitly requested.
- Do **not** introduce heavy dependencies unless explicitly requested.
- Do **not** add TypeScript unless explicitly requested.
- Do **not** add Redis or a database unless explicitly requested.
- Keep the Node.js + Express + modular service structure intact.

## UI/UX policy (critical)
- The default/collapsed main server list must remain clean and readable.
- Technical indicators, diagnostics, heuristics, and experimental metadata must **never** be added to the default collapsed list.
- Technical information belongs only in:
  - Advanced view
  - Expanded server details
- Avoid adding noisy badges or heuristic cues to the default collapsed list.

## Validation expectations
- Run `npm test` after meaningful changes.
- If changes are docs-only, still report validation honestly.
- Do not invent checks you did not run.

## Task handoff expectations
In every completed task, provide:
- A short plan
- Files changed
- Validation performed
- Tradeoffs / open questions
