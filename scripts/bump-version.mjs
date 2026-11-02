import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageJsonPath = join(root, 'package.json');
const manifestPath = join(root, 'extension', 'manifest.json');
const packageLockPath = join(root, 'package-lock.json');

async function bumpVersion() {
  const pkgContent = await readFile(packageJsonPath, 'utf8');
  const pkg = JSON.parse(pkgContent);
  const currentVersion = pkg.version || '0.9.0';

  const parts = currentVersion.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid SemVer in package.json: ${currentVersion}`);
  }

  const targetType = process.argv[2] || 'patch';
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

  // Update package.json
  pkg.version = nextVersion;
  await writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  // Update extension/manifest.json
  const manifestContent = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestContent);
  manifest.version = nextVersion;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // Update package-lock.json if it exists
  try {
    const lockContent = await readFile(packageLockPath, 'utf8');
    const lock = JSON.parse(lockContent);
    lock.version = nextVersion;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = nextVersion;
    }
    await writeFile(packageLockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  } catch (_) {
    // optional lockfile
  }

  console.log(`✓ Bumped extension version: ${currentVersion} -> ${nextVersion}`);
  return nextVersion;
}

bumpVersion().catch((err) => {
  console.error(err);
  process.exit(1);
});
