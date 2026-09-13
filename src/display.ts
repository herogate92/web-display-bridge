import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DisplayInfo, Rect } from './shared';
const exec = promisify(execFile);
export function selectVirtual(displays: DisplayInfo[], identity: string) {
  const candidates = displays.filter(d => d.identity === identity && d.virtual && !d.primary);
  if (candidates.length !== 1) throw new Error('지정한 가상 모니터를 고유하게 찾지 못했습니다. 드라이버 설치와 장치를 확인하세요.');
  return candidates[0];
}
export function matchRect<T extends { bounds: Rect }>(target: Rect, displays: T[]): T {
  const matches = displays.filter(d => ['x', 'y', 'width', 'height'].every(k => d.bounds[k as keyof Rect] === target[k as keyof Rect]));
  if (matches.length !== 1) throw new Error('가상 화면과 캡처 화면의 일치 여부를 확인하지 못했습니다. 전송을 중지합니다.');
  return matches[0];
}
export class DisplayHelper {
  constructor(private exe: string, private recoveryPath: string) {}
  async run<T>(...args: string[]): Promise<T> {
    const { stdout } = await exec(this.exe, args, { windowsHide: true, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
    const result = JSON.parse(stdout.replace(/^\uFEFF/, ''));
    if (result.error) throw new Error(result.error);
    return result;
  }
  list() { return this.run<DisplayInfo[]>('list'); }
  async activate(identity: string, width: number, height: number, fps: number) {
    selectVirtual(await this.list(), identity);
    return this.run<DisplayInfo>('activate', identity, String(width), String(height), String(fps), this.recoveryPath);
  }
  async deactivate(identity: string) {
    selectVirtual(await this.list(), identity);
    return this.run<{ deactivated: boolean }>('deactivate', identity);
  }
  restore() { return this.run<{ restored: boolean }>('restore', this.recoveryPath); }
}
