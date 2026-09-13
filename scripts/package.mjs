import { spawnSync } from 'node:child_process';
import path from 'node:path';
const result = spawnSync(process.execPath, ['node_modules/electron-builder/out/cli/cli.js', '--win', 'nsis', '--x64'], {
  windowsHide: true, stdio: 'inherit', env: { ...process.env, ELECTRON_BUILDER_CACHE: path.resolve('.cache/electron-builder'), ELECTRON_CACHE: path.resolve('.cache/electron') }
});
if (result.error) throw result.error; process.exitCode = result.status ?? 1;
