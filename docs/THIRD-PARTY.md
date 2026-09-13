# 제3자 구성 요소

가상 모니터 드라이버는 앱에 포함하지 않습니다. 공식 릴리스 25.7.23을 별도 설치합니다.

- 저장소: https://github.com/VirtualDrivers/Virtual-Display-Driver
- 라이선스 확인 위치: https://github.com/VirtualDrivers/Virtual-Display-Driver/blob/25.7.23/LICENSE
- 드라이버 ZIP: `VirtualDisplayDriver-x86.Driver.Only.zip`. 파일명은 x86이나 INF의 대상은 `NTamd64`(Windows x64)입니다.
- ZIP SHA-256: `e24210692b442b39af763536330ce78b423f19342b7a7792c26de3944e418b3a`
- CAT와 DLL: Windows Authenticode 검사 `Valid`, 서명자 `SignPath Foundation`.
- 서명 인증서 지문: `3CF8CF26D8BA266C3A483AB7D26D4A818E317D76`.
- 유효 서명 확인은 이 PC에서 드라이버 설치·Secure Boot 호환성이 검증되었다는 의미가 아닙니다. 실제 설치는 Windows의 드라이버 검사를 거칩니다.

다음 MIT 고지는 드라이버의 설정 예제를 함께 제공하기 위해 보존합니다.

MIT License

Copyright (c) 2024 Virtual Display

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Electron에는 Chromium 등 제3자 구성 요소가 포함되며 설치 폴더의 `LICENSES.chromium.html`에서 고지를 확인할 수 있습니다. npm 구성 요소의 고지는 해당 패키지에 보존됩니다. 설치 파일의 앱 자체 코드 서명은 구성하지 않았습니다.
