import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const root = process.cwd();
for (const dir of ['.cache/dotnet', '.cache/nuget', '.cache/appdata', '.cache/localappdata']) mkdirSync(dir, { recursive: true });
const env = { ...process.env, DOTNET_CLI_HOME: path.join(root, '.cache/dotnet'), NUGET_PACKAGES: path.join(root, '.cache/nuget'),
  APPDATA: path.join(root, '.cache/appdata'), LOCALAPPDATA: path.join(root, '.cache/localappdata'), DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1' };
const args = ['publish', 'native/DisplayHelper.csproj', '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '-o', 'native/publish', '--configfile', path.join(root, 'NuGet.Config')];
if (existsSync('.cache/nuget-feed/microsoft.net.illink.tasks.9.0.20.nupkg')) args.push('--source', path.join(root, '.cache/nuget-feed'), '-p:NuGetAudit=false');
const result = spawnSync('dotnet', args, { stdio: 'inherit', env, windowsHide: true });
if (result.error) throw result.error; process.exitCode = result.status ?? 1;
