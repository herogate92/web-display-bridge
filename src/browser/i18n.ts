export type Language = 'ko' | 'en';

const ko = {
  gpuPreferred: 'GPU 인코딩 우선 · 연결 후 실제 사용 여부를 확인합니다.',
  gpuActive: 'GPU 하드웨어 인코딩 사용 중', cpuActive: 'CPU 소프트웨어 인코딩 사용 중',
  encoderUnknown: '인코딩 방식 확인 불가 · GPU 사용 여부를 확인하지 못했습니다.',
  cpuEncodingWarning: 'GPU 우선으로 연결했지만 현재 CPU로 영상을 압축하고 있습니다. 여러 화면에서 끊김이나 CPU 사용량 증가가 생길 수 있습니다. GPU 드라이버를 확인하거나 해상도·프레임률을 낮춰 보세요.',
  language: '언어', checkingDisplays: '가상 모니터를 확인하고 있습니다…', recoveryNeeded: '이전 화면 설정을 복구해야 합니다.',
  recoverAll: '전체 화면 복구', monitorCount: '가상 모니터 수', applyCount: '모니터 수 적용', networkAddress: 'PC의 Wi-Fi / LAN 주소',
  refresh: '다시 확인', stopAll: '전체 연결 종료', noDriver: '가상 모니터가 없습니다. 공식 드라이버를 설치하세요.',
  officialDownload: '공식 다운로드', connectionHelp: '연결이 안 되나요?', sameWifiHelp: '모바일 기기에서 PC와 같은 Wi-Fi를 사용하고, Windows 방화벽의 개인 네트워크에서 WebDisplay Bridge를 허용하세요.',
  separateCodeHelp: '각 QR과 4자리 번호는 해당 가상 화면 한 대에만 연결됩니다.',
  footer: '소리는 PC에서 재생됩니다. Windows 디스플레이 설정에서 가상 화면 위치를 원하는 곳으로 옮길 수 있습니다.',
  virtualScreen: '가상 화면 {count}', activeWaiting: '화면 활성 · 연결 대기', ready: '연결 준비',
  ipadFast: '아이패드 9 · 빠름', ipadRecommended: '아이패드 9 · 권장', ipadNative: '아이패드 9 · 패널 해상도',
  resolution: '해상도', frameRate: '프레임률', maxBitrate: '최대 전송량 (Mbps)', customResolution: '해상도 직접 입력',
  width: '가로', height: '세로', fpsInput: 'fps', customConnect: '입력값으로 연결', startScreen: '이 화면 연결 시작', stopScreen: '이 화면 종료',
  pairCode: '4자리 인증번호', qrAlt: '이 화면 연결 QR', addressAfterStart: '연결 시작 후 주소가 표시됩니다.',
  oneDeviceHelp: '같은 Wi-Fi · 이 화면에는 기기 한 대 연결', connectedDevices: '연결 기기', actualFps: '실제 fps',
  bitrate: '전송량', codecEncoder: '코덱 / 인코더', deviceCount: '{count}대', primary: '기본', virtual: '가상', physical: '일반',
  displaySummary: '{count}개의 가상 모니터 · 화면별로 연결할 수 있습니다.', inspectFailed: '모니터 조회 실패: {detail}',
  invalidSettings: '화면 설정을 확인하세요.', modeNotApplied: '{width}×{height} {fps}fps 모드가 VDD에 적용되지 않았습니다.',
  addingMode: '사용자 해상도를 VDD에 추가하고 있습니다.', captureEnded: '가상 화면 캡처가 종료되었습니다.',
  captureFailed: '화면 캡처 실패: {detail}', unavailable: '확인 불가', checking: '확인 중', connectionFailed: '영상 연결 실패: {detail}',
  applyingCount: '가상 모니터 수를 변경하고 있습니다…',
  viewerTitle: 'WebDisplay Bridge 화면', viewerHeadline: '작업 공간을 넓히세요.', viewerCodeLabel: 'PC 화면의 연결 번호',
  fourDigits: '4자리 숫자를 입력하세요.', connectPlay: '연결 / 재생', play: '재생', reconnect: '다시 연결',
  viewerHelp: 'PC의 키보드·마우스로 조작하세요. 소리는 PC에서 재생됩니다.', waitingConnection: '연결 대기',
  fullscreen: '전체 화면', disconnect: '연결 끊기', pressPlay: '재생 버튼을 눌러 화면을 표시하세요.',
  connected: '확장 화면 연결됨', pathLost: '영상 경로가 끊겼습니다. 다시 연결 중…', connecting: '가상 화면 연결 중…',
  retryVideo: '영상 연결을 다시 시도합니다.', checkConnection: '연결을 확인하세요. 연결 코드가 만료되었거나 네트워크 연결이 끊겼을 수 있습니다.',
  newQr: 'PC에서 연결을 다시 시작하고 새 QR을 스캔하세요.', waitForPc: 'PC 연결을 기다립니다. 같은 Wi-Fi인지 확인하세요.',
  unsupportedWebRtc: '이 브라우저는 WebRTC 화면 수신을 지원하지 않습니다.', enterCode: 'PC 화면의 4자리 연결 번호를 입력하세요.',
  fitSafari: '브라우저 화면 크기에 맞춰 표시합니다.', viewerStopped: '모바일 기기 연결을 종료했습니다. PC에서 연결 종료를 누르면 화면 배치가 복구됩니다.',
  pressConnect: '연결 / 재생을 누르세요.', tooManyAttempts: '연결 번호 입력 횟수를 초과했습니다. 1분 뒤 다시 시도하세요.',
  badCode: '연결 번호가 틀렸거나 만료되었거나 이미 사용 중입니다.', operationFailed: '작업에 실패했습니다. PC 앱의 진단 로그를 확인하세요.',
  windowsError: 'Windows 오류 {code}. PC 앱의 진단 로그를 확인하세요.',
  recoveryFailed: '화면 복구가 필요합니다: {detail}', driverUnsupported: '드라이버가 {mode} 모드를 지원하지 않습니다.',
  modeMissing: '드라이버에 {mode} 모드가 없습니다. 드라이버 설정에서 추가하세요.', vddFailed: 'VDD 설정 작업이 완료되지 않았습니다 (코드 {code}).'
} as const;

