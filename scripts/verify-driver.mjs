import { spawnSync } from 'node:child_process';
import path from 'node:path';
const ps = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0');
const result = spawnSync(path.join(ps, 'powershell.exe'), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/Verify-Driver.ps1', ...process.argv.slice(2)], {
  windowsHide: true, stdio: 'inherit', env: { ...process.env, PSModulePath: path.join(ps, 'Modules') }
});
if (result.error) throw result.error; process.exitCode = result.status ?? 1;
