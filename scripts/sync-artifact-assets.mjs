import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { convertImgBuffer } from './convert-img-asset.mjs';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');

const aIdPath = join(root, 'temp/splitlib/artifact_id.json');
const indexPath = join(root, 'temp/live-full-index.json');

const aId = JSON.parse(await readFile(aIdPath, 'utf8'));
const index = JSON.parse(await readFile(indexPath, 'utf8'));

const artifactDir = join(root, 'extension/assets/items/artifact');
const fragmentDir = join(root, 'extension/assets/items/fragmentArtifact');
const tempDir = join(root, 'temp/artifact_sync_tmp');

await mkdir(artifactDir, { recursive: true });
await mkdir(fragmentDir, { recursive: true });
await mkdir(tempDir, { recursive: true });

async function fileExistsAndNotEmpty(path) {
  try {
    const s = await stat(path);
    return s.size > 0;
  } catch {
    return false;
  }
}

const tasks = [];
for (const [id, a] of Object.entries(aId)) {
  const imgName = a.icon?.imagePath?.replace(/\.png$/i, '');
  const key1 = `extends/icons/artifact/${imgName}.img`;
  const key2 = `extends/icons/artifact/${imgName}_big.img`;
  const key = index[key1] ? key1 : (index[key2] ? key2 : null);

  if (!key) {
    console.warn(`[Warning] No texture found for artifact ${id} (${imgName})`);
    continue;
  }

  // Check if separate fragment image exists in index
  const fragKey = `extends/icons/artifact/fragment_${imgName}.img`;
  const separateFrag = index[fragKey] ? index[fragKey] : null;

  const cdnPath = index[key].path;
  const url = `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.293.0/${cdnPath}`;
  tasks.push({
    id,
    type: a.type,
    imgName,
    url,
    separateFragUrl: separateFrag ? `https://heroesmobile-a-cdn.nextersglobal.com/v/webgl/1.293.0/${separateFrag.path}` : null
  });
}

console.log(`Starting sync for ${tasks.length} artifacts (concurrency: 8)...`);

let completed = 0;
let cursor = 0;
const concurrency = 8;

async function worker() {
  while (cursor < tasks.length) {
    const task = tasks[cursor++];
    const artifactPng = join(artifactDir, `${task.id}.png`);
    const fragmentPng = join(fragmentDir, `${task.id}.png`);

    const hasArtifact = await fileExistsAndNotEmpty(artifactPng);
    const hasFragment = await fileExistsAndNotEmpty(fragmentPng);

    if (hasArtifact && hasFragment) {
      completed++;
      continue;
    }

    try {
      const tempImg = join(tempDir, `${task.id}.img`);
      await execFileAsync('curl.exe', ['-s', '--retry', '3', '-o', tempImg, task.url]);
      const imgBuf = await readFile(tempImg);
      const { png } = convertImgBuffer(imgBuf);

      if (!hasArtifact) {
        await writeFile(artifactPng, png);
      }

      if (!hasFragment) {
        if (task.separateFragUrl) {
          const tempFragImg = join(tempDir, `${task.id}_frag.img`);
          await execFileAsync('curl.exe', ['-s', '--retry', '3', '-o', tempFragImg, task.separateFragUrl]);
          const fragBuf = await readFile(tempFragImg);
          const { png: fragPng } = convertImgBuffer(fragBuf);
          await writeFile(fragmentPng, fragPng);
        } else {
          // Use matching artifact image when no separate fragment image exists
          await writeFile(fragmentPng, png);
        }
      }

      completed++;
      if (completed % 20 === 0 || completed === tasks.length) {
        console.log(`Progress: ${completed}/${tasks.length} artifacts processed.`);
      }
    } catch (err) {
      console.error(`Failed processing artifact ${task.id} (${task.imgName}):`, err.message);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(`Artifact asset sync complete! (${completed}/${tasks.length} written).`);
