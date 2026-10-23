const t0 = Date.now();
const { build } = await import('vite');
try {
  await build({ configFile: process.cwd() + '/vite.config.js', logLevel: 'info' });
  console.log('BUILD OK in', Date.now()-t0, 'ms');
} catch (e) { console.log('ERR', e && e.message); }
