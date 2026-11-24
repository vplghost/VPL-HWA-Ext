import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd());

/**
 * Reads a tracking log from `temp/tracking-data/<filename>`, falling back to
 * `temp/tracking-data/archived/<filename>` so archived logs never break tests.
 */
export async function readTrackingLog(filename) {
  const candidates = [
    resolve(root, 'temp/tracking-data', filename),
    resolve(root, 'temp/tracking-data/archived', filename),
  ];
  let lastErr;
  for (const filePath of candidates) {
    try {
      return await readFile(filePath, 'utf8');
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
