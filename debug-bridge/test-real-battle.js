const { post } = require('./bridge-cli');
const fs = require('fs');

async function testRealBattle() {
  const battles = JSON.parse(fs.readFileSync('hwa-sim/samples/extracted-31-dungeon-battles.json', 'utf8'));
  const sample = battles[0];

  const evalBody = {
    code: `return (async () => {
      let currentStep = 'init';
      const steps = [];
      try {
        const mod = window.__hwaUnityInstance?.Module;
        const asm = mod.asm || mod;
        const table = mod.wasmTable || Object.values(asm).find(v => v instanceof WebAssembly.Table);
        const malloc = asm.Ol || asm.malloc || asm._malloc || mod._malloc;
        const free = asm.Pl || asm.free || asm._free || mod._free;

        const sym = {
          Play_ctor: 291996,
          Play_start: 292005,
          Play_get_result: 291998,
          Play_createBattleData: 291995,
          Play_executeBattle: 292008,
          Play_createResult: 292009,
          Play_dispose: 291997,
          Presets_clanWarReplay: 291679,
          JSON_Parse: 133378,
          LazyDataObject_ctor: 274399,
          Object_ToString: 337342,
          BattleData_serializeResult: 274041,
          BattleData_getStars: 274030
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

        const battleObj = payload.rawBattle || payload.payload?.rawBattle;

        currentStep = 'Presets_clanWarReplay';
        const presetPtr = table.get(sym.Presets_clanWarReplay)(0, 0);
        steps.push({ currentStep, presetPtr: '0x' + presetPtr.toString(16) });

        currentStep = 'JSON_Parse';
        const rawJson = JSON.stringify(battleObj);
        const rawJsonPtr = forgeString(rawJson);
        const jsonNodePtr = table.get(sym.JSON_Parse)(rawJsonPtr, 0);
        free(rawJsonPtr);
        steps.push({ currentStep, jsonNodePtr: '0x' + jsonNodePtr.toString(16) });

        currentStep = 'LazyDataObject_ctor';
        const u32 = new Uint32Array(mod.HEAPU8.buffer);
        const u8 = new Uint8Array(mod.HEAPU8.buffer);
        const lazyKlass = u32[0x15aacd4 >> 2];
        const lazyPtr = malloc(128) >>> 0;
        u8.fill(0, lazyPtr, lazyPtr + 128);
        u32[lazyPtr >> 2] = lazyKlass;
        table.get(sym.LazyDataObject_ctor)(lazyPtr, jsonNodePtr, 0);
        steps.push({ currentStep, lazyPtr: '0x' + lazyPtr.toString(16) });

        currentStep = 'Play allocation';
        const playKlass = u32[0x159ffd0 >> 2];
        const playPtr = malloc(1024) >>> 0;
        u8.fill(0, playPtr, playPtr + 1024);
        u32[playPtr >> 2] = playKlass;
        steps.push({ currentStep, playPtr: '0x' + playPtr.toString(16), playKlass: '0x' + playKlass.toString(16) });

        currentStep = 'Play_ctor';
        table.get(sym.Play_ctor)(playPtr, lazyPtr, presetPtr, 0, 0, 0, 0);
        steps.push({ currentStep, done: true });

        currentStep = 'Play_start';
        table.get(sym.Play_start)(playPtr, 0);
        steps.push({ currentStep, done: true });

        currentStep = 'Play_get_result polling';
        let resultHandle = 0;
        const startWait = Date.now();
        while (!resultHandle && Date.now() - startWait < 5000) {
          resultHandle = table.get(sym.Play_get_result)(playPtr, 0);
          if (!resultHandle) await new Promise(r => setTimeout(r, 5));
        }
        steps.push({ currentStep, resultHandle: '0x' + resultHandle.toString(16) });

        currentStep = 'Play_createBattleData';
        const battleDataPtr = table.get(sym.Play_createBattleData)(playPtr, lazyPtr, 1, 0);
        steps.push({ currentStep, battleDataPtr: '0x' + battleDataPtr.toString(16) });

        currentStep = 'Play_executeBattle';
        table.get(sym.Play_executeBattle)(playPtr, 0);
        steps.push({ currentStep, done: true });

        currentStep = 'Play_createResult';
        table.get(sym.Play_createResult)(playPtr, 0);
        steps.push({ currentStep, done: true });

        currentStep = 'BattleData_serializeResult';
        const resultStrPtr = table.get(sym.BattleData_serializeResult)(battleDataPtr, 0);
        const resultJsonStr = readString(resultStrPtr);
        const stars = table.get(sym.BattleData_getStars)(battleDataPtr, 0);
        steps.push({ currentStep, stars, resultLen: resultJsonStr?.length });

        // Cleanup
        try { table.get(sym.Play_dispose)(playPtr, 0); } catch (_) {}

        return {
          ok: true,
          steps,
          stars,
          win: stars > 0,
          resultSummary: resultJsonStr?.substring(0, 300)
        };
      } catch (err) {
        return {
          ok: false,
          failedAtStep: currentStep,
          steps,
          error: String(err),
          isWasmException: err instanceof WebAssembly.Exception
        };
      }
    })()`,
    payload: {
      rawBattle: sample.rawBattle
    }
  };

  const res = await post('/eval', evalBody);
  console.log('Result:', JSON.stringify(res, null, 2));
}

testRealBattle().catch(console.error);
