# WebDisplay Bridge

Windows 가상 모니터 화면을 같은 네트워크의 iPad, iPhone, Android 브라우저로 전송하는 오픈 소스 앱입니다. Windows는 각 기기를 별도의 확장 디스플레이로 인식하므로 서로 다른 창을 올려놓고 PC의 키보드와 마우스로 조작할 수 있습니다.

> **Alpha:** 자동 테스트와 Windows 설치 파일 빌드는 통과했습니다. 여러 실제 모바일 기기의 동시 연결, 60fps, 지연 시간, 장시간 안정성은 아직 보장하지 않습니다. 측정 현황은 [검증 기록](docs/TEST-RESULTS.md)에 공개합니다.

## 주요 기능

- 가상 모니터 1~4대와 모바일 기기 1~4대의 독립 연결
- 화면마다 별도의 QR 코드와 큰 4자리 연결 번호
- PC 앱과 모바일 연결 화면의 한국어(기본값)·영어 선택
- 주소 첫 화면에서 4자리 번호 입력
- iPad 9용 1440×1080, 1080×810, 2160×1620 해상도와 직접 입력
- 화면별 해상도, 24~60fps, 최대 전송량 설정
- GPU 인코딩 우선 선택과 실제 인코더 표시, CPU 인코딩 시 화면별 경고
- H.264 우선, VP8 호환 WebRTC 영상 전송
- 앱 종료와 비정상 종료 후 Windows 화면 배치 복구
- 계정, 클라우드 서버, 외부 STUN/TURN 없음

소리는 PC에서 재생됩니다. 모바일 터치 입력, USB 연결, HDR, 인터넷 원격 접속은 지원하지 않습니다.

## 빠른 시작

1. 공식 [Virtual Display Driver 25.7.23](https://github.com/VirtualDrivers/Virtual-Display-Driver/releases/tag/25.7.23)의 Control 앱으로 드라이버를 설치합니다.
2. WebDisplay Bridge를 실행하고 가상 모니터 수를 선택한 뒤 **모니터 수 적용**을 누릅니다.
3. 각 화면 카드에서 해상도와 품질을 고르고 **연결 시작**을 누릅니다.
4. 모바일 기기를 PC와 같은 Wi-Fi에 연결합니다.
5. 카드의 QR을 스캔하거나 모바일 브라우저에서 `http://PC주소:8443`을 열어 4자리 번호를 입력합니다.

Windows 방화벽 질문에는 **개인 네트워크**만 허용하세요. 상세 설치, 커스텀 해상도, 복구 방법은 [설치와 연결](docs/SETUP.md)에 있습니다.

## 보안 범위

연결 페이지와 신호 교환은 로컬 HTTP/WS를 사용하고 영상은 WebRTC로 암호화됩니다. 4자리 번호는 5분 동안 한 번만 사용할 수 있으며, 화면 하나에는 기기 한 대만 연결됩니다. HTTP 구간의 번호와 연결 쿠키는 암호화되지 않으므로 신뢰하는 개인 네트워크에서만 사용하세요. 8443 포트를 인터넷에 전달하거나 공용·게스트 Wi-Fi에서 사용하지 마세요.

취약점 제보 방법은 [SECURITY.md](SECURITY.md)를 확인하세요.

## 개발과 빌드

Windows x64, Node.js 22.12 이상, .NET 9 SDK가 필요합니다. 드라이버는 설치 파일에 포함하지 않습니다.

```powershell
npm ci
npm run setup:electron
npm run build:native
npm run typecheck
npm test
npm start
```

Windows 설치 파일은 `npm run package`로 생성합니다. 현재 설치 파일에는 코드 서명이 없으므로 Windows SmartScreen 경고가 나타날 수 있습니다.

## 구조

- `src/main.ts`: Electron 창, 디스플레이 활성화·복구, 캡처와 서버 관리
- `native/`: Windows 디스플레이 식별, 활성화, 배치와 복구를 처리하는 C# 도우미
- `src/server.ts`: 로컬 연결 번호, HTTP/WS 신호 교환, 세션 제한
- `src/browser/`: PC WebRTC 송신과 모바일 브라우저 수신
- `docs/`: 설치, 드라이버 고정 정보, 실기 검증 절차

앱 데이터와 복구 기록은 Electron의 사용자 데이터 폴더에 저장합니다. 영상과 오디오는 저장하지 않습니다. 내부 환경 변수와 브리지 API에는 이전 개발판과의 호환을 위해 `WEBMONITOR_*` 및 `window.webmonitor` 이름이 남아 있습니다.

## 제3자 구성 요소

가상 디스플레이는 MIT 라이선스의 [Virtual Display Driver](https://github.com/VirtualDrivers/Virtual-Display-Driver)를 별도로 설치해 사용합니다. 이 저장소는 버전과 해시를 `driver.lock.json`에 고정하며 드라이버 바이너리를 배포하지 않습니다. 자세한 고지는 [제3자 구성 요소](docs/THIRD-PARTY.md)에 있습니다.

## 기여와 라이선스

개발 참여 방법은 [CONTRIBUTING.md](CONTRIBUTING.md)를 확인하세요. 이 프로젝트의 소스 코드는 [MIT License](LICENSE)로 배포합니다.
