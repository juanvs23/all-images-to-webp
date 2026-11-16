import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ScannedFile } from './types.js';

/** Image extensions that are converted, checked case-insensitively. */
const SUPPORTED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.tif',
  '.tiff',
  '.avif',
  '.heif',
  '.svg',
] as const;

const SUPPORTED = new Set<string>(SUPPORTED_EXTENSIONS);
const WEBP = '.webp';

export function isWebpImage(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === WEBP;
}

function isSupportedImage(filePath: string): boolean {
  return SUPPORTED.has(path.extname(filePath).toLowerCase());
}

/**
 * Recursively collect supported images under `root`.
 *
 * Symlinks are never followed (neither files nor directories), so a cyclic
 * link cannot trap the walk. The returned list is sorted by relative path,
 * which keeps output deterministic across filesystems.
 */
export async function scanDirectory(
  root: string,
  options: { recursive?: boolean } = {},
): Promise<ScannedFile[]> {
  const recursive = options.recursive ?? true;
  const found: ScannedFile[] = [];
  await walk(root, root, recursive, found);
  found.sort((a, b) => compare(a.relativePath, b.relativePath));
  return found;
}

async function walk(
  directory: string,
  root: string,
  recursive: boolean,
  found: ScannedFile[],
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => compare(a.name, b.name));

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (recursive) await walk(fullPath, root, recursive, found);
      continue;
    }
    if (!entry.isFile()) continue;

    const alreadyWebp = isWebpImage(entry.name);
    if (!alreadyWebp && !isSupportedImage(entry.name)) continue;

    found.push({
      path: fullPath,
      relativePath: path.relative(root, fullPath),
      alreadyWebp,
    });
  }
}

function compare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
