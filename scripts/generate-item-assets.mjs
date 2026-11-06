#!/usr/bin/env node
// Compatibility entrypoint; shared sync uses the verified version catalog/manifest.
import { parseOptions, runSync } from './sync-cdn-assets.mjs';

await runSync({ ...parseOptions(process.argv.slice(2)), only: 'items' });
