# 열무(Yeolmu) 인터랙티브 웹툰

SVG 레이아웃과 스크롤 애니메이션으로 구성된 2D/3D 뷰어입니다. `index.html`, `style.css`, `main.js`, `pages.json`, `images/`만으로 정적 호스팅이 가능하므로 GitHub Pages 같은 정적 호스팅 서비스에서 바로 배포할 수 있습니다.

## 요구 사항
- Node.js 18 이상
- npm (또는 호환 패키지 관리자)

## 로컬 실행
1. 의존성 설치
   ```bash
   npm install
   ```
2. 정적 파일을 제공하는 로컬 서버 실행 (예: `serve`)
   ```bash
   npx serve .
   ```
   또는 원하는 정적 서버(`npx http-server .`, VS Code Live Server 등)를 사용해도 됩니다.
3. 브라우저에서 `http://localhost:3000`(또는 서버가 표시한 URL)로 접속해 동작을 확인합니다.

## GitHub 업로드 절차
1. GitHub에서 빈 저장소를 만듭니다. (예: `username/yeolmu-viewer`)
2. 현재 폴더에서 Git 초기화
   ```bash
   git init
   git add .
   git commit -m "초기 커밋"
   ```
3. 원격 저장소 연결 및 푸시
   ```bash
   git branch -M main
   git remote add origin https://github.com/<아이디>/<저장소>.git
   git push -u origin main
   ```

## GitHub Pages 배포
1. GitHub 저장소에서 `Settings` → `Pages`로 이동합니다.
2. **Build and deployment** 섹션에서
   - Source: `Deploy from a branch`
   - Branch: `main`, Folder: `/ (root)`
3. 저장하면 자동으로 정적 사이트가 생성되며, 수 분 뒤 `https://<아이디>.github.io/<저장소>` 주소가 활성화됩니다.
4. 이후 `main` 브랜치에 푸시할 때마다 페이지가 자동으로 갱신됩니다.

## 데이터/이미지 업데이트
- `images/`에 원본 페이지 이미지를, `images/thumbnails/`에 썸네일을 넣습니다.
- SVG로부터 `pages.json`을 다시 만들고 싶다면 `final.svg`를 수정한 뒤 아래 명령을 실행합니다.
  ```bash
  npm run generate
  ```
- 회전 정보 일괄 적용 또는 썸네일 생성을 자동화하려면 각각 `npm run apply-rotation`, `npm run generate-thumbnails`를 이용하세요.
- 데이터를 갱신한 뒤 변경 사항을 커밋/푸시하면 GitHub Pages가 새 콘텐츠를 서빙합니다.

## 주요 파일 구조
- `index.html` : 앱 마크업과 스켈레톤
- `style.css` : 전체 UI/애니메이션 스타일
- `main.js` : 페이지 로딩, 스크롤 트리거, UI 로직
- `pages.json` : 각 페이지의 위치/회전/경로 데이터
- `images/` : 실제 페이지 이미지
- `images/thumbnails/` : 전체보기/슬라이더에서 사용하는 썸네일
- `sel1.svg`, `sel2.svg` : 분기 선택 UI 아이콘
- `final.svg` : `pages.json`을 생성하기 위한 원본 SVG

## 배포 체크리스트
- [x] `.gitignore`로 `node_modules/` 등 불필요한 파일 제외
- [x] 모든 정적 자산을 상대 경로(`images/...`, `sel1.svg`)로 참조
- [x] `pages.json`, `images/`, `images/thumbnails/`가 같이 커밋되어야 함
- [x] GitHub Pages 설정이 `main` 브랜치 루트로 되어 있는지 확인

위 절차를 따르면 GitHub에 업로드한 즉시 GitHub Pages로 웹에서 감상할 수 있습니다.

