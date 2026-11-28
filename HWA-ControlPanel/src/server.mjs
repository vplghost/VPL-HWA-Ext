import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createControlPanelServer } from './app.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT) || 8080;
const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '../data');

function getLanIpv4Addresses() {
  const result = [];
  const ifaces = os.networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    for (const info of entries || []) {
      if (info.family === 'IPv4' && !info.internal) {
        result.push(info.address);
      }
    }
  }
  return result;
}

const instance = createControlPanelServer({ dataDir });
await instance.start(port, host);

console.log('HWA Control Panel Server running');
console.log(`  Local: http://localhost:${port}`);
for (const ip of getLanIpv4Addresses()) {
  console.log(`  LAN:   http://${ip}:${port}`);
}
console.log(`  DB:    ${path.join(dataDir, 'control-panel.db')}`);

const shutdown = async () => {
  await instance.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
