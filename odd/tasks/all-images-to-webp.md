# Feature: all-images-to-webp

## Objective

A CLI (`webpify`) that takes a directory, recursively finds every supported image, and
writes an optimized WebP version of each one. Single command, no config file, safe by
default (never destroys the original unless explicitly asked).

## Problem

Converting a folder of images to WebP today means either a GUI tool (per-file, no
recursion), a fragile shell loop around `cwebp` (no per-file error handling, no
concurrency), or a service upload. There is no local, scriptable, zero-config tool that
reports before/after size honestly.

## Why

Repeatable, auditable batch conversion: one command, machine-readable summary, exit code
that fails CI when any file fails.

## Scope

### In scope

- Recursive directory scan with a fixed image extension allow-list.
- WebP encode via `sharp` (libvips), with quality / effort / lossless / max-dimension
  controls, EXIF auto-orientation, metadata stripping by default.
- Bounded-concurrency worker pool.
- Per-file status (`converted`, `skipped`, `failed`, `planned`), human progress output,
  and an optional machine-readable JSON summary.
- `--dry-run`, `--overwrite`, `--remove-original`, `--out`, `--json`, `--quiet`.
- Atomic writes (`.part` + rename) so an interrupted run never leaves a truncated file.
- Exit codes: `0` all good, `1` at least one file failed, `2` usage/validation error.

### Out of scope (deliberate)

- Other output formats (AVIF/JPEG/PNG re-encode). One format, done well.
- Animated sequence / video frames beyond preserving a source GIF's animation.
- Watch mode, image resizing as a feature (only `--max-width` / `--max-height` caps).
- A config file. Flags only.
- Undoing or rewriting `--remove-original`.
- `.webp` input re-encoding: a `.webp` file is reported `skipped: already-webp`.
- `--flat`: flattening into `--out` creates collision edge cases with no stated need.

## Constraints

- Node >= 20, ESM (`"type": "module"`).
- Only runtime dependency: `sharp`. Argument parsing uses Node's native
  `node:util` `parseArgs` — no CLI framework, no hand-rolled parser.
- TypeScript strict, `NodeNext` module resolution, build to `dist/`.
- All canonical artifacts (code, comments, README, docs) in English.
- Do not follow symlinks during scan (cycle safety).

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Encoder | `sharp` (libvips) | Fastest WebP encoder in the ecosystem, multithreaded, per-file error isolation, animated GIF support |
| CLI parsing | `node:util.parseArgs` | Stdlib, native, `strict: true` gives unknown-flag rejection for free |
| Default output location | Next to the source file | Zero-flag invocation does what the user asked: convert *in place* |
| Metadata | Stripped by default, `--keep-metadata` opts back in | Stripping EXIF/ICC is the largest single win for photo folders |
| Orientation | `.rotate()` always applied | Stripping EXIF without applying orientation would silently rotate phone photos |
| `.webp` input | Skipped | Output would collide with input and re-encoding gains nothing |
| Existing target | Skipped unless `--overwrite` | Cheap re-runs over a mixed folder |
| Failure policy | Collect and continue, exit `1` | One corrupt file must not abort a 5 000-file batch |
| Write atomicity | `<target>.part` then `rename` | Interrupted run leaves no half-written `.webp` |

## TDD / Verification Mode

- TDD: **off** — no existing project config and no explicit user request. Resolved at
  scaffold time; ordinary functional checks apply.
- Checks: `npm run typecheck`, `npm test` (unit + CLI e2e), `npm run build`.
- E2E evidence lives in `tests/e2e/cli/` with a gitignored `evidence/` folder (repo rule).

## Tasks

- [ ] **T1 — Scaffold.** `git init`, `package.json` (`bin.webpify` → `dist/cli.js`,
  `pretest` build), `tsconfig.json` (strict, NodeNext, `dist/`), `.gitignore`
  (`node_modules`, `dist`, `evidence/`), vitest config, install `sharp` + dev deps.
  Route: delegated (writer).

- [ ] **T2 — Types + scanner.** `src/types.ts` shared domain types; `src/scanner.ts`
  recursive walk with extension allow-list, symlink skip, sorted deterministic output,
  and relative-path computation against the scan root. Route: delegated (writer).

- [ ] **T3 — Converter core.** `src/converter.ts`: `sharp(input)` → `.rotate()` →
  optional `.resize({ width, height, fit: 'inside', withoutEnlargement: true })` →
  `.webp({ quality, effort, lossless })` → atomic write; returns per-file result with
  input/output byte counts. No process-level state. Route: delegated (writer).

