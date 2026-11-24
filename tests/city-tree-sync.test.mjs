import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  extractMd5FromUrl,
  extractRemoteConfigSubset,
  parseRemoteDurationSeconds,
  compileBuildingLevels,
  compileResearchData,
  extractStrategicNames,
  detectCityTreeDrift,
  diffCityTreeData,
  applyCityTreeOverlay,
} from '../src/services/cityTreeSync.ts';
import { getBuildingLevelData } from '../src/data/buildingData.ts';
import { getResearchLevelData, getMaxLevel } from '../src/data/researchData.ts';
import { getBuildingName, getResearchName } from '../src/data/nameData.ts';
import { rpcCacheService } from '../src/core/cache/rpcCache.ts';

const root = resolve(process.cwd());

test('extractRemoteConfigSubset and parseRemoteDurationSeconds parse live remoteConfigInit schemas', () => {
  assert.equal(
    extractMd5FromUrl('https://hwmb-remote-config-cdn.nextersglobal.com/config/buildingLevel/f7c453c6bdcbf838cdad7784da97be10.json'),
    'f7c453c6bdcbf838cdad7784da97be10'
  );
  const subset = extractRemoteConfigSubset({
    buildingLevel: { url: 'https://hwmb-remote-config-cdn.nextersglobal.com/config/buildingLevel/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json' },
    personalResearchLevel: { url: 'https://hwmb-remote-config-cdn.nextersglobal.com/config/personalResearchLevel/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.json' },
    unrelatedKey: { url: 'https://example.com/ignored.json' },
  });
  assert.equal(subset.buildingLevel?.md5, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(subset.personalResearchLevel?.md5, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  assert.equal(subset.unrelatedKey, undefined);

  assert.equal(parseRemoteDurationSeconds('01:02:03'), 3723);
  assert.equal(parseRemoteDurationSeconds('1.02:00:00'), 93600);
  assert.equal(parseRemoteDurationSeconds(120), 120);
});

test('compileBuildingLevels, compileResearchData, and extractStrategicNames compile arbitrary new buildings & researches', () => {
  const { buildingLevels } = compileBuildingLevels([
    {
      buildingId: 901,
      level: 1,
      duration: '00:10:00',
      requirements: [
        { name: 'buildingLevel', args: { entityId: 20, operands: [15] } },
        { name: 'buildingLevel', args: { entityId: 901, operands: [0] } }, // self-req omitted
      ],
      cost: [{ type: 'material', id: 4, amount: 5000 }],
    },
  ]);
  assert.deepEqual(buildingLevels['901']['1'], {
    d: 600,
    r: [[20, 15]],
    c: { 4: 5000 },
  });

  const compiledRes = compileResearchData(
    [{ id: 950, type: 'battle' }],
    [
      {
        personalResearchId: 950,
        level: 1,
        duration: '00:30:00',
        requirements: [
          { name: 'buildingLevel', args: { entityId: 162, operands: [20] } },
          { name: 'personalResearchLevel', args: { entityId: 14, operands: [3] } },
        ],
        cost: [{ type: 'material', id: 1, amount: 1200 }],
      },
    ]
  );
  assert.equal(compiledRes['950'].t, 'battle');
  assert.deepEqual(compiledRes['950']['1'], {
    d: 1800,
    b: 20,
    r: [[14, 3]],
    c: { 1: 1200 },
  });

  const { buildingNames, researchNames } = extractStrategicNames(
    [{ id: 901, title: 'BUILDING_901_NAME' }],
    [{ id: 950, localizationKey: 'RESEARCH_950_NAME' }],
    {
      BUILDING_901_NAME: 'Sentinel of Dawn',
      RESEARCH_950_NAME: 'Sentinel Tactics I',
    }
  );
  assert.equal(buildingNames['901'], 'Sentinel of Dawn');
  assert.equal(researchNames['950'], 'Sentinel Tactics I');

  const diff = diffCityTreeData({
    prevBuildings: {},
    nextBuildings: buildingLevels,
    prevResearch: {},
    nextResearch: compiledRes,
    nextBuildingNames: buildingNames,
    nextResearchNames: researchNames,
  });
  assert.deepEqual(diff.addedBuildings, [{ id: 901, name: 'Sentinel of Dawn' }]);
  assert.deepEqual(diff.addedResearches, [{ id: 950, name: 'Sentinel Tactics I' }]);
});

test('detectCityTreeDrift catches silent MD5 hotfixes and unknown live IDs', () => {
  const report = detectCityTreeDrift({
    remoteConfigIndex: {
      buildingLevel: {
        url: 'https://hwmb-remote-config-cdn.nextersglobal.com/config/buildingLevel/11111111111111111111111111111111.json',
        md5: '11111111111111111111111111111111',
      },
    },
    manifest: {
      updatedAt: '2026-11-21T00:00:00Z',
      configs: {
        buildingLevel: {
          url: 'https://hwmb-remote-config-cdn.nextersglobal.com/config/buildingLevel/00000000000000000000000000000000.json',
          md5: '00000000000000000000000000000000',
        },
      },
    },
    liveBuildingIds: [20, 901],
    knownBuildingIds: new Set([20]),
  });

  assert.equal(report.hasDrift, true);
  assert.equal(report.changedConfigs.length, 1);
  assert.equal(report.changedConfigs[0].key, 'buildingLevel');
  assert.deepEqual(report.unknownBuildingIds, [901]);
});

test('applyCityTreeOverlay overrides static building, research, and name lookups and cleanly restores on reset', () => {
  assert.equal(getBuildingLevelData(9991, 1), null);
  assert.equal(getResearchLevelData(9992, 1), null);

  applyCityTreeOverlay({
    updatedAt: '2026-11-24T14:00:00Z',
    manifest: { updatedAt: '2026-11-24T14:00:00Z', configs: {} },
    buildingLevels: { '9991': { '1': { d: 300, c: { 4: 100 } } } },
    researchData: { '9992': { '1': { d: 600, b: 10 }, t: 'battle' } },
    buildingNames: { '9991': 'Sentinel of Flame' },
    researchNames: { '9992': 'Flame Mastery I' },
  });

  try {
    assert.equal(getBuildingLevelData(9991, 1)?.d, 300);
    assert.equal(getBuildingName(9991), 'Sentinel of Flame');
    assert.equal(getMaxLevel(9992), 1);
    assert.equal(getResearchLevelData(9992, 1)?.d, 600);
    assert.equal(getResearchName(9992), 'Flame Mastery I');
  } finally {
    applyCityTreeOverlay(null);
  }

  assert.equal(getBuildingLevelData(9991, 1), null);
  assert.equal(getResearchLevelData(9992, 1), null);
});

test('rpcCache passively captures remoteConfigInit into remoteConfigIndex and SettingsTab exposes sync UI', async () => {
  const endpoint = 'https://api.hero-wars-alliance.com/api/rpc';
  const merged = rpcCacheService.merge({}, [{
    endpoint,
    method: 'POST',
    status: 200,
    outcome: 'completed',
    timestamp: '2026-11-24T14:00:00.000Z',
    requestBody: JSON.stringify({ calls: [{ name: 'remoteConfigInit', args: { lang: 'en' }, ident: 'rc1' }] }),
    responseBody: JSON.stringify({
      results: [{
        ident: 'rc1',
        result: {
          response: {
            index: {
              configs: {
                buildingLevel: { url: 'https://hwmb-remote-config-cdn.nextersglobal.com/config/buildingLevel/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json' },
                strategicLocalization: { url: 'https://hwmb-remote-config-cdn.nextersglobal.com/config/strategicLocalization_en/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.json' },
              },
            },
          },
        },
      }],
    }),
  }]).cache;

  assert.equal(merged.remoteConfigIndex?.data?.configs?.buildingLevel?.md5, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(merged.remoteConfigIndex?.data?.configs?.strategicLocalization?.md5, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

  const settingsSrc = await readFile(resolve(root, 'src/components/tabs/SettingsTab.vue'), 'utf8');
  assert.ok(settingsSrc.includes('id="city-tree-sync-card"'));
  assert.ok(settingsSrc.includes('id="btn-sync-city-trees"'));
  assert.ok(settingsSrc.includes('id="btn-export-remote-config-index"'));
});
