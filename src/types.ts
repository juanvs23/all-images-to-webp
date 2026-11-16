/** Outcome of a single file once a run has processed it. */
export type FileStatus = 'converted' | 'skipped' | 'failed' | 'planned';

/** Why a file was skipped. Empty string when the file was not skipped. */
export type SkipReason = 'exists' | 'already-webp' | '';

/** Per-file record emitted by the converter and serialized by `--json`. */
export interface FileResult {
  /** Absolute path of the source image. */
  input: string;
  /** Absolute path of the intended `.webp` target. */
  output: string;
  status: FileStatus;
  reason: SkipReason;
  /** Size of the source file in bytes, or 0 when it could not be read. */
  inputBytes: number;
  /** Size of the written `.webp` in bytes, or 0 when nothing was written. */
  outputBytes: number;
  /** Human-readable error message, empty when the file did not fail. */
  error: string;
}

/** A source image discovered by the scanner. */
export interface ScannedFile {
  /** Absolute path of the image. */
  path: string;
  /** Path relative to the scanned root, using the platform separator. */
  relativePath: string;
  /** True for `.webp` inputs, which are reported but never re-encoded. */
  alreadyWebp: boolean;
}

/** Encoder settings shared by the CLI and the programmatic API. */
export interface EncodeSettings {
  /** WebP quality, 1-100. */
  quality: number;
  /** Encoder effort, 0-6. */
  effort: number;
  /** Encode lossless instead of lossy. */
  lossless: boolean;
  /** Downscale only when the image is wider than this. */
  maxWidth?: number;
  /** Downscale only when the image is taller than this. */
  maxHeight?: number;
  /** Keep EXIF/ICC metadata instead of stripping it. */
  keepMetadata: boolean;
}

/** Options for converting one file. */
export interface ConvertFileOptions extends EncodeSettings {
  /** Absolute path of the `.webp` to write. */
  outputPath: string;
  /** Re-encode even when the target already exists. */
  overwrite: boolean;
  /** Report the intended outcome without writing anything. */
  dryRun: boolean;
  /** Delete the source after a successful, non-empty write. */
  removeOriginal: boolean;
}

/** Options for {@link convertAll}. */
export interface ConvertAllOptions extends Partial<EncodeSettings> {
  /** Directory to scan. */
  location: string;
  /** Directory that mirrors the source tree. Defaults to writing next to each source. */
  outDir?: string | null;
  /** Descend into subdirectories. Defaults to `true`. */
  recursive?: boolean;
  /** Maximum parallel conversions. Defaults to `os.availableParallelism()`. */
  concurrency?: number;
  /** Re-encode even when the target already exists. Defaults to `false`. */
  overwrite?: boolean;
  /** Report without writing. Defaults to `false`. */
  dryRun?: boolean;
  /** Delete each source after a successful conversion. Defaults to `false`. */
  removeOriginal?: boolean;
  /** Called as each file settles, in completion order. */
  onResult?: (result: FileResult) => void;
}

/** Aggregate counters for a run. Byte totals cover converted files only. */
export interface RunTotals {
  discovered: number;
  converted: number;
  skipped: number;
  failed: number;
  planned: number;
  inputBytes: number;
  outputBytes: number;
  savedBytes: number;
  savedPercent: number;
}

/** Result of a full run, identical to the `--json` payload. */
export interface RunSummary {
  /** Absolute path of the scanned root. */
  root: string;
  /** Absolute output directory, or `null` when writing next to sources. */
  outDir: string | null;
  dryRun: boolean;
  concurrency: number;
  files: FileResult[];
  totals: RunTotals;
}
