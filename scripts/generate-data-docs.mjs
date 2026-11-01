import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const input = resolve(process.argv[2] ?? join(root, 'temp/tracking-data/hwa-api-2026-11-01_latest.json'));
const records = JSON.parse(await readFile(input, 'utf8'));
if (!Array.isArray(records)) throw new Error('Expected a JSON array of API records');

const snapshots = new Map();
for (const record of records) {
  if (record.endpoint !== 'https://api.hero-wars-alliance.com/api/rpc' ||
      record.requestBodyTruncated || record.responseBodyTruncated) continue;
  try {
    const request = JSON.parse(record.requestBody);
    const response = JSON.parse(record.responseBody);
    if (!Array.isArray(request.calls) || !Array.isArray(response.results)) continue;
    for (const call of request.calls) {
      const result = response.results.find((item) => item.ident === call.ident)?.result;
      if (result?.response == null) continue;
      const key = `${call.name}${call.feature ? `:${call.feature}` : ''}`;
      const previous = snapshots.get(key);
      if (!previous || record.timestamp >= previous.timestamp) {
        snapshots.set(key, { data: result.response, timestamp: record.timestamp });
      }
    }
  } catch (_) {
    // Only complete, parseable RPC pairs contribute to the tables.
  }
}

for (const key of ['heroGetAll', 'inventoryGet', 'titanGetAll', 'teamGetAll']) {
  if (!snapshots.has(key)) throw new Error(`Missing required RPC snapshot: ${key}`);
}

const number = (value) => typeof value === 'number' ? value.toLocaleString('en-US') : '—';
const byId = ([a], [b]) => Number(a) - Number(b);
const context = {};
runInNewContext(await readFile(join(root, 'extension/data-names.js'), 'utf8'), context);
runInNewContext(await readFile(join(root, 'extension/name-map.js'), 'utf8'), context);
runInNewContext(await readFile(join(root, 'extension/popup-data.js'), 'utf8'), context);
const nameMap = context.hwaHelperNameMap;
const popupData = context.hwaHelperPopupData;
const cell = (value) => String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
const source = `Nguồn: \`${input.replace(`${root}\\`, '').replaceAll('\\', '/')}\`. Đây là snapshot của một tài khoản, lấy từ response RPC; tên hiển thị lấy từ locale CDN đã đóng gói; nơi thiếu tên giữ ID. Không chép token, tên người chơi, chat hoặc mail.`;

const heroes = snapshots.get('heroGetAll');
const inventory = snapshots.get('inventoryGet');
const heroRows = Object.entries(heroes.data).sort(byId).map(([id, hero]) => {
  const { owned, needed } = popupData.heroSoulProgress(id, hero, inventory.data);
  return `| ${id} | ${cell(nameMap.hero(id))} | ${number(hero.level)} | ${number(hero.star)} | ${number(owned)} / ${typeof needed === 'number' ? number(needed) : needed ?? '—'} | ${number(hero.power)} | ${number(hero.color)} | ${number(hero.currentSkin)} |`;
});
await writeFile(join(root, 'docs/HEROES.md'), `# Bảng heroes\n\n${source}\n\nRPC: \`heroGetAll\` và \`inventoryGet.fragmentHero\`; cập nhật lúc \`${heroes.timestamp}\` và \`${inventory.timestamp}\`. Map được khóa bằng hero ID. Cột soul stone là số đang có / số cần để lên bậc sao kế tiếp; bậc 6 là tối đa. Giá nâng sao lấy từ \`enum_evolutionStar.json\` trong asset game 1.292.0.\n\n| Hero ID | Tên | Level | Star | Soul stone / cần | Power | Color | Current skin ID |\n| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |\n${heroRows.join('\n')}\n\nCác trường khác có mặt trong response: \`xp\`, \`slots\`, \`skills\`, \`runes\`, \`skins\`, \`artifacts\`, \`skinsInfo\`. Để cập nhật bảng: xuất log mới rồi chạy \`npm run docs:data -- <đường-dẫn-log.json>\`.\n`);

const itemSections = Object.entries(inventory.data).map(([category, entries]) => {
  const rows = Object.entries(entries ?? {}).sort(byId).map(([id, quantity]) =>
    `| ${id} | ${cell(nameMap.item(category, id))} | ${number(quantity)} |`
  );
  return `## ${category} (${rows.length} ID)\n\n| Item ID | Tên | Số lượng |\n| ---: | --- | ---: |\n${rows.join('\n')}`;
});
await writeFile(join(root, 'docs/ITEMS.md'), `# Bảng items\n\n${source}\n\nRPC: \`inventoryGet\`; cập nhật lúc \`${inventory.timestamp}\`. Response gồm các nhóm item; mỗi nhóm là map \`item ID → số lượng\`. ID có thể lặp giữa các nhóm nên khóa đầy đủ là \`(nhóm, ID)\`.\n\n${itemSections.join('\n\n')}\n\n\`getInventory\` với \`feature=inventory\` là schema riêng và không được trộn vào bảng trên. Để cập nhật bảng: xuất log mới rồi chạy \`npm run docs:data -- <đường-dẫn-log.json>\`.\n`);

