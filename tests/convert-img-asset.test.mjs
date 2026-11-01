import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { UNITY_TO_ETC, parseImg, convertImgBuffer } from '../scripts/convert-img-asset.mjs';

test('UNITY_TO_ETC defines expected texture format mappings', () => {
  assert.equal(UNITY_TO_ETC[34], 0, 'ETC_RGB4 -> ETC1_RGB');
  assert.equal(UNITY_TO_ETC[45], 1, 'ETC2_RGB -> ETC2_RGB');
  assert.equal(UNITY_TO_ETC[46], 4, 'ETC2_RGBA1 -> ETC2_RGBA1');
  assert.equal(UNITY_TO_ETC[47], 3, 'ETC2_RGBA8 -> ETC2_RGBA8');
});

test('convertImgBuffer throws on invalid buffer', () => {
  assert.throws(() => {
    parseImg(Buffer.from([0, 1, 2, 3]));
  }, /missing tex\.header or tex\.bytes/);
});
