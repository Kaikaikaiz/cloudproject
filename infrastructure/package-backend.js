import { services } from './services.js';
import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
for (const service of services) {
const result = await build({ entryPoints: [fileURLToPath(new URL(`../backend/src/cloud/handlers/${service}.js`, import.meta.url))], bundle: true, platform: 'node', target: 'node22', format: 'cjs', write: false });
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await writeFile(new URL(`./dist/relive-${service}.zip`, import.meta.url), zipSync({ 'index.cjs': result.outputFiles[0].contents }));
console.log(`Packaged relive-${service}.zip; handler index.handler`);
}
