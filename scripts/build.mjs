import { build } from 'esbuild';
await build({ entryPoints: ['src/browser/host.ts', 'src/browser/viewer.ts'], bundle: true, outdir: 'public', target: 'safari16', sourcemap: false });
