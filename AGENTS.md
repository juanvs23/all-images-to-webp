# AGENTS.md

Guidance for agents and humans working in this repository.

## What this project is

`webpify` is a zero-config CLI that recursively converts supported images to WebP.
The source of truth for scope and decisions is
`odd/tasks/all-images-to-webp.md`.

## Stack

- Node.js >= 20, ESM (`"type": "module"`).
- TypeScript strict, `module`/`moduleResolution` = `NodeNext`, build to `dist/`.
- Runtime dependency: `sharp` only. CLI parsing uses `node:util` `parseArgs` with
  `strict: true`; do not add a CLI framework, glob library, color library, or
  concurrency library.
- Tests: Vitest. Unit tests import `src/` directly; the e2e suite spawns the built
  `dist/cli.js`.

## Layout

```
src/types.ts       Shared domain types (results, options, summary)
src/scanner.ts     Recursive walk, extension allow-list, symlink skip
src/converter.ts   sharp pipeline, skip rules, atomic write, per-file errors
src/pool.ts        Bounded-concurrency map
src/index.ts       Public API: convertAll()
src/reporter.ts    Human progress lines, ANSI color, summary block
src/cli.ts         parseArgs, validation, exit codes; bin/webpify
tests/             Unit tests + tests/cli.e2e.test.ts
tests/e2e/cli/     E2E harness docs and gitignored evidence/
docs/              context, roadmap, changelog
```

## Commands

```bash
npm run typecheck   # tsc --noEmit
npm test            # pretest builds, then vitest run
npm run build       # tsc -> dist/
```

## Invariants

- One runtime dependency (`sharp`). Keep it that way.
- Default run writes next to the source; `--out` mirrors the tree.
- Existing targets are skipped unless `--overwrite`.
- `.webp` inputs are never re-encoded; report `skipped: already-webp`.
- Never follow symlinks during the scan.
- Orientation is always applied; metadata is stripped unless `--keep-metadata`.
- Writes are atomic (`<target>.part` then rename); clean up `.part` on failure.
- Per-file failures never abort the batch; the process exits `1` at the end.
- Exit `2` only for usage/validation errors.
- All code, comments, docs, and commit messages are in English.
- Do not add AI attribution or `Co-Authored-By` trailers to commits.
- Tests belong with the behavior they verify.

## E2E evidence

Run products live under `tests/e2e/cli/evidence/` and are gitignored; the harness
README explains how fixtures are generated. Never write test evidence to `/tmp`.

## Debt

Record deliberate shortcuts with a `[DEBT]` marker in code and a matching entry in
`docs/roadmap.md`.
