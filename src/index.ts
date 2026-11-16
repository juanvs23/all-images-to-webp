import os from 'node:os';
import path from 'node:path';
import { convertFile } from './converter.js';
import { mapPool } from './pool.js';
import { scanDirectory } from './scanner.js';
import type {
  ConvertAllOptions,
  FileResult,
  RunSummary,
  RunTotals,
  ScannedFile,
} from './types.js';

export const DEFAULT_QUALITY = 80;
export const DEFAULT_EFFORT = 4;

/**
 * Convert every supported image under `options.location`.
 *
 * The function only orchestrates: scanning, target resolution, bounded
 * concurrency, and totals. It never prints, so the CLI and any caller can
 * format results however they need.
 */
export async function convertAll(options: ConvertAllOptions): Promise<RunSummary> {
  const root = path.resolve(options.location);
  const outDir = options.outDir ? path.resolve(options.outDir) : null;
  const dryRun = options.dryRun ?? false;
  const concurrency = options.concurrency ?? os.availableParallelism();
  const overwrite = options.overwrite ?? false;
  const removeOriginal = options.removeOriginal ?? false;
  const settings = {
    quality: options.quality ?? DEFAULT_QUALITY,
    effort: options.effort ?? DEFAULT_EFFORT,
    lossless: options.lossless ?? false,
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    keepMetadata: options.keepMetadata ?? false,
  };

  const entries = await scanDirectory(root, { recursive: options.recursive ?? true });

  const files = await mapPool(entries, concurrency, async (entry: ScannedFile) => {
    const result = await convertFile(entry.path, {
      ...settings,
      outputPath: resolveOutputPath(entry, outDir),
      overwrite,
      dryRun,
      removeOriginal,
    });
    options.onResult?.(result);
    return result;
  });

  return {
    root,
    outDir,
    dryRun,
    concurrency,
    files,
    totals: summarize(files),
  };
}

/** Resolve the `.webp` target for a discovered file. */
function resolveOutputPath(entry: ScannedFile, outDir: string | null): string {
  if (outDir === null) {
    return replaceExtension(entry.path);
  }
  return path.join(outDir, replaceExtension(entry.relativePath));
}

function replaceExtension(filePath: string): string {
  const ext = path.extname(filePath);
  return `${filePath.slice(0, filePath.length - ext.length)}.webp`;
}

function summarize(files: FileResult[]): RunTotals {
  const totals: RunTotals = {
    discovered: files.length,
    converted: 0,
    skipped: 0,
    failed: 0,
    planned: 0,
    inputBytes: 0,
    outputBytes: 0,
    savedBytes: 0,
    savedPercent: 0,
  };

  for (const file of files) {
    totals[file.status] += 1;
    if (file.status === 'converted') {
      totals.inputBytes += file.inputBytes;
      totals.outputBytes += file.outputBytes;
    }
  }

  totals.savedBytes = totals.inputBytes - totals.outputBytes;
  totals.savedPercent =
    totals.inputBytes === 0 ? 0 : Math.round((totals.savedBytes / totals.inputBytes) * 1000) / 10;
  return totals;
}

export type {
  ConvertAllOptions,
  ConvertFileOptions,
  EncodeSettings,
  FileResult,
  FileStatus,
  RunSummary,
  RunTotals,
  ScannedFile,
  SkipReason,
} from './types.js';
