export interface StreamConfig { width: number; height: number; fps: number; bitrate: number }
export type UiLanguage = 'ko' | 'en';
export interface Rect { x: number; y: number; width: number; height: number }
export interface DisplayInfo {
  identity: string; name: string; description: string; virtual: boolean; active: boolean;
  primary: boolean; bounds: Rect; frequency: number; modes: { width: number; height: number; frequency: number }[];
}
export interface Signal { type: 'offer' | 'answer' | 'candidate' | 'restart' | 'leave' | 'stats'; data?: unknown; negotiation?: number; clientId?: string; sessionId?: string }
export interface SessionStatus { sessionId: string; state: string; message: string; config: StreamConfig; connected: boolean; clients?: number; stats?: Record<string, unknown> }
export interface HostApi {
  inspect(): Promise<{ displays: DisplayInfo[]; addresses: string[]; recovery: boolean; monitorCount: number; sessions: SessionStatus[] }>;
  start(identity: string, address: string, config: StreamConfig): Promise<{ url: string; qr: string; sessionId: string }>;
  stop(identity?: string): Promise<void>; recover(): Promise<void>; configureMonitorCount(count: number, language: UiLanguage): Promise<void>;
  signal(signal: Signal): void; report(stats: Record<string, unknown>): void;
  ready(sessionId: string): Promise<void>; fail(sessionId: string, message: string): void;
  onSignal(fn: (signal: Signal) => void): void;
  onCapture(fn: (sessionId: string, config: StreamConfig) => void): void;
  onStop(fn: (sessionId?: string) => void): void;
  onStatus(fn: (status: SessionStatus) => void): void;
  installCustomMode(width: number, height: number, fps: number, language: UiLanguage): Promise<void>;
  help(): Promise<void>;
}
