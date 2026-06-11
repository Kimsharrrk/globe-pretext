# Matrix Globe: 3D/2D 하이브리드 공간 데이터 시각화 웹 서비스

![Matrix Globe Preview](https://img.shields.io/badge/WebGL-Three.js-black?style=for-the-badge&logo=threedotjs)
![Pretext](https://img.shields.io/badge/Text_Engine-Pretext-blue?style=for-the-badge)
![Vite](https://img.shields.io/badge/Bundler-Vite-purple?style=for-the-badge&logo=vite)

**Matrix Globe**는 전 세계의 인구 분포, 실시간 위성 궤도, 글로벌 네트워크 연결망을 웹 브라우저에서 직관적으로 탐색할 수 있는 인터랙티브 시각화 플랫폼입니다. 수만 개의 텍스트와 3D 오브젝트를 렌더링할 때 발생하는 성능 저하와 시각적 겹침(Clutter) 현상을 해결하기 위해, WebGL(Three.js)과 고성능 텍스트 레이아웃 엔진인 **Pretext**를 결합하여 개발되었습니다.

## ✨ 주요 기능

- **실시간 3D ↔ 2D 모핑 (Morphing) 애니메이션**: 입체적인 3D 지구본 뷰에서 데이터를 한눈에 파악하기 쉬운 2D 평면 지도로 부드럽게 변형시킬 수 있습니다.
- **Pretext 기반 고성능 텍스트 렌더링**: `@chenglou/pretext` 라이브러리의 `Dynamic Layout` 개념을 응용하여, 수천 개의 도시와 위성 라벨이 겹치지 않도록 실시간으로 레이아웃을 계산하고 Canvas 2D 위에서 초고속으로 렌더링합니다.
- **동적 네트워크 하이라이팅**: 특정 도시(노드)나 선을 클릭하면 해당 도시와 연결된 모든 네트워크 라우트만 밝게 강조되고, 나머지는 투명해져 복잡한 시각적 노이즈를 줄여줍니다.
- **실시간 인공위성 추적 (Web Worker)**: 메인 스레드의 부하를 줄이기 위해 Web Worker와 `satellite.js`를 사용하여 지구 저궤도(LEO)를 도는 인공위성 및 우주 쓰레기의 실시간 위치를 시뮬레이션합니다.
- **매트릭스 뷰 (Matrix Pretext Mode)**: 화려한 3D 그래픽 대신 텍스처를 제거하고 오직 투명한 국가 테두리(Wireframe)와 데이터 텍스트만 우주 공간에 띄워 정보에 온전히 집중할 수 있게 해주는 특수 모드입니다.

## 🚀 시작하기

### 필요 요구사항
- Node.js (v16 이상 권장)
- npm 또는 yarn

### 설치 및 실행

1. **저장소 클론:**
   ```bash
   git clone https://github.com/Kimsharrrk/globe-pretext.git
   cd globe-pretext
   ```

2. **패키지 설치:**
   ```bash
   npm install
   ```

3. **개발 서버 실행:**
   ```bash
   npm run dev
   ```

4. **웹 브라우저에서 확인:**
   `http://localhost:5173` 에 접속하여 프로젝트를 확인하세요.

## 🎮 조작 방법

- **회전 및 이동**: 지구본 또는 지도를 마우스 왼쪽 클릭 후 드래그합니다.
- **줌 인/아웃**: 마우스 휠을 사용하여 확대 및 축소합니다.
- **정보 확인**: 강조된 도시(스파이크) 또는 텍스트 라벨을 클릭하면 우측 상단에 인구수, 국가, 현지 시간 및 날씨가 팝업으로 나타납니다.
- **네트워크 추적**: 우주에 떠 있는 핑크빛 선을 클릭하면 해당 선이 연결된 도시 기준의 방사형 네트워크 망을 확인할 수 있습니다.
- **레이어 제어**: 좌측 대시보드 메뉴를 통해 3D 스파이크, 네트워크 선, 위성 등을 켜고 끄거나 2D 맵으로 전환할 수 있습니다.

## 🛠️ 기술 스택 (Built With)

- **[Three.js](https://threejs.org/)** - 핵심 3D WebGL 렌더링 및 카메라/오브젝트 제어
- **[Pretext](https://github.com/chenglou/pretext)** - 높은 성능의 Canvas 텍스트 레이아웃 충돌 방지 렌더링
- **[GSAP](https://greensock.com/gsap/)** - 부드러운 카메라 무빙 및 3D-2D 형상 보간(Morphing) 애니메이션 처리
- **[satellite.js](https://github.com/shashwatak/satellite-js)** - 실시간 위성 궤도 및 위치 연산 (SGP4/SDP4)
- **Vite** - 차세대 고속 프론트엔드 빌드 툴

---
*본 프로젝트는 원본 Pretext 라이브러리의 텍스트 엔진 기능을 확장하여, 대규모 공간 데이터 시각화 웹 서비스 목적으로 구현되었습니다.*
