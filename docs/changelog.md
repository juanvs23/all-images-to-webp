# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-16

### Added

- `webpify <location>` batch conversion of `.jpg`, `.jpeg`, `.png`, `.gif`, `.tif`,
  `.tiff`, `.avif`, `.heif`, and `.svg` to WebP, recursively by default.
- Quality, effort, lossless, `--max-width` / `--max-height`, recursion, overwrite,
  metadata, remove-original, dry-run, JSON, concurrency, and quiet flags.
- EXIF auto-orientation on every conversion; EXIF/ICC stripped by default.
- Atomic `.part` + rename writes with cleanup on failure.
- Per-file statuses (`converted`, `skipped`, `failed`, `planned`) with isolated
  failures and exit code `1` for partial failures.
- `--json` summary on stdout with a stable, documented shape; human progress on
  stderr in JSON mode.
- Programmatic `convertAll()` API with an `onResult` callback.
- MIT license, with `repository`, `bugs`, and `homepage` metadata in `package.json`.
- Unit tests for scanner, converter, and pool; CLI e2e tests covering exit codes,
  JSON shape, dry runs, output mirroring, and source removal.
