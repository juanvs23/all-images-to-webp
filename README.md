# webpify

Batch-convert a folder of images to WebP with one command. Recursive by default,
safe by default, and honest about before/after sizes.

```console
$ webpify ./photos
✓ photos/hero.jpg -> photos/hero.webp  2.4 MB -> 610 KB  (-75.4%)
✓ photos/team/ana.png -> photos/team/ana.webp  840 KB -> 190 KB  (-77.4%)

converted 2  skipped 0  failed 0  planned 0  (2 discovered)
3.2 MB -> 784 KB  saved 2.4 MB (76.4%)
finished in 1.42s
```

## Requirements

- Node.js >= 20.
- `sharp` ships prebuilt libvips binaries; no system image libraries are needed on
  common platforms.

## Install

```bash
npm install --global all-images-to-webp
# or, without installing:
npx all-images-to-webp ./photos
```

The installed binary is called `webpify`.

## Usage

```
webpify <location> [options]

  -o, --out <dir>          Write under this directory, mirroring the source tree
  -q, --quality <1-100>    WebP quality (default: 80)
      --lossless           Lossless WebP instead of lossy
      --effort <0-6>       Encoder effort (default: 4)
      --max-width <px>     Downscale only if wider than this
      --max-height <px>    Downscale only if taller than this
      --no-recursive       Do not descend into subdirectories
      --overwrite          Re-encode even if the target .webp already exists
      --keep-metadata      Preserve EXIF/ICC (default: strip, after applying orientation)
      --remove-original    Delete the source image after a successful conversion
      --dry-run            Report what would happen; write nothing
      --json               Only JSON on stdout; progress goes to stderr
  -c, --concurrency <n>    Parallel conversions (default: os.availableParallelism())
  -Q, --quiet              Suppress per-file progress lines
  -h, --help               Show this help
  -v, --version            Show the version
```

## Examples

Write optimized copies next to the originals:

```bash
webpify ./photos
```

Mirror a tree into a separate output directory:

```bash
webpify ./photos --out ./photos-webp --quality 82 --effort 5
```

Cap large images without ever enlarging small ones:

```bash
webpify ./photos --max-width 1920 --max-height 1080
```

Preview a run without touching the disk:

```bash
webpify ./photos --dry-run --json
```

Replace originals after a verified conversion (there is no undo):

```bash
webpify ./photos --remove-original
```

## What gets converted

The extension allow-list is fixed and case-insensitive:
`.jpg .jpeg .png .gif .tif .tiff .avif .heif .svg`.

- `.webp` inputs are never re-encoded; they are reported as
  `skipped` with reason `already-webp`.
- Symlinks are not followed, for files or directories.
- Output order is deterministic (sorted by relative path).
- Animated GIFs keep their animation.

## Output behavior

- Default target: the same directory as the source, same basename, `.webp`
  extension.
- With `--out`: the path relative to the scanned root is mirrored under the output
  directory, so `photos/team/ana.png` becomes `<out>/team/ana.webp`.
- An existing target is left alone unless `--overwrite` is passed.
- Encoding always applies EXIF orientation via `sharp(...).rotate()`.
- EXIF and ICC metadata are stripped by default; pass `--keep-metadata` to retain
  them after orientation is applied.
- `--remove-original` deletes the source only after the target exists with a
  non-zero size.
- Writes are atomic: the encoder writes `<target>.part`, which is renamed into
  place. A failed or interrupted conversion never leaves a truncated `.webp`.

## Per-file statuses

| Status | Meaning |
| --- | --- |
| `converted` | A new `.webp` was written. |
| `skipped` | Nothing was written; `reason` is `exists` or `already-webp`. |
| `failed` | Encoding failed; `error` explains why. |
| `planned` | `--dry-run` outcome: the file would have been converted. |

## JSON output

`--json` prints a single JSON document to stdout (progress and summary go to
stderr):

```json
{
  "root": "/abs/path/photos",
  "outDir": null,
  "dryRun": false,
  "concurrency": 8,
  "files": [
    {
      "input": "/abs/path/photos/hero.jpg",
      "output": "/abs/path/photos/hero.webp",
      "status": "converted",
      "reason": "",
      "inputBytes": 2400000,
      "outputBytes": 624640,
      "error": ""
    }
  ],
  "totals": {
    "discovered": 1,
    "converted": 1,
    "skipped": 0,
    "failed": 0,
    "planned": 0,
    "inputBytes": 2400000,
    "outputBytes": 624640,
    "savedBytes": 1775360,
    "savedPercent": 74
  }
}
```

`totals.inputBytes`, `outputBytes`, `savedBytes`, and `savedPercent` cover converted
files only, so skipped and failed files cannot distort the saving. A negative
`savedPercent` means the WebP outputs came out larger than their sources.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Every discovered file was converted, skipped, or planned. |
| `1` | At least one file failed. Other files still converted. |
| `2` | Usage or validation error (missing/extra `<location>`, unknown flag, non-directory path, out-of-range value). The message goes to stderr. |

`--help` and `--version` print to stdout and exit `0`.

## Programmatic API

```ts
import { convertAll, type RunSummary } from 'all-images-to-webp';

const summary: RunSummary = await convertAll({
  location: './photos',
  outDir: './photos-webp',
  quality: 82,
  effort: 5,
  maxWidth: 1920,
  keepMetadata: false,
  overwrite: false,
  dryRun: false,
  removeOriginal: false,
  concurrency: 8,
  onResult: (file) => console.log(file.status, file.input),
});

process.exitCode = summary.totals.failed > 0 ? 1 : 0;
```

`convertAll` never prints; `scanner.ts` and `converter.ts` are importable and
testable without spawning a process.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # build + vitest (unit and CLI e2e)
npm run build       # tsc -> dist/
```

## License

MIT
