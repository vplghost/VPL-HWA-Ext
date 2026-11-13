import { onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';

/** Tick only while the view is mounted and active, including KeepAlive tabs. */
export function useNow(interval = 1000) {
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | undefined;
  function stop() { if (timer !== undefined) clearInterval(timer); timer = undefined; }
  function start() {
    now.value = Date.now();
    if (timer === undefined) timer = setInterval(() => { now.value = Date.now(); }, interval);
  }
  onMounted(start); onActivated(start); onDeactivated(stop); onUnmounted(stop);
  return now;
}
