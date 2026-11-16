import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { isWebpImage } from './scanner.js';
import type { ConvertFileOptions, FileResult } from './types.js';

/**
 * Convert one image to WebP.
 *
 * Writing goes to `<target>.part` first and is renamed into place only after
 * the encoder succeeded, so an interrupted run can never leave a truncated
 * `.webp`. Every failure is captured in the result instead of thrown, which
 * lets a batch keep going past a corrupt file.
 */
export async function convertFile(
  input: string,
  options: ConvertFileOptions,
): Promise<FileResult> {
  const result: FileResult = {
    input,
    output: options.outputPath,
    status: 'planned',
    reason: '',
    inputBytes: await fileSize(input),
    outputBytes: 0,
    error: '',
  };

  if (isWebpImage(input)) {
    return { ...result, status: 'skipped', reason: 'already-webp' };
  }
  if (!options.overwrite && (await pathExists(options.outputPath))) {
    return { ...result, status: 'skipped', reason: 'exists' };
  }
  if (options.dryRun) {
    return result;
  }

  const partPath = `${options.outputPath}.part`;
  try {
    await mkdir(path.dirname(options.outputPath), { recursive: true });

    const animated = path.extname(input).toLowerCase() === '.gif';
    let pipeline = sharp(input, { animated }).rotate();
    if (options.maxWidth !== undefined || options.maxHeight !== undefined) {
      pipeline = pipeline.resize({
        width: options.maxWidth,
        height: options.maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    pipeline = pipeline.webp({
      quality: options.quality,
      effort: options.effort,
      lossless: options.lossless,
    });
    if (options.keepMetadata) {
      pipeline = pipeline.withMetadata();
    }

    await pipeline.toFile(partPath);
    const encoded = await stat(partPath);
    if (encoded.size <= 0) {
      throw new Error('encoder produced an empty file');
    }

    await rename(partPath, options.outputPath);
    const outputBytes = (await stat(options.outputPath)).size;

    if (options.removeOriginal && outputBytes > 0) {
      await unlink(input);
    }

    return { ...result, status: 'converted', outputBytes };
  } catch (error) {
    await unlink(partPath).catch(() => undefined);
    return { ...result, status: 'failed', error: describeError(error) };
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileSize(filePath: string): Promise<number> {
  try {
    return (await stat(filePath)).size;
  } catch {
    return 0;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
