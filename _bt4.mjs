import { build } from 'esbuild';
console.log('esbuild start');
const t0 = Date.now();
const r = await build({
  entryPoints: [process.cwd() + '/vite.config.js'],
  bundle: true, format: 'esm', write: false, platform: 'node', target: 'node18',
  external: ['vite', '@vitejs/plugin-react'], logLevel: 'info'
});
console.log('esbuild done in', Date.now()-t0, 'ms, bytes=', r.outputFiles[0].contents.length);