const titans = snapshots.get('titanGetAll');
const titanRows = Object.entries(titans.data).sort(byId).map(([id, titan]) =>
  `| ${id} | ${cell(nameMap.hero(id))} | ${number(titan.level)} | ${number(titan.star)} | ${number(titan.power)} | ${number(titan.currentSkin)} |`
);
const teams = snapshots.get('teamGetAll');
const teamRows = popupData.teamRows(teams.data, nameMap).map(([mode, team, count, ids, names]) =>
  `| \`${mode}\` | ${team} | ${count} | ${ids} | ${cell(names)} |`);
const otherRows = [
  ['questGetAll', 'Nhiệm vụ', (data) => `mảng ${data.length} quest`],
  ['missionGetAll', 'Màn chơi', (data) => `mảng ${data.length} mission`],
  ['shopGetMany', 'Shop', (data) => `${Object.keys(data).length} shop`],
  ['offerGetAll', 'Ưu đãi', (data) => `mảng ${data.length} offer`],
  ['artifact_getAll', 'Artifact', (data) => `${Object.keys(data).length} entry`],
  ['skin_getAll', 'Skin', (data) => `${Object.keys(data).length} entry`],
  ['getInventory:inventory', 'Inventory phân hệ khác', (data) => Object.keys(data).join(', ')],
  ['clanBoss_getAll', 'Clan boss', (data) => Object.keys(data).join(', ')],
  ['clanWarGetBriefInfo', 'Clan war', (data) => Object.keys(data).join(', ')]
].map(([key, label, describe]) => {
  const entry = snapshots.get(key);
  return `| \`${key}\` | ${label} | ${entry ? describe(entry.data) : 'không có trong log'} | ${entry?.timestamp ?? '—'} |`;
});
await writeFile(join(root, 'docs/DATA-CATALOG.md'), `# Titan, đội hình và các nhóm dữ liệu khác\n\n${source}\n\n## Titans\n\nRPC \`titanGetAll\`; cập nhật lúc \`${titans.timestamp}\`.\n\n| Titan ID | Tên | Level | Star | Power | Current skin ID |\n| ---: | --- | ---: | ---: | ---: | ---: |\n${titanRows.join('\n')}\n\n## Đội hình\n\nRPC \`teamGetAll\`; cập nhật lúc \`${teams.timestamp}\`. Mỗi đội lồng nhau có một dòng riêng. Tên tra theo ID từ locale đã đóng gói; ID thiếu tên hiện dưới dạng \`#ID\`.\n\n| Chế độ | Đội | Số thành viên | Hero/Titan ID | Tên heroes/titans |\n| --- | ---: | ---: | --- | --- |\n${teamRows.join('\n')}\n\n## Các snapshot khác\n\n| RPC | Nhóm | Hình dạng dữ liệu quan sát | Cập nhật UTC |\n| --- | --- | --- | --- |\n${otherRows.join('\n')}\n\n## Phương pháp lấy và cập nhật dữ liệu\n\n1. Extension quan sát \`POST https://api.hero-wars-alliance.com/api/rpc\`, không tự gửi RPC. Request chứa \`calls[{name, feature?, args, ident}]\`; response chứa \`results[{ident, result.response}]\`. Ghép call/result bằng \`ident\`.\n2. Chỉ lấy response hoàn chỉnh (HTTP 200, body JSON đọc được và không bị cắt). Mỗi phương thức giữ snapshot mới nhất theo thời điểm. Các bảng heroes/items/titans/teams là trạng thái tại một thời điểm, không phải danh mục tên chính thức.\n3. Trong extension, cache tự cập nhật khi game phát sinh RPC phù hợp. Khi cache rỗng, popup tự nạp lại một lần từ log cục bộ đã lưu. Extension chỉ cập nhật cache từ RPC do game tự phát sinh; không gửi RPC theo lịch, không gọi API game để làm mới dữ liệu và không tải lại trang.\n4. Để làm mới tài liệu, xuất log JSON rồi chạy \`npm run docs:data -- <đường-dẫn-log.json>\`. Chỉ các trường đã chọn được ghi vào tài liệu; kiểm tra bảng trước khi commit vì đây là dữ liệu của tài khoản cá nhân.\n\nGiới hạn: log hiện chưa chứa response body cho GET như \`api.aghanim.com/sdk/v1/items\`; dữ liệu GET đó không thể tạo thành bảng từ mẫu này.\n`);

console.log(`Generated heroes (${heroRows.length}), item groups (${itemSections.length}), titans (${titanRows.length}), and teams (${teamRows.length})`);
