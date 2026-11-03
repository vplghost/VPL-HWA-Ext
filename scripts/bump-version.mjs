import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const packageJsonPath = join(root, 'package.json');
const manifestPath = join(root, 'extension', 'manifest.json');
const packageLockPath = join(root, 'package-lock.json');

export async function bumpVersion(targetType = 'patch') {
  const pkgContent = await readFile(packageJsonPath, 'utf8');
  const pkg = JSON.parse(pkgContent);
  const currentVersion = pkg.version || '0.9.0';

  const parts = currentVersion.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid SemVer in package.json: ${currentVersion}`);
  }

  let nextVersion;

  if (targetType === 'major') {
    nextVersion = `${parts[0] + 1}.0.0`;
  } else if (targetType === 'minor') {
    nextVersion = `${parts[0]}.${parts[1] + 1}.0`;
  } else if (targetType === 'patch') {
    nextVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  } else if (/^\d+\.\d+\.\d+$/.test(targetType)) {
    nextVersion = targetType;
  } else {
    throw new Error(`Unknown bump target: "${targetType}". Use "patch", "minor", "major", or explicit "X.Y.Z"`);
  }

  const nextParts = nextVersion.split('.').map(Number);
  const changedPart = nextParts.findIndex((part, index) => part !== parts[index]);
  if (changedPart < 0 || nextParts[changedPart] < parts[changedPart]) {
    throw new Error('Build version must be greater than ' + currentVersion);
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const lock = JSON.parse(await readFile(packageLockPath, 'utf8'));
  if (manifest.version !== currentVersion || lock.version !== currentVersion ||
      lock.packages?.['']?.version !== currentVersion) {
    throw new Error('Version mismatch between package.json, package-lock.json, and extension/manifest.json');
  }

  pkg.version = nextVersion;
  manifest.version = nextVersion;
  lock.version = nextVersion;
  lock.packages[''].version = nextVersion;
  await writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  await writeFile(packageLockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`✓ Bumped extension version: ${currentVersion} -> ${nextVersion}`);
  return nextVersion;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  bumpVersion(process.argv[2] || 'patch').catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