const en: Record<keyof typeof ko, string> = {
  gpuPreferred: 'GPU encoding preferred · Actual encoder is checked after connecting.',
  gpuActive: 'GPU hardware encoding active', cpuActive: 'CPU software encoding active',
  encoderUnknown: 'Encoder type unavailable · GPU use could not be verified.',
  cpuEncodingWarning: 'GPU encoding was preferred, but this display is using CPU software encoding. Multiple displays may stutter or increase CPU usage. Check the GPU driver or try a lower resolution or frame rate.',
  language: 'Language', checkingDisplays: 'Checking virtual displays…', recoveryNeeded: 'The previous display layout needs to be restored.',
  recoverAll: 'Restore displays', monitorCount: 'Virtual displays', applyCount: 'Apply display count', networkAddress: 'PC Wi-Fi / LAN address',
  refresh: 'Refresh', stopAll: 'Disconnect all', noDriver: 'No virtual display found. Install the official driver.',
  officialDownload: 'Official download', connectionHelp: 'Having trouble connecting?', sameWifiHelp: 'Use the same Wi-Fi network as the PC and allow WebDisplay Bridge on private networks in Windows Firewall.',
  separateCodeHelp: 'Each QR code and 4-digit code connects to one virtual display.',
  footer: 'Audio plays on the PC. You can move virtual displays in Windows Display settings.',
  virtualScreen: 'Virtual display {count}', activeWaiting: 'Display active · Waiting', ready: 'Ready to connect',
  ipadFast: 'iPad 9 · Fast', ipadRecommended: 'iPad 9 · Recommended', ipadNative: 'iPad 9 · Native resolution',
  resolution: 'Resolution', frameRate: 'Frame rate', maxBitrate: 'Maximum bitrate (Mbps)', customResolution: 'Custom resolution',
  width: 'Width', height: 'Height', fpsInput: 'fps', customConnect: 'Connect with these values', startScreen: 'Connect this display', stopScreen: 'Stop this display',
  pairCode: '4-digit pairing code', qrAlt: 'QR code for this display', addressAfterStart: 'The address will appear after you start.',
  oneDeviceHelp: 'Same Wi-Fi · One device per display', connectedDevices: 'Connected devices', actualFps: 'Actual fps',
  bitrate: 'Bitrate', codecEncoder: 'Codec / encoder', deviceCount: '{count} device(s)', primary: 'Primary', virtual: 'Virtual', physical: 'Physical',
  displaySummary: '{count} virtual display(s) · Connect each one separately.', inspectFailed: 'Could not inspect displays: {detail}',
  invalidSettings: 'Check the display settings.', modeNotApplied: '{width}×{height} {fps}fps was not applied to VDD.',
  addingMode: 'Adding the custom resolution to VDD.', captureEnded: 'Virtual display capture stopped.',
  captureFailed: 'Screen capture failed: {detail}', unavailable: 'Unavailable', checking: 'Checking', connectionFailed: 'Video connection failed: {detail}',
  applyingCount: 'Changing the number of virtual displays…',
  viewerTitle: 'WebDisplay Bridge display', viewerHeadline: 'Expand your workspace.', viewerCodeLabel: 'Pairing code shown on the PC',
  fourDigits: 'Enter the 4-digit code.', connectPlay: 'Connect / Play', play: 'Play', reconnect: 'Reconnect',
  viewerHelp: 'Use the PC keyboard and mouse. Audio plays on the PC.', waitingConnection: 'Waiting to connect',
  fullscreen: 'Full screen', disconnect: 'Disconnect', pressPlay: 'Press Play to show the display.',
  connected: 'Extended display connected', pathLost: 'Video connection lost. Reconnecting…', connecting: 'Connecting to virtual display…',
  retryVideo: 'Retrying the video connection.', checkConnection: 'Check the connection. The code may have expired or the network may be unavailable.',
  newQr: 'Start the connection again on the PC and scan the new QR code.', waitForPc: 'Waiting for the PC. Check that both devices use the same Wi-Fi.',
  unsupportedWebRtc: 'This browser does not support receiving WebRTC video.', enterCode: 'Enter the 4-digit pairing code shown on the PC.',
  fitSafari: 'Fitting the video to the browser window.', viewerStopped: 'Disconnected this mobile device. Stop the display on the PC to restore its layout.',
  pressConnect: 'Press Connect / Play.', tooManyAttempts: 'Too many attempts. Try again in one minute.',
  badCode: 'The code is invalid, expired, or already in use.', operationFailed: 'The operation failed. Check the PC app diagnostics.',
  windowsError: 'Windows error {code}. Check the PC app diagnostics.',
  recoveryFailed: 'Display recovery is required: {detail}', driverUnsupported: 'The driver does not support {mode}.',
  modeMissing: 'The driver does not contain {mode}. Add it in the driver settings.', vddFailed: 'VDD configuration failed (exit code {code}).'
};

