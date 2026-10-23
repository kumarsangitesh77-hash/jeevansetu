const { loadConfigFromFile } = await import('vite');
console.log('loading config...');
const t0 = Date.now();
const r = await loadConfigFromFile({ command: 'build', mode: 'production' }, process.cwd() + '/vite.config.js', process.cwd());
console.log('loaded in', Date.now()-t0, 'ms; path=', r && r.path);
console.log('plugins:', r && r.config.plugins && r.config.plugins.length);
console.log('target:', r && r.config.build && r.config.build.target);