- [ ] **T4 — CLI + reporter.** `src/cli.ts` (`parseArgs`, validation, exit codes,
  wiring), `src/reporter.ts` (human progress line, TTY-aware color, JSON summary),
  `src/pool.ts` (bounded concurrency), `src/index.ts` (public API `convertAll`).
  Route: delegated (writer).

- [ ] **T5 — Tests green.** Unit: scanner (extensions, recursion, skip, ordering),
  converter (dimensions, size drop, metadata strip, atomicity, failure isolation),
  pool (concurrency cap). E2E: spawn built `dist/cli.js` on a generated fixture tree;
  assert exit codes, JSON summary shape, `--dry-run` writes nothing, `--remove-original`
  deletes only on success. Route: delegated (writer).

- [ ] **T6 — Docs.** `README.md` (install, usage, all flags, examples, exit codes),
  `AGENTS.md`, `docs/context.md`, `docs/roadmap.md`, `docs/changelog.md`.
  Route: delegated (writer).

- [ ] **T7 — Verify and commit.** Typecheck, full test run, build, real CLI run on a
  generated sample folder inside `tests/e2e/cli/evidence/`, review diff for dead code.
  Work-unit commits recorded below. Route: inline (parent).

## Acceptance criteria

1. `npx webpify ./some-folder` writes a `.webp` next to every supported image and prints
   real before/after sizes.
2. `webpify ./some-folder --json` emits only JSON on stdout (progress goes to stderr).
3. `webpify ./some-folder --out ./out` mirrors the source tree under `./out`.
4. A corrupt image is reported as failed, other files still convert, exit code is `1`.
5. `--dry-run` writes nothing and reports `planned`.
6. `--remove-original` deletes a source only after its `.webp` exists and is non-zero.
7. Unknown flags and validation errors exit `2` with a usage message on stderr.
   `--help` and `--version` print to stdout and exit `0` (corrected during T7: the draft of
   this criterion demanded exit `2` for `--help`, which contradicts the standard convention
   and the CLI surface actually specified. The implementation follows the convention.)
8. Existing `.webp` targets are skipped unless `--overwrite`.
9. `npm run typecheck` and `npm test` pass with no skipped tests.

## Progress

| Task | Status | Evidence |
| --- | --- | --- |
| T1 Scaffold | done | `582d0b0`, `npm run typecheck` clean |
| T2 Types + scanner | done | `96506e0`, `tests/scanner.test.ts` 5 green |
| T3 Converter core | done | `5977143`, `tests/converter.test.ts` 12 green |
| T4 CLI + reporter | done | `2848b47`, `tests/pool.test.ts` 4 green |
| T5 Tests green | done | `ff3d8e3`, `tests/cli.e2e.test.ts` 12 green, 33 total |
| T6 Docs | done | `1cd76fd`, README + AGENTS + docs |
| T7 Verify + commits | done | parent verification below |

## Verification evidence

Verified by the orchestrator, not accepted from the writer's report:

- `npm run typecheck` — exit 0, no diagnostics.
- `npm test` — 4 files, **33 tests passed, 0 skipped**.
- `git status --short` — clean; `tests/e2e/cli/evidence/` untracked and gitignored.

Behavioural spot checks on generated fixtures
(`tests/e2e/cli/evidence/verify-*`):

| Check | Observed |
| --- | --- |
| `--json` stdout purity | stdout parsed as JSON; progress on stderr |
| Corrupt input isolated | `failed:1`, `converted:2`, exit `1`, batch continued |
| `.webp` input | `skipped:already-webp`, never re-encoded |
| Existing target | `skipped:exists` |
| Unknown flag | exit `2`, usage on stderr |
| Missing `<location>` | exit `2` |
| `--help` | exit `0`, usage on stdout |
| `--dry-run` | zero `.webp` written, exit `0` |
| `--out` mirroring | `<out>/rotated.webp`, `<out>/tiny.webp` |
| EXIF orientation 6 on 400x200 | output `200x400` — orientation applied |
| `--max-width 5000` on 120x80 | output `120x80` — no enlargement |
| Metadata | EXIF stripped, ICC stripped by default |
| Output format | `webp` confirmed via `sharp().metadata()` |
| Real run totals | 2 images, 23 315 B → 4 562 B, **80.4 % saved** |

## Contract deviation resolved

The writer flagged that this document's draft criterion 7 demanded exit `2` for `--help`
while the delegation brief specified exit `0`. The standard convention won and the
criterion was corrected here; no code change was needed.

## Next step

Feature complete and published at 0.1.0: source is public at
<https://github.com/juanvs23/all-images-to-webp> under the MIT license. Open items live
in `docs/roadmap.md`. Publishing to the npm registry is still pending and remains a user
decision.
