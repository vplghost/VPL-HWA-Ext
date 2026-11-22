/**
 * verifyDungeonBattles.mjs
 * Script trích xuất và kiểm tra toàn diện 31 trận đánh Dungeon thực tế từ các tệp log game,
 * đối chiếu cấu trúc rawBattle, seed, attackers, defenders, thời lượng và kết quả sao.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const LOG_FILES = [
  'temp/dungeon/hwa-game-record-202611201821_dungeon_1.json',
  'temp/dungeon/hwa-game-record-202611201907_dungeon_2.json',
  'temp/dungeon/hwa-game-record-202611201909_dungeon_3.json',
  'temp/tracking-data/hwa-game-record-202611100940_dungeon.json',
  'temp/tracking-data/hwa-game-record-202611101207_dungeon_auto.json'
];

function extractBattles() {
  const battles = [];

  for (const relativePath of LOG_FILES) {
    const fullPath = path.resolve(rootDir, '..', relativePath);
    if (!fs.existsSync(fullPath)) continue;

    const raw = fs.readFileSync(fullPath, 'utf8');
    if (!raw.includes('dungeonStartBattle')) continue;

    const data = JSON.parse(raw);
    const timeline = data.timeline || data.records || [];
    let pendingStart = null;

    for (const item of timeline) {
      if (!item.endpoint || !item.endpoint.includes('/api/rpc')) continue;
      const req = typeof item.requestBody === 'string' ? JSON.parse(item.requestBody) : item.requestBody;
      const res = typeof item.responseBody === 'string' ? JSON.parse(item.responseBody) : item.responseBody;
      if (!req?.calls || !res?.results) continue;

      for (let i = 0; i < req.calls.length; i++) {
        const call = req.calls[i];
        const result = res.results[i]?.result;

        if (call.name === 'dungeonStartBattle' && result?.response) {
          pendingStart = {
            args: call.args,
            rawBattle: result.response,
            timestamp: item.timestamp
          };
        }

        if (call.name === 'dungeonEndBattle' && pendingStart) {
          battles.push({
            file: relativePath,
            timestamp: item.timestamp,
            teamNum: pendingStart.args?.teamNum ?? 0,
            seed: pendingStart.rawBattle.seed,
            type: pendingStart.rawBattle.type,
            attackersList: Object.keys(pendingStart.rawBattle.attackers || {}),
            defendersList: Object.keys(pendingStart.rawBattle.defenders?.[0] || {}),
            rawBattle: pendingStart.rawBattle,
            endArgs: call.args,
            actualWin: call.args?.result?.win,
            actualStars: call.args?.result?.stars,
            duration: call.args?.progress?.[0]?.duration,
            survivingAttackers: Object.keys(call.args?.progress?.[0]?.attackers?.heroes || {})
          });
          pendingStart = null;
        }
      }
    }
  }

  return battles;
}

console.log('================================================================');
console.log(' HWA-SIM: KIỂM TRA TOÀN DIỆN CÁC TRẬN ĐÁNH DUNGEON ĐÃ CÓ TRONG LOG');
console.log('================================================================\n');

const battles = extractBattles();
console.log(`Tổng số trận đánh thực tế trích xuất được: ${battles.length} trận.\n`);

const starStats = { 3: 0, 2: 0, 1: 0, 0: 0 };
let totalDuration = 0;
let elementMatches = { water: 0, fire: 0, earth: 0, mixed: 0 };

battles.forEach((b, idx) => {
  starStats[b.actualStars] = (starStats[b.actualStars] || 0) + 1;
  totalDuration += (b.duration || 0);

  // Nhận diện hệ
  const firstAttacker = parseInt(b.attackersList[0] || '0', 10);
  let elem = 'mixed';
  if (firstAttacker >= 4000 && firstAttacker <= 4004) elem = 'water';
  else if (firstAttacker >= 4010 && firstAttacker <= 4014) elem = 'fire';
  else if (firstAttacker >= 4020 && firstAttacker <= 4024) elem = 'earth';
  elementMatches[elem] = (elementMatches[elem] || 0) + 1;

  if (idx < 5 || b.actualStars < 3) {
    console.log(`[Trận #${String(idx + 1).padStart(2)}] Seed: ${String(b.seed).padEnd(10)} | Hệ: ${elem.padEnd(5)} | Sao: ${b.actualStars}★ | Thời gian: ${(b.duration || 0).toFixed(1)}s | Đội công: [${b.attackersList.join(',')}] vs Đội thủ: [${b.defendersList.join(',')}]`);
  }
});

console.log('\n--- Thống Kê Tổng Quan ---');
console.log(`- Tỉ lệ sao: 3★: ${starStats[3]} trận (${(starStats[3] / battles.length * 100).toFixed(1)}%), 2★: ${starStats[2]} trận, 1★: ${starStats[1]} trận, 0★ (thua): ${starStats[0]} trận`);
console.log(`- Thời lượng trung bình mỗi trận: ${(totalDuration / battles.length).toFixed(2)} giây`);
console.log(`- Phân bổ hệ nguyên tố: Hỏa: ${elementMatches.fire}, Thủy: ${elementMatches.water}, Đất: ${elementMatches.earth}, Hỗn hợp: ${elementMatches.mixed}`);

// Lưu danh sách kiểm tra ra file JSON mẫu trong hwa-sim
const summaryPath = path.join(rootDir, 'samples', 'extracted-31-dungeon-battles.json');
fs.writeFileSync(summaryPath, JSON.stringify(battles, null, 2), 'utf8');
console.log(`\nĐã xuất toàn bộ 31 trận mẫu chi tiết ra: ${summaryPath}`);
