const { post } = require('./bridge-cli');
const fs = require('fs');

async function runBatchSim() {
  const battles = JSON.parse(fs.readFileSync('hwa-sim/samples/extracted-31-dungeon-battles.json', 'utf8'));
  console.log(`Running batch simulation for ${battles.length} battles...`);

  // We can pass a batch of 5 battles to test first
  const testSet = battles.slice(0, 5);

  const evalBody = {
    code: `return (async () => {
      const mod = window.__hwaUnityInstance?.Module;
      const asm = mod.asm || mod;
      const table = mod.wasmTable || Object.values(asm).find(v => v instanceof WebAssembly.Table);
      const malloc = asm.Ol || asm.malloc || asm._malloc || mod._malloc;
      const free = asm.Pl || asm.free || asm._free || mod._free;

      const sym = {
        Play_ctor: 291996,
        Play_start: 292005,
        Play_get_result: 291998,
        Play_dispose: 291997,
        Presets_clanWarReplay: 291679,
        JSON_Parse: 133378,
        LazyDataObject_ctor: 274399,
        Object_ToString: 337342,
        MultiBattleResult_get_victory: 291573,
        MultiBattleResult_get_stars: 291577,
        MultiBattleResult_get_progress: 291578,
        MultiBattleResult_get_result: 291576,
        DataObject_asJson: 274798
      };

      const probePtr = table.get(sym.Presets_clanWarReplay)(1, 0);
      const strSamplePtr = table.get(sym.Object_ToString)(probePtr, 0);
      const stringClassPtr = new Uint32Array(mod.HEAPU8.buffer)[strSamplePtr >> 2];

      const forgeString = (str) => {
        const len = str.length;
        const ptr = malloc(16 + 2 * len) >>> 0;
        const u32 = new Uint32Array(mod.HEAPU8.buffer);
        const i32 = new Int32Array(mod.HEAPU8.buffer);
        const u16 = new Uint16Array(mod.HEAPU8.buffer);
        u32[ptr >> 2] = stringClassPtr;
        u32[(ptr + 4) >> 2] = 0;
        i32[(ptr + 8) >> 2] = len;
        const u16Start = (ptr + 12) >> 1;
        for (let i = 0; i < len; i++) u16[u16Start + i] = str.charCodeAt(i);
        u16[u16Start + len] = 0;
        return ptr;
      };

      const readString = (ptr) => {
        if (!ptr) return null;
        const len = new Int32Array(mod.HEAPU8.buffer)[(ptr + 8) >> 2];
        if (len < 0 || len > 2000000) return null;
        const u16Start = (ptr + 12) >> 1;
        const u16 = new Uint16Array(mod.HEAPU8.buffer);
        let s = '';
        for (let i = 0; i < len; i += 8192) {
          s += String.fromCharCode.apply(null, Array.from(u16.subarray(u16Start + i, u16Start + Math.min(len, i + 8192))));
        }
        return s;
      };

      const findClassByName = (className) => {
        const maxScan = Math.min(mod.HEAPU8.buffer.byteLength, 256 * 1024 * 1024);
        const cLen = className.length;
        for (let i = 1024; i < maxScan - 64; i += 4) {
          const candKlass = u32[i >> 2];
          if (candKlass > 65536 && candKlass < mod.HEAPU8.buffer.byteLength && (candKlass % 4 === 0)) {
            const namePtr = u32[(candKlass + 8) >> 2];
            if (namePtr > 65536 && namePtr + cLen < mod.HEAPU8.buffer.byteLength) {
              let match = true;
              for (let c = 0; c < cLen; c++) {
                if (u8[namePtr + c] !== className.charCodeAt(c)) { match = false; break; }
              }
              if (match && u8[namePtr + cLen] === 0) return candKlass;
            }
          }
        }
        return 0;
      };

      const u32 = new Uint32Array(mod.HEAPU8.buffer);
      const u8 = new Uint8Array(mod.HEAPU8.buffer);
      const lazyKlass = u32[0x15aacd4 >> 2] || findClassByName('LazyDataObject');
      const playKlass = findClassByName('BattleInstantPlay');

      const results = [];
      const battlesList = payload.battles || payload.payload?.battles;

      for (let i = 0; i < battlesList.length; i++) {
        const item = battlesList[i];
        const rawBattle = item.rawBattle;
        const isTitan = String(rawBattle?.type || '').toLowerCase().includes('titan');
        const presetPtr = table.get(sym.Presets_clanWarReplay)(isTitan ? 0 : 1, 0);

        const rawJson = JSON.stringify(rawBattle);
        const rawJsonPtr = forgeString(rawJson);
        const jsonNodePtr = table.get(sym.JSON_Parse)(rawJsonPtr, 0);
        free(rawJsonPtr);

        const lazyPtr = malloc(128) >>> 0;
        u8.fill(0, lazyPtr, lazyPtr + 128);
        u32[lazyPtr >> 2] = lazyKlass;
        table.get(sym.LazyDataObject_ctor)(lazyPtr, jsonNodePtr, 0);

        const playPtr = malloc(1024) >>> 0;
        u8.fill(0, playPtr, playPtr + 1024);
        u32[playPtr >> 2] = playKlass;

        try {
          table.get(sym.Play_ctor)(playPtr, lazyPtr, presetPtr, 0, 0, 0, 0);
          table.get(sym.Play_start)(playPtr, 0);

          let resultHandle = 0;
          const startWait = Date.now();
          while (!resultHandle && Date.now() - startWait < 5000) {
            resultHandle = table.get(sym.Play_get_result)(playPtr, 0);
            if (!resultHandle) await new Promise(r => setTimeout(r, 5));
          }

          if (!resultHandle) {
            results.push({ index: i, ok: false, error: 'Timeout waiting for result' });
            continue;
          }

          const victory = Boolean(table.get(sym.MultiBattleResult_get_victory)(resultHandle, 0));
          const stars = Number(table.get(sym.MultiBattleResult_get_stars)(resultHandle, 0));
          const progressPtr = table.get(sym.MultiBattleResult_get_progress)(resultHandle, 0);
          let progressJson = null;
          if (progressPtr) {
            const pStr = table.get(sym.DataObject_asJson)(progressPtr, 0);
            progressJson = readString(pStr);
          }

          results.push({
            index: i,
            ok: true,
            simWin: victory,
            simStars: stars,
            actualWin: item.actualWin,
            actualStars: item.actualStars,
            matches: victory === item.actualWin && stars === item.actualStars,
            hasProgress: !!progressJson
          });
        } catch (err) {
          results.push({ index: i, ok: false, error: String(err) });
        } finally {
          try { table.get(sym.Play_dispose)(playPtr, 0); } catch (_) {}
          try { free(playPtr); free(lazyPtr); } catch (_) {}
        }
      }

      return results;
    })()`,
    payload: {
      battles: testSet
    }
  };

  const res = await post('/eval', evalBody);
  console.log('Batch simulation results:', JSON.stringify(res, null, 2));
}

runBatchSim().catch(console.error);