export type TranslationKey = keyof typeof ko;

function savedLanguage(): Language {
  try { return localStorage.getItem('webdisplay-language') === 'en' ? 'en' : 'ko'; }
  catch { return 'ko'; }
}
let current: Language = savedLanguage();
export function language() { return current; }
export function setLanguage(value: Language) {
  current = value;
  try { localStorage.setItem('webdisplay-language', value); } catch { /* Keep the current session language if storage is unavailable. */ }
  if (typeof document !== 'undefined') document.documentElement.lang = value;
}
export function t(key: keyof typeof ko, values: Record<string, string | number> = {}) {
  const template = current === 'ko' ? ko[key] : en[key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''));
}
export function translateBackend(value: unknown): string {
  const raw = (value instanceof Error ? value.message : String(value))
    .replace(/^Error invoking remote method '[^']+': Error: /, '').replace(/^Error: /, '');
  if (current === 'ko' || !/[가-힣]/.test(raw)) return raw;
  if (raw.startsWith('화면 복구가 필요합니다: '))
    return t('recoveryFailed', { detail: translateBackend(raw.slice('화면 복구가 필요합니다: '.length)) });
  if (raw.startsWith('화면 캡처 실패: '))
    return t('captureFailed', { detail: translateBackend(raw.slice('화면 캡처 실패: '.length)) });
  const exact: Record<string, string> = {
    '연결 준비': t('ready'), '가상 화면을 준비하고 있습니다.': 'Preparing the virtual display.',
    '모바일 기기와 영상 연결 중입니다.': 'Connecting video to the mobile device.',
    '확장 화면 전송 중입니다.': 'Streaming the extended display.',
    '연결이 끊겼습니다. 60초 동안 재연결을 기다립니다.': 'Disconnected. Waiting up to 60 seconds to reconnect.',
    '재연결 대기 시간이 지나 해당 화면을 종료했습니다.': 'Reconnect timed out. This display was stopped.',
    '해당 확장 화면 연결을 종료했습니다.': 'This display was disconnected.',
    '모든 연결을 종료하고 화면을 복구했습니다.': 'All connections stopped and the display layout was restored.',
    '가상 모니터 수 변경을 위해 연결을 종료했습니다.': 'Connections stopped to change the display count.',
    '사용자 해상도 추가를 위해 전송을 종료했습니다.': 'Streaming stopped to add the custom resolution.',
    '준비되었습니다. 이 화면의 QR 또는 번호로 연결하세요.': 'Ready. Connect using this display’s QR code or pairing code.',
    'PC 절전으로 연결을 종료했습니다. 복귀 후 다시 연결하세요.': 'The PC went to sleep. Connect again after it wakes.',
    '화면 전송 프로세스가 종료되었습니다.': 'The streaming process stopped.',
    '앱 시작 실패로 화면 설정을 복구했습니다.': 'App startup failed; the display layout was restored.',
    '화면 설정을 확인하세요.': t('invalidSettings'), '가상 화면 캡처가 종료되었습니다.': t('captureEnded'),
    '연결 번호 입력 횟수를 초과했습니다. 1분 뒤 다시 시도하세요.': t('tooManyAttempts'),
    '연결 번호가 틀렸거나 만료되었거나 이미 사용 중입니다.': t('badCode'),
    '가상 모니터의 캡처 소스를 찾지 못했습니다.': 'Could not find the virtual display capture source.',
    '가상 화면과 캡처 화면의 일치 여부를 확인하지 못했습니다. 전송을 중지합니다.': 'Could not verify the capture source. Streaming stopped.',
    '지정한 가상 모니터를 고유하게 찾지 못했습니다. 드라이버 설치와 장치를 확인하세요.': 'Could not uniquely identify the virtual display. Check the driver and device.',
    '연결 설정이 올바르지 않습니다.': 'Invalid connection settings.',
    '화면 캡처 시작 시간이 초과되었습니다.': 'Screen capture timed out.',
    '가상 모니터 수가 적용되지 않아 이전 개수로 복구했습니다.': 'The display count did not apply. The previous count was restored.',
    '가상 모니터가 비활성화되었습니다.': 'The virtual display is inactive.',
    '화면 세션이 종료되었습니다.': 'The display session has ended.',
    '실행 중인 다른 화면과 같은 PC 네트워크 주소를 선택하세요.': 'Select the same PC network address as the other active display.',
    '가상 모니터 수는 1~4대만 가능합니다.': 'You can use 1 to 4 virtual displays.',
    '가로 640~3840, 세로 480~2160의 짝수와 24~60fps를 입력하세요.': 'Enter even dimensions from 640×480 to 3840×2160 and 24–60fps.',
    '가상 모니터의 장치 식별자가 없거나 중복되었습니다. 기본 화면은 변경하지 않습니다.': 'The virtual display identifier is missing or duplicated. The primary display was not changed.',
    '이전 화면 복구 기록이 있습니다. 복구 후 다시 연결하세요.': 'A previous display recovery record exists. Restore the layout before connecting.',
    '허용 범위를 벗어난 화면 모드입니다.': 'The display mode is outside the supported range.',
    '기존 화면 설정을 읽지 못했습니다.': 'Could not read the current display settings.',
    '유지할 기존 모니터를 찾지 못했습니다.': 'Could not find a physical display to keep active.',
    '화면 확장 결과가 요청과 다릅니다. 복구를 실행하세요.': 'The extended display did not match the request. Restore the layout.',
    '복구 기록을 읽지 못했습니다.': 'Could not read the display recovery record.',
    '알 수 없는 복구 기록 버전입니다.': 'Unknown display recovery record version.',
    '복구 결과를 확인하지 못했습니다. 복구 기록을 유지합니다.': 'Could not verify recovery. The recovery record was kept.'
  };
  for (const [source, translated] of Object.entries(exact)) {
    if (raw === source || raw.endsWith(': ' + source)) return translated;
  }
  const unsupported = /^드라이버가 (.+)를 지원하지 않습니다\.$/.exec(raw);
  if (unsupported) return t('driverUnsupported', { mode: unsupported[1] });
  const missing = /^드라이버에 (.+) 모드가 없습니다\. 드라이버 설정에서 추가하세요\.$/.exec(raw);
  if (missing) return t('modeMissing', { mode: missing[1] });
  const vddCode = /^VDD 설정 작업이 완료되지 않았습니다 \(코드 (-?\d+)\)\.$/.exec(raw);
  if (vddCode) return t('vddFailed', { code: vddCode[1] });
  const windowsCode = /Windows (?:오류|코드)\s*(-?\d+)/.exec(raw);
  if (windowsCode) return t('windowsError', { code: windowsCode[1] });
  console.warn('Untranslated device error:', raw);
  return t('operationFailed');
}
