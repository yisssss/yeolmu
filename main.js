// main.js

// 🎯 디버그 모드 (false로 설정 시 모든 콘솔 로그 비활성화)
const DEBUG = true; // 디버깅 모드 활성화

const viewer = document.getElementById('viewer');
const pageStage = document.getElementById('pageStage');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');
const sliderInput = document.getElementById('sliderInput');
const sliderMax = document.getElementById('sliderMax');
const sliderTooltip = document.getElementById('sliderTooltip');
const overviewToggle = document.getElementById('overviewToggle');
const appTitle = document.getElementById('appTitle');
const menuToggle = document.getElementById('menuToggle');
const menuPanel = document.getElementById('menuPanel');
const infoToggle = document.getElementById('infoToggle');
const infoPanel = document.getElementById('infoPanel');
const BASE_VIEW_SCALE = 1.4;

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);

// [🔥추가] cameraWrapper와 viewer에 preserve-3d 설정
// 브라우저가 거대한 컨테이너를 한 장의 비트맵으로 합치지 않도록 방지
gsap.set(['#cameraWrapper', '#viewer'], {
    transformStyle: "preserve-3d", // ✅ 핵심: 자식요소들을 평면으로 압축하지 않음
    force3D: false // 부모는 가속 끄기 (자식들이 preserve-3d로 처리됨)
});

gsap.set(viewer, {
    x: 0, y: 0,
    transformOrigin: `${innerWidth / 2}px ${innerHeight / 2}px`,
    force3D: false // ✅ 부모 컨테이너는 3D 가속 끄기 (거대한 영역은 GPU 레이어 한계 초과 방지)
});

gsap.set('#cameraWrapper', {
    scale: BASE_VIEW_SCALE,
    transformOrigin: `${innerWidth / 2}px ${innerHeight / 2}px`,
    force3D: false
});

// 선택지 경로 변수 (p70에서 선택한 경로)
let selectedPath = null; // 'path1' (p71~p82) or 'path2' (p83~p95) or null
let isAllPagesMode = false; // '모두보기' 모드 실행 중 플래그

// 페이지 dim 효과 업데이트 함수
function updatePageDimming(currentPageEl) {
    // 모든 페이지를 순회하며 dim 처리
    pages.forEach(page => {
        if (page && page !== currentPageEl) {
            page.classList.add('dimmed');
        } else if (page === currentPageEl) {
            page.classList.remove('dimmed');
        }
    });
}

function centerCameraOn(el, dur = 0.8, targetIndex = -1, skipUnlock = false, onDone = null) {

    // ✅ 다른 페이지로 카메라를 옮기기 전에,
    // 이전 special 페이지의 스크롤 트리거가 남아 있으면 완전히 정리
    if (activeScrollPageEl && activeScrollPageEl !== el) {
        killSpecialScroll();
    }

    const actualPageId = el.dataset.pageId || pageBases[current];

    const cfg = getPageDataFromJSON(actualPageId) || pageConfigs[pageTypeMap[actualPageId] || 'basic'];
    const scrollPts = cfg.getScrollPoints();
    const first = scrollPts[0];

    const rx = first.x;
    const ry = first.y;

    const tx = innerWidth / 2 - rx;
    const ty = innerHeight / 2 - ry;

    const currentX = gsap.getProperty(viewer, 'x');
    const currentY = gsap.getProperty(viewer, 'y');

    const deltaX = tx - currentX;
    const deltaY = ty - currentY;

    const currentRotation = gsap.getProperty(cameraWrapper, 'rotation');
    const pageRotation = el._rot || 0;
    // 카메라는 페이지 회전의 반대 방향으로 회전해야 페이지가 똑바로 보임
    const targetRotation = -pageRotation;
    
    let delta = targetRotation - currentRotation;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    const shortestRotation = currentRotation + delta;
    
    // 🔍 디버그 로그
    if (DEBUG) console.log(`📐 [회전] 페이지ID: ${actualPageId} | 페이지 회전: ${pageRotation}° | 카메라 현재: ${currentRotation.toFixed(1)}° | 카메라 목표: ${targetRotation}° | 최종: ${shortestRotation.toFixed(1)}°`);
    
    // 상태 업데이트는 즉시 수행 (애니메이션 완료를 기다리지 않음)
    if (targetIndex !== -1) {
        current = targetIndex;
        updatePageInfo();
    }
    
    // 페이지 dim 효과 업데이트
    updatePageDimming(el);
    
    // 클릭 잠금을 짧은 시간(250ms)으로 제한 - 더블클릭만 방지
    if (!skipUnlock) {
        setTimeout(() => {
            clickLocked = false;
        }, 250); // 250ms 후 자동 해제 (더블클릭 방지)
    }
    
    gsap.to('#cameraWrapper', {
        rotation: shortestRotation,
        duration: dur,
        ease: 'power3.inOut',
        overwrite: 'auto',
        force3D: true
    });

    gsap.to(viewer, {
        x: tx,
        y: ty,
        duration: dur,
        ease: 'power3.inOut',
        overwrite: 'auto',
        // force3D 제거: 거대한 컨테이너는 GPU 가속 사용 안 함
        onComplete: () => {
            // onDone 콜백만 실행 (상태는 이미 업데이트됨)
            if (typeof onDone === 'function') {
                onDone();
            }
        }
    });
}

// ===== 전체/부분 보기 토글 =====
function enterOverviewMode(enableBlink = true) {
    if (isOverviewMode) return;

    // [🔥디버깅] Overview 모드 진입 전 상태 확인
    if (DEBUG) {
        console.log('='.repeat(60));
        console.log('🔍 [Overview 모드 진입] 디버깅 정보');
        console.log('='.repeat(60));
        console.log(`📊 총 페이지 수: ${pages.length}`);
        console.log(`📊 현재 페이지 인덱스: ${current}`);
        console.log(`📊 worldBounds (이전):`, worldBounds);
        
        let visiblePages = 0;
        let pagesWithImages = 0;
        let pagesWithThumbnails = 0;
        
        pages.forEach((page, idx) => {
            if (page) {
                const style = window.getComputedStyle(page);
                const bgImage = style.backgroundImage;
                const pageId = page.dataset.pageId;
                
                if (style.display !== 'none' && style.opacity !== '0') visiblePages++;
                if (bgImage && bgImage !== 'none') pagesWithImages++;
                if (bgImage && bgImage.includes('thumbnails')) pagesWithThumbnails++;
                
                if (idx < 5 || idx >= pages.length - 5) { // 처음 5개와 마지막 5개만 상세 로그
                    console.log(`   [${idx}] ${pageId || 'N/A'}: visible=${style.display !== 'none'}, opacity=${style.opacity}, bg=${bgImage ? '있음' : '없음'}`);
                }
            }
        });
        
        console.log(`📊 보이는 페이지: ${visiblePages}/${pages.length}`);
        console.log(`📊 이미지 있는 페이지: ${pagesWithImages}/${pages.length}`);
        console.log(`📊 썸네일 있는 페이지: ${pagesWithThumbnails}/${pages.length}`);
        console.log('='.repeat(60));
    }

    // [🔥수정] 실제 생성된 페이지들을 기반으로 worldBounds 재계산
    // "모두 보기" 후 새로 생성된 페이지들이 포함되도록
    const computedBounds = computeWorldBoundsFromPages();
    if (!computedBounds) {
        // 페이지 기반 계산 실패 시 JSON 기반으로 폴백
        if (!worldBounds) return;
    } else {
        worldBounds = computedBounds;
        if (DEBUG) {
            console.log(`📊 worldBounds (재계산):`, worldBounds);
        }
    }

    isOverviewMode = true;
    
    // 슬라이더 숨기기
    const pageSlider = document.getElementById('pageSlider');
    if (pageSlider) {
        pageSlider.classList.add('hidden');
    }
    overviewToggle.textContent = '멀리서 보기';

    // [🔥추가] 애니메이션 시작 전 GPU에게 힌트 주기
    // cameraWrapper만 적용 (viewer는 거대해서 will-change를 주면 안 됨)
    gsap.set('#cameraWrapper', { willChange: "transform" });

    // 현재 카메라 상태 저장
    savedCameraState = {
        viewerX: gsap.getProperty(viewer, 'x'),
        viewerY: gsap.getProperty(viewer, 'y'),
        rotation: gsap.getProperty(cameraWrapper, 'rotation'),
        scale: gsap.getProperty(cameraWrapper, 'scale') || BASE_VIEW_SCALE,
        currentIndex: current
    };

    const { minX, maxX, minY, maxY, width, height } = worldBounds;
    const worldCx = (minX + maxX) / 2;
    const worldCy = (minY + maxY) / 2;

    // 뷰어를 월드 중심으로 옮겨서 화면 중앙에 오도록
    const tx = innerWidth / 2 - worldCx;
    const ty = innerHeight / 2 - worldCy;

    // 전체 월드가 화면 안에 들어오도록 스케일 계산 (여유 10%)
    const sx = innerWidth / width;
    const sy = innerHeight / height;
    const targetScale = Math.min(sx, sy) * 0.9;

    clickLocked = true;
    
    // Overview 모드에서는 모든 페이지를 밝게 표시하고, 현재 페이지는 강조 표시 (선택적)
    const currentPage = pages[current];
    pages.forEach(page => {
        if (page) {
            page.classList.remove('dimmed');
            // 깜빡임 효과는 enableBlink가 true일 때만 적용
            if (enableBlink && page === currentPage) {
                page.classList.add('overview-highlight');
            } else {
                page.classList.remove('overview-highlight');
            }
            
            // [🔥추가] 썸네일로 이미지 교체
            const pageId = page.dataset.pageId;
            if (pageId && page.style.backgroundImage) {
                // 원본 이미지 경로 저장 (나중에 복원하기 위해)
                if (!page.dataset.originalImage) {
                    page.dataset.originalImage = page.style.backgroundImage;
                }
                // 썸네일 경로로 교체 (PNG와 JPG 둘 다 시도)
                const thumbnailPath = getThumbnailPath(pageId);
                
                if (DEBUG) {
                    console.log(`🖼️ [썸네일 로딩 시작] ${pageId} → ${thumbnailPath}`);
                    console.log(`   원본: ${page.dataset.originalImage}`);
                    console.log(`   페이지 위치: left=${page.style.left}, top=${page.style.top}`);
                    console.log(`   페이지 크기: ${page.offsetWidth}x${page.offsetHeight}`);
                }
                
                // PNG와 JPG 둘 다 시도 (원본이 PNG인 경우 PNG 썸네일, 아니면 JPG 썸네일)
                let triedBoth = false;
                const startTime = performance.now(); // 로딩 시작 시간 기록
                
                const tryThumbnail = (path) => {
                    const testImg = new Image(); // 각 시도마다 새로운 Image 객체 생성
                    
                    testImg.onerror = () => {
                        const loadTime = performance.now() - startTime;
                        if (DEBUG) {
                            console.error(`❌ [썸네일 로드 실패] ${pageId} | 경로: ${path} | 시도: ${triedBoth ? '2번째' : '1번째'} | 시간: ${loadTime.toFixed(0)}ms`);
                        }
                        
                        if (!triedBoth) {
                            // 첫 번째 시도 실패 시 다른 확장자 시도
                            triedBoth = true;
                            const altPath = path.endsWith('.png') 
                                ? path.replace('_thumb.png', '_thumb.jpg')
                                : path.replace('_thumb.jpg', '_thumb.png');
                            if (DEBUG) console.log(`   🔄 대체 경로 시도: ${altPath}`);
                            tryThumbnail(altPath);
                        } else {
                            // 둘 다 실패하면 원본 유지
                            if (DEBUG) console.log(`   ⚠️ 원본 이미지로 복원: ${page.dataset.originalImage}`);
                            if (page.dataset.originalImage) {
                                page.style.backgroundImage = page.dataset.originalImage;
                            }
                        }
                    };
                    
                    testImg.onload = () => {
                        const loadTime = performance.now() - startTime;
                        if (DEBUG) {
                            console.log(`✅ [썸네일 로드 성공] ${pageId} | 경로: ${path} | 시간: ${loadTime.toFixed(0)}ms | 크기: ${testImg.width}x${testImg.height}`);
                        }
                        // 썸네일이 있으면 교체
                        const oldBg = page.style.backgroundImage;
                        page.style.backgroundImage = `url('${path}')`;
                        
                        if (DEBUG) {
                            // 교체 직후 확인
                            const newBg = page.style.backgroundImage;
                            console.log(`   🔄 교체 완료: ${oldBg.substring(0, 30)}... → ${newBg.substring(0, 30)}...`);
                            
                            // 100ms 후 실제 렌더링 상태 확인
                            setTimeout(() => {
                                const computedStyle = window.getComputedStyle(page);
                                const bgImage = computedStyle.backgroundImage;
                                const isVisible = computedStyle.display !== 'none' && computedStyle.opacity !== '0';
                                console.log(`   📋 100ms 후 상태: visible=${isVisible}, bg=${bgImage ? '있음' : '없음'}, opacity=${computedStyle.opacity}`);
                            }, 100);
                        }
                    };
                    
                    testImg.src = path;
                };
                
                tryThumbnail(thumbnailPath);
            }
            
            // [🔥추가] Overview 모드에서 페이지 호버 및 클릭 이벤트 추가
            // 이벤트 리스너가 이미 추가되어 있는지 확인 (중복 방지)
            if (!page._overviewHoverHandler) {
                // 호버 이벤트 핸들러
                page._overviewHoverHandler = () => {
                    if (isOverviewMode) {
                        page.classList.add('overview-hover');
                        // 호버 전 스케일 저장 (아직 저장되지 않았다면)
                        if (page._originalScale === undefined) {
                            page._originalScale = gsap.getProperty(page, 'scale') || 1;
                        }
                        // GSAP로 스케일 적용 (CSS transform은 GSAP에 의해 덮어씌워짐)
                        gsap.to(page, {
                            scale: page._originalScale * 1.05,
                            duration: 0.2,
                            ease: 'power2.out',
                            force3D: true
                        });
                    }
                };
                
                page._overviewLeaveHandler = () => {
                    if (isOverviewMode) {
                        page.classList.remove('overview-hover');
                        // GSAP로 스케일 원래대로 복원
                        if (page._originalScale !== undefined) {
                            gsap.to(page, {
                                scale: page._originalScale,
                                duration: 0.2,
                                ease: 'power2.out',
                                force3D: true
                            });
                        }
                    }
                };
                
                // 클릭 이벤트 핸들러
                page._overviewClickHandler = async (e) => {
                    if (!isOverviewMode || clickLocked) return;
                    
                    e.stopPropagation(); // 이벤트 버블링 방지
                    
                    const clickedPageId = page.dataset.pageId;
                    if (!clickedPageId) return;
                    
                    const targetIndex = pageBases.indexOf(clickedPageId);
                    if (targetIndex === -1) return;
                    
                    // Overview 모드 종료 후 해당 페이지로 이동
                    exitOverviewMode(() => {
                        // 해당 페이지로 이동
                        if (pages[targetIndex]) {
                            current = targetIndex;
                            updatePageInfo();
                            centerCameraOn(pages[targetIndex], 0.8, targetIndex, false);
                        } else {
                            // 페이지가 아직 생성되지 않았다면 생성 후 이동
                            // (이 경우는 일반적으로 발생하지 않지만 안전장치)
                            current = targetIndex;
                            updatePageInfo();
                        }
                    });
                };
                
                // 이벤트 리스너 추가 (한 번만)
                page.addEventListener('mouseenter', page._overviewHoverHandler);
                page.addEventListener('mouseleave', page._overviewLeaveHandler);
                page.addEventListener('click', page._overviewClickHandler);
            }
            
            // Overview 모드일 때 클릭 가능하도록 설정
            if (isOverviewMode) {
                page.style.pointerEvents = 'auto'; // 클릭 가능하도록 설정
            }
        }
    });

    gsap.to('#cameraWrapper', {
        rotation: 0,
        scale: targetScale,
        duration: 0.9,
        ease: 'power3.inOut',
        overwrite: 'auto',
        force3D: true
    });

    gsap.to(viewer, {
        x: tx,
        y: ty,
        // force3D 제거: 거대한 컨테이너는 GPU 가속 사용 안 함
        duration: 0.9,
        ease: 'power3.inOut',
        overwrite: 'auto',
        onComplete: () => {
            clickLocked = false;
            // [🔥추가] 애니메이션 끝나면 힌트 제거하여 강제 래스터화 방지
            gsap.set(['#viewer', '#cameraWrapper'], { willChange: "auto" });
            
            // [🔥디버깅] 애니메이션 완료 후 상태 확인
            if (DEBUG) {
                setTimeout(() => {
                    console.log('='.repeat(60));
                    console.log('🔍 [Overview 모드 애니메이션 완료] 상태 확인');
                    console.log('='.repeat(60));
                    console.log(`📊 카메라 위치: x=${gsap.getProperty(viewer, 'x').toFixed(1)}, y=${gsap.getProperty(viewer, 'y').toFixed(1)}`);
                    console.log(`📊 카메라 스케일: ${gsap.getProperty(cameraWrapper, 'scale').toFixed(3)}`);
                    console.log(`📊 화면 크기: ${innerWidth}x${innerHeight}`);
                    
                    // 화면 영역에 있는 페이지들 확인
                    const scale = gsap.getProperty(cameraWrapper, 'scale');
                    const viewX = gsap.getProperty(viewer, 'x');
                    const viewY = gsap.getProperty(viewer, 'y');
                    
                    // [🔥수정] viewer의 x, y는 이미 월드 좌표계에서의 위치입니다
                    // 화면 중앙이 보는 월드 좌표 = viewer의 위치 (viewer가 화면 중앙에 있으므로)
                    const worldCenterX = -viewX; // viewer의 x는 화면 좌표계이므로 음수로 변환
                    const worldCenterY = -viewY; // viewer의 y는 화면 좌표계이므로 음수로 변환
                    
                    // 스케일된 뷰포트 크기
                    const viewportWidth = innerWidth / scale;
                    const viewportHeight = innerHeight / scale;
                    
                    const viewportLeft = worldCenterX - viewportWidth / 2;
                    const viewportRight = worldCenterX + viewportWidth / 2;
                    const viewportTop = worldCenterY - viewportHeight / 2;
                    const viewportBottom = worldCenterY + viewportHeight / 2;
                    
                    console.log(`📊 뷰포트 영역: left=${viewportLeft.toFixed(0)}, right=${viewportRight.toFixed(0)}, top=${viewportTop.toFixed(0)}, bottom=${viewportBottom.toFixed(0)}`);
                    console.log(`📊 월드 중심: (${worldCenterX.toFixed(0)}, ${worldCenterY.toFixed(0)})`);
                    console.log(`📊 뷰포트 크기: ${viewportWidth.toFixed(0)}x${viewportHeight.toFixed(0)}`);
                    
                    let visibleInViewport = 0;
                    let pagesWithoutImage = [];
                    
                    pages.forEach((page, idx) => {
                        if (page && page._absX !== undefined) {
                            const pageLeft = page._absX - (page._size?.w || 0) / 2;
                            const pageRight = page._absX + (page._size?.w || 0) / 2;
                            const pageTop = page._absY - (page._size?.h || 0) / 2;
                            const pageBottom = page._absY + (page._size?.h || 0) / 2;
                            
                            const isInViewport = !(pageRight < viewportLeft || pageLeft > viewportRight || pageBottom < viewportTop || pageTop > viewportBottom);
                            
                            if (isInViewport) {
                                visibleInViewport++;
                                const style = window.getComputedStyle(page);
                                const bgImage = style.backgroundImage;
                                if (!bgImage || bgImage === 'none') {
                                    pagesWithoutImage.push({ idx, pageId: page.dataset.pageId || 'N/A', left: pageLeft.toFixed(0), right: pageRight.toFixed(0) });
                                    console.warn(`⚠️ [${idx}] ${page.dataset.pageId || 'N/A'}: 뷰포트 내에 있지만 이미지 없음! 위치: left=${pageLeft.toFixed(0)}, right=${pageRight.toFixed(0)}`);
                                } else {
                                    // 이미지 있는 페이지도 로그 (처음 5개만)
                                    if (visibleInViewport <= 5) {
                                        console.log(`✅ [${idx}] ${page.dataset.pageId || 'N/A'}: 뷰포트 내, 이미지 있음`);
                                    }
                                }
                            }
                        }
                    });
                    
                    console.log(`📊 뷰포트 내 페이지: ${visibleInViewport}개`);
                    if (pagesWithoutImage.length > 0) {
                        console.warn(`⚠️ 이미지 없는 페이지: ${pagesWithoutImage.length}개`);
                        pagesWithoutImage.forEach(p => {
                            console.warn(`   - [${p.idx}] ${p.pageId} (left=${p.left}, right=${p.right})`);
                        });
                    }
                    console.log('='.repeat(60));
                }, 2000); // 2초 후 확인 (썸네일 로딩 시간 고려)
            }
        }
    });
}

function exitOverviewMode(onComplete) {
    if (!isOverviewMode || !savedCameraState) {
        // 이미 들여다보기 모드라면 콜백 즉시 실행
        if (typeof onComplete === 'function') {
            onComplete();
        }
        return;
    }

    isOverviewMode = false;
    
    // 슬라이더 다시 보이기
    const pageSlider = document.getElementById('pageSlider');
    if (pageSlider) {
        pageSlider.classList.remove('hidden');
    }
    
    overviewToggle.textContent = '들여다 보기';

    const { viewerX, viewerY, rotation, scale } = savedCameraState;

    clickLocked = true;

    // [🔥추가] 애니메이션 시작 전 GPU에게 힌트 주기
    // cameraWrapper만 적용 (viewer는 거대해서 will-change를 주면 안 됨)
    gsap.set('#cameraWrapper', { willChange: "transform" });

    gsap.to('#cameraWrapper', {
        rotation,
        scale: scale || BASE_VIEW_SCALE,
        duration: 0.9,
        ease: 'power3.inOut',
        overwrite: 'auto',
        force3D: true
    });

    gsap.to(viewer, {
        x: viewerX,
        y: viewerY,
        duration: 0.9,
        ease: 'power3.inOut',
        // force3D 제거: 거대한 컨테이너는 GPU 가속 사용 안 함
        overwrite: 'auto',
        onComplete: () => {
            clickLocked = false;
            // [🔥추가] 애니메이션 끝나면 힌트 제거하여 강제 래스터화 방지
            gsap.set(['#viewer', '#cameraWrapper'], { willChange: "auto" });
            // Overview 모드에서 나왔을 때 깜빡이는 효과 제거하고 현재 페이지만 밝게
            pages.forEach(page => {
                if (page) {
                    page.classList.remove('overview-highlight');
                    page.classList.remove('overview-hover'); // 호버 효과도 제거
                    
                    // [🔥추가] Overview 모드 이벤트 리스너 제거
                    if (page._overviewHoverHandler) {
                        page.removeEventListener('mouseenter', page._overviewHoverHandler);
                        page.removeEventListener('mouseleave', page._overviewLeaveHandler);
                        page.removeEventListener('click', page._overviewClickHandler);
                    }
                    
                    // [🔥추가] 원본 이미지로 복원
                    if (page.dataset.originalImage) {
                        page.style.backgroundImage = page.dataset.originalImage;
                        // 원본 경로는 유지 (다음 Overview 모드 진입을 위해)
                    }
                }
            });
            if (pages[current]) {
                updatePageDimming(pages[current]);
            }
            // 콜백 실행
            if (typeof onComplete === 'function') {
                onComplete();
            }
        }
    });
}

if (overviewToggle) {
    overviewToggle.addEventListener('click', () => {
        if (!isOverviewMode) {
            enterOverviewMode();
        } else {
            exitOverviewMode();
        }
    });
}

if (infoToggle && infoPanel) {
    infoToggle.addEventListener('click', () => {
        const isOpen = infoPanel.classList.contains('open');
        infoPanel.classList.toggle('open', !isOpen);
        infoPanel.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
        
        // 인포 패널 열 때 햄버거 메뉴가 열려있으면 닫기
        if (!isOpen && menuPanel.classList.contains('open')) {
            menuPanel.classList.remove('open');
            menuPanel.setAttribute('aria-hidden', 'true');
        }
    });
}

// 햄버거 메뉴
if (menuToggle && menuPanel) {
    // '다른 결말 보기' 메뉴 아이템 찾기
    const otherEndingItem = menuPanel.querySelector('[data-action="other-ending"]');
    
    // 메뉴 상태 업데이트 함수
    function updateMenuState() {
        if (otherEndingItem) {
            // 선택지까지 보지 않은 경우 흐릿하게 표시
            if (selectedPath === null) {
                otherEndingItem.classList.add('disabled');
            } else {
                otherEndingItem.classList.remove('disabled');
            }
        }
    }
    
    menuToggle.addEventListener('click', () => {
        const isOpen = menuPanel.classList.contains('open');
        menuPanel.classList.toggle('open', !isOpen);
        menuPanel.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
        
        // 메뉴 열 때 상태 업데이트
        if (!isOpen) {
            updateMenuState();
            
            // 인포 패널이 열려있으면 닫기
            if (infoPanel.classList.contains('open')) {
                infoPanel.classList.remove('open');
                infoPanel.setAttribute('aria-hidden', 'true');
            }
        }
    });
    
    // 메뉴 아이템 클릭 이벤트
    const menuItems = menuPanel.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            // disabled 상태면 클릭 무시
            if (item.classList.contains('disabled')) {
                return;
            }
            
            const action = item.dataset.action;
            handleMenuAction(action);
            // 메뉴 닫기
            menuPanel.classList.remove('open');
            menuPanel.setAttribute('aria-hidden', 'true');
        });
    });
    
    // 초기 상태 설정
    updateMenuState();
}

function handleMenuAction(action) {
    switch(action) {
        case 'overview':
            if (!isOverviewMode) {
                enterOverviewMode();
            }
            break;
        case 'closeup':
            if (isOverviewMode) {
                exitOverviewMode();
            }
            break;
        case 'restart':
            showReloadModal();
            break;
        case 'other-ending':
            // 먼저 들여다보기 모드인지 확인
            if (isOverviewMode) {
                exitOverviewMode(() => {
                    // 들여다보기 모드로 전환 완료 후 실행
                    if (selectedPath === 'path1') {
                        goToP70AndChoosePath('path2');
                    } else if (selectedPath === 'path2') {
                        goToP70AndChoosePath('path1');
                    } else {
                        showChoiceModal();
                    }
                });
            } else {
                // 이미 들여다보기 모드라면 바로 실행
                if (selectedPath === 'path1') {
                    goToP70AndChoosePath('path2');
                } else if (selectedPath === 'path2') {
                    goToP70AndChoosePath('path1');
                } else {
                    showChoiceModal();
                }
            }
            break;
        case 'all-pages':
            // 먼저 들여다보기 모드인지 확인
            if (isOverviewMode) {
                exitOverviewMode(() => {
                    // 들여다보기 모드로 전환 완료 후 실행
                    goToAllPagesAndOverview();
                });
            } else {
                // 이미 들여다보기 모드라면 바로 실행
                goToAllPagesAndOverview();
            }
            break;
    }
}

async function goToAllPagesAndOverview() {
    // 현재 페이지 저장
    const originalPageIndex = current;
    
    clickLocked = true;
    isAllPagesMode = true; // 모두보기 모드 시작
    
    // 선택지가 없으면 자동으로 path2 선택 (모달창 띄우지 않음)
    if (selectedPath === null) {
        applyPathChoice('path2');
    }
    
    // 로딩 모달 표시
    const loadingModal = document.getElementById('allPagesLoadingModal');
    const progressFill = document.getElementById('allPagesProgressFill');
    const progressText = document.getElementById('allPagesProgressText');
    
    if (loadingModal) {
        loadingModal.classList.add('open');
        loadingModal.setAttribute('aria-hidden', 'false');
    }
    
    // 생성해야 할 페이지 목록
    const totalPages = pageBases.length;
    const startIdx = current + 1;
    let createdCount = current + 1; // 이미 생성된 페이지 수
    
    // 진행률 업데이트 함수
    const updateProgress = (created, total) => {
        const percent = (created / total) * 100;
        if (progressFill) progressFill.style.width = `${percent}%`;
        if (progressText) progressText.textContent = `${created} / ${total}`;
    };
    
    updateProgress(createdCount, totalPages);
    
    // 모든 이미지를 병렬로 사전 로드하여 캐시에 저장
    const remainingPageIds = pageBases.slice(startIdx).filter(id => {
        const pageType = pageTypeMap[id] || 'basic';
        return pageType !== 'blank' && !pages[pageBases.indexOf(id)];
    });
    
    const preloadPromises = remainingPageIds.map(pageId => resolveImage(pageId));
    await Promise.all(preloadPromises);
    
    // 백그라운드에서 모든 페이지 생성 (카메라 이동 없음)
    for (let idx = startIdx; idx < totalPages; idx++) {
        if (pages[idx]) {
            createdCount++;
            updateProgress(createdCount, totalPages);
            continue;
        }
        
        const pageId = pageBases[idx];
        const pageType = pageTypeMap[pageId] || 'basic';
        const src = pageType === 'blank' ? '' : await resolveImage(pageId);
        const pageCfg = getPageDataFromJSON(pageId) || pageConfigs[pageType];
        const pageSize = pageCfg.getSize();
        const startPoint = pageCfg.getStartPoint();
        const rotation = pageCfg.rotation || 0;
        
        const pageEl = createBasicPage({
            x: startPoint.x,
            y: startPoint.y,
            src,
            label: `${idx + 1}p`,
            size: pageSize,
            rot: rotation,
            type: pageType,
            pageId: pageId
        });
        
        pageEl.style.imageRendering = 'auto';
        pageEl.style.webkitImageRendering = 'optimize-contrast';
        
        pages[idx] = pageEl;
        
        createdCount++;
        updateProgress(createdCount, totalPages);
        
        // UI 업데이트를 위한 짧은 대기
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // ✅ p33~p37 페이지들을 모두 표시 (스크롤 없이 자동으로)
    const p33ToP37Ids = ['p36', 'p37', 'p38', 'p39', 'p40'];
    p33ToP37Ids.forEach(pageId => {
        const pageIndex = pageBases.indexOf(pageId);
        if (pageIndex !== -1 && pages[pageIndex]) {
            pages[pageIndex].style.opacity = '1';
            pages[pageIndex].style.pointerEvents = 'auto';
            if (DEBUG) console.log(`✅ 모두보기: ${pageId} 자동 표시됨`);
        }
    });
    
    // 슬라이더 최대값 업데이트
    updatePageInfo();
    
    clickLocked = false;
    isAllPagesMode = false;
    
    // 로딩 모달 숨기기
    if (loadingModal) {
        loadingModal.classList.remove('open');
        loadingModal.setAttribute('aria-hidden', 'true');
    }
    
    // 완료 모달 표시
    const completeModal = document.getElementById('allPagesCompleteModal');
    if (completeModal) {
        completeModal.classList.add('open');
        completeModal.setAttribute('aria-hidden', 'false');
    }
    
    // 완료 버튼 이벤트
    const completeBtn = document.getElementById('allPagesCompleteBtn');
    if (completeBtn) {
        completeBtn.onclick = () => {
            if (completeModal) {
                completeModal.classList.remove('open');
                completeModal.setAttribute('aria-hidden', 'true');
            }
        };
    }
    
    // 현재 페이지 dim 효과 적용
    if (pages[originalPageIndex]) {
        updatePageDimming(pages[originalPageIndex]);
    }
}

async function goToP70AndChoosePath(path) {
    // p70으로 이동하고 선택한 경로 적용
    const p70Index = pageBases.findIndex(id => id === 'p74');
    if (p70Index === -1) {
        console.warn('p74을 찾을 수 없습니다.');
        return;
    }
    
    // p70까지 모든 페이지 생성
    clickLocked = true;
    while (current < p70Index) {
        const nextIdx = current + 1;
        if (pages[nextIdx]) {
            current = nextIdx;
            updatePageInfo();
            continue;
        }
        const nextPageId = pageBases[nextIdx];
        const nextType = pageTypeMap[nextPageId] || 'basic';
        const src = nextType === 'blank' ? '' : await resolveImage(nextPageId);
        const nextCfg = getPageDataFromJSON(nextPageId) || pageConfigs[nextType];
        const nextSize = nextCfg.getSize();
        const start = nextCfg.getStartPoint();
        const rotForNext = nextCfg.rotation || 0;
        const next = createBasicPage({
            x: start.x, y: start.y, src, label: `${nextIdx + 1}p`, size: nextSize, rot: rotForNext, type: nextType, pageId: nextPageId
        });
        pages.push(next);
        centerCameraOn(next, 0, nextIdx, false);
        current = nextIdx;
        updatePageInfo();
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // p70으로 이동
    if (pages[p70Index]) {
        centerCameraOn(pages[p70Index], 0.8, p70Index, false, () => {
            clickLocked = false;
            // 선택한 경로 적용
            applyPathChoice(path);
        });
    } else {
        clickLocked = false;
        applyPathChoice(path);
    }
}

// 새로고침 모달
const reloadModal = document.getElementById('reloadModal');
const modalConfirm = document.getElementById('modalConfirm');
const modalCancel = document.getElementById('modalCancel');
let isModalOpen = false;

function showReloadModal() {
    if (reloadModal) {
        isModalOpen = true;
        reloadModal.classList.add('open');
        reloadModal.setAttribute('aria-hidden', 'false');
        // pageStage에 블러 효과 추가
        if (pageStage) {
            pageStage.classList.add('blurred');
        }
    }
}

function hideReloadModal() {
    if (reloadModal) {
        isModalOpen = false;
        reloadModal.classList.remove('open');
        reloadModal.setAttribute('aria-hidden', 'true');
        // pageStage 블러 효과 제거
        if (pageStage) {
            pageStage.classList.remove('blurred');
        }
    }
}

// 새로고침 버튼은 제거됨 - 햄버거 메뉴의 '처음부터 보기'에서 처리

if (modalConfirm) {
    modalConfirm.addEventListener('click', () => {
        location.reload();
    });
}

if (modalCancel) {
    modalCancel.addEventListener('click', () => {
        hideReloadModal();
    });
}

// 모달 배경 클릭 시 닫기
if (reloadModal) {
    const modalOverlay = reloadModal.querySelector('.modal-overlay');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', () => {
            hideReloadModal();
        });
    }
}

// p70 선택지 모달
const choiceModal = document.getElementById('choiceModal');
const choice1Btn = document.getElementById('choice1');
const choice2Btn = document.getElementById('choice2');

function showChoiceModal() {
    if (choiceModal) {
        isModalOpen = true;
        choiceModal.classList.add('open');
        choiceModal.setAttribute('aria-hidden', 'false');
        // pageStage에 블러 효과 추가
        if (pageStage) {
            pageStage.classList.add('blurred');
        }
    }
}

function hideChoiceModal() {
    if (choiceModal) {
        isModalOpen = false;
        choiceModal.classList.remove('open');
        choiceModal.setAttribute('aria-hidden', 'true');
        // pageStage 블러 효과 제거
        if (pageStage) {
            pageStage.classList.remove('blurred');
        }
    }
}

// 슬라이더 경고 토스트
const sliderWarningToast = document.getElementById('sliderWarningToast');

function showSliderWarningToast() {
    if (sliderWarningToast) {
        sliderWarningToast.classList.add('show');
        sliderWarningToast.setAttribute('aria-hidden', 'false');
        
        // 3초 후 자동으로 사라짐
        setTimeout(() => {
            hideSliderWarningToast();
        }, 3000);
    }
}

function hideSliderWarningToast() {
    if (sliderWarningToast) {
        sliderWarningToast.classList.remove('show');
        sliderWarningToast.setAttribute('aria-hidden', 'true');
    }
}

function applyPathChoice(path) {
    selectedPath = path;
    
    // 메뉴 상태 업데이트
    const menuPanel = document.getElementById('menuPanel');
    if (menuPanel) {
        const otherEndingItem = menuPanel.querySelector('[data-action="other-ending"]');
        if (otherEndingItem) {
            otherEndingItem.classList.remove('disabled');
        }
    }
    
    // p70의 인덱스 찾기
    const p70Index = pageBases.findIndex(id => id === 'p74');
    if (p70Index === -1) return;
    
    if (path === 'path1') {
        // 선택지 1: p71~p82만 남기고 p83~p95 제거
        const p83Index = pageBases.findIndex(id => id === 'p84');
        if (p83Index !== -1) {
            // p83부터 끝까지 제거
            pageBases = pageBases.slice(0, p83Index);
        }
    } else if (path === 'path2') {
        // 선택지 2: p71~p82 제거하고 p83~p95만 남기기
        const p71Index = pageBases.findIndex(id => id === 'p75');
        const p83Index = pageBases.findIndex(id => id === 'p83');
        if (p71Index !== -1 && p83Index !== -1) {
            // p71~p82 제거
            pageBases = pageBases.slice(0, p71Index).concat(pageBases.slice(p83Index));
        }
    }
    
    // 페이지 정보 업데이트
    updatePageInfo();
    
    // 선택한 경로의 첫 페이지로 이동
    const nextIndex = p70Index + 1;
    if (nextIndex < pageBases.length) {
        // 다음 페이지 생성 및 이동
        setTimeout(() => {
            nextBtn.click();
        }, 300);
    }
}

if (choice1Btn) {
    choice1Btn.addEventListener('click', () => {
        hideChoiceModal();
        applyPathChoice('path1');
    });
}

if (choice2Btn) {
    choice2Btn.addEventListener('click', () => {
        hideChoiceModal();
        applyPathChoice('path2');
    });
}

// 디버깅용: p70까지 모든 페이지 생성 후 이동
async function goToP70WithAllPages() {
    const p70Index = pageBases.findIndex(id => id === 'p74');
    if (p70Index === -1) {
        console.warn('p70을 찾을 수 없습니다.');
        return;
    }
    
    clickLocked = true;
    
    // 현재 위치부터 p70까지 모든 페이지 생성
    while (current < p70Index) {
        const nextIdx = current + 1;
        
        // 이미 생성된 페이지면 스킵
        if (pages[nextIdx]) {
            current = nextIdx;
            updatePageInfo();
            continue;
        }
        
        // 페이지 생성
        const nextPageId = pageBases[nextIdx];
        const nextType = pageTypeMap[nextPageId] || 'basic';
        const src = nextType === 'blank' ? '' : await resolveImage(nextPageId);
        const nextCfg = getPageDataFromJSON(nextPageId) || pageConfigs[nextType];
        const nextSize = nextCfg.getSize();
        const start = nextCfg.getStartPoint();
        const rotForNext = nextCfg.rotation || 0;
        
        const next = createBasicPage({
            x: start.x,
            y: start.y,
            src,
            label: `${nextIdx + 1}p`,
            size: nextSize,
            rot: rotForNext,
            type: nextType,
            pageId: nextPageId
        });
        pages.push(next);
        
        // 카메라 이동 (애니메이션 없이)
        centerCameraOn(next, 0, nextIdx, false);
        current = nextIdx;
        updatePageInfo();
        
        // 약간의 딜레이 (너무 빠르게 생성되는 것 방지)
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // p70으로 이동
    if (pages[p70Index]) {
        centerCameraOn(pages[p70Index], 0.8, p70Index, false, () => {
            clickLocked = false;
            // 선택지 모달 표시
            showChoiceModal();
        });
    } else {
        clickLocked = false;
        showChoiceModal();
    }
}


addEventListener('resize', () => {
    viewer.style.transformOrigin = `${innerWidth / 2}px ${innerHeight / 2}px`;
    gsap.set('#cameraWrapper', {
        transformOrigin: `${innerWidth / 2}px ${innerHeight / 2}px`
    });
    const target = pages[current] || pages[0];
    if (target) centerCameraOn(target, 0);
});

function getA5Size() {
    const el = document.createElement('div');
    el.className = 'page basic';
    el.style.visibility = 'hidden';
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    el.style.top = '-9999px';
    pageStage.appendChild(el);
    const rect = el.getBoundingClientRect();
    const size = { w: Math.round(rect.width), h: Math.round(rect.height) };
    el.remove();
    return size;
}

// ===== image resolver (jpg → png → webp) =====
// 이미지 캐시
const imageCache = new Map();

async function resolveImage(base) {
    // 캐시에서 먼저 확인 (즉시 반환 - 네트워크 요청 없음)
    if (imageCache.has(base)) {
        return imageCache.get(base);
    }
    
    const tryExt = ['jpg', 'png', 'webp'];
    for (const ext of tryExt) {
        const src = `images/${base}.${ext}`;
        const ok = await new Promise(res => {
            const im = new Image();
            im.onload = () => res(true);
            im.onerror = () => res(false);
            // 캐시 버스터 제거 - 브라우저 캐시 활용
            im.src = src;
        });
        if (ok) {
            // 캐시에 저장 (다음 호출 시 즉시 반환)
            imageCache.set(base, src);
            return src;
        }
    }
    const fallback = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1131"><rect width="100%" height="100%" fill="#222"/><text x="50%" y="50%" fill="#aaa" font-size="32" text-anchor="middle">Missing ${base}</text></svg>`
    );
    imageCache.set(base, fallback);
    return fallback;
}

// 썸네일 경로 반환 함수
function getThumbnailPath(base) {
    // 원본 이미지의 확장자 확인 (캐시에서 확인)
    let ext = 'jpg'; // 기본값
    
    // 캐시에서 원본 경로 확인
    if (imageCache.has(base)) {
        const originalPath = imageCache.get(base);
        const match = originalPath.match(/\.(jpg|jpeg|png|webp)$/i);
        if (match) {
            ext = match[1].toLowerCase();
            // jpeg는 jpg로 통일
            if (ext === 'jpeg') ext = 'jpg';
        }
    } else {
        // 캐시에 없으면 PNG와 JPG 둘 다 시도 (Overview 모드에서는 대부분 캐시에 있음)
        // 기본값은 JPG로 유지
    }
    
    // PNG면 PNG, 나머지는 JPG로 썸네일 생성
    const thumbnailExt = ext === 'png' ? 'png' : 'jpg';
    return `images/thumbnails/${base}_thumb.${thumbnailExt}`;
}

// ===== create page (layout: CENTER 기준) =====
function createBasicPage({ x = 0, y = 0, src = '', label = '', size = null, rot = 0, type = 'basic', pageId = '' } = {}) {
  const el = document.createElement('div');
    el.className = type === 'blank' ? 'page blank' : 'page basic';

    // ✅ x, y를 중앙 기준으로 해석 → 왼쪽 상단 좌표로 변환
    if (size) {
        el.style.left = (x - size.w / 2) + 'px';
        el.style.top = (y - size.h / 2) + 'px';
        el.style.width = size.w + 'px';
        el.style.height = size.h + 'px';
    } else {
        el.style.left = x + 'px';
        el.style.top = y + 'px';
    }

    if (label) el.dataset.label = label;
    if (pageId) el.dataset.pageId = pageId;  // ✅ pageId 저장
    if (src) {
        el.style.backgroundImage = `url('${src}')`;
        // [🔥추가] 원본 이미지 경로 저장 (Overview 모드에서 썸네일로 교체 후 복원하기 위해)
        el.dataset.originalImage = `url('${src}')`;
    }
    
    // p32는 높은 z-index 설정 (DOM 추가 전)
    if (pageId === 'p35') {
        el.style.zIndex = '10';
    }
    
    pageStage.appendChild(el);

    gsap.set(el, { x: 0, y: 0, rotation: rot, transformOrigin: '50% 50%', force3D: true });

    // ✅ 절대 좌표 및 속성 저장 (x, y는 중앙 기준)
    el._absX = x;
    el._absY = y;
    el._size = size || { w: el.offsetWidth, h: el.offsetHeight };
    el._type = type;
    el._rot = rot;
    el._liveRot = rot;

  return el;
}

// + NEW: 파일명→타입 매핑

let pageBases = [];
let pageTypeMap = {};
const pageFileMap = {
};
let pages = [];
let current = 0;
let clickLocked = false;
let scrollBlocked = true;
let specialProgressIndex = null; // p32 시퀀스 등 특수 스크롤 진행 시 UI 전용 페이지 인덱스
let isOverviewMode = false;
let savedCameraState = null;   // { viewerX, viewerY, rotation, scale, currentIndex }
let worldBounds = null;        // { minX, maxX, minY, maxY, width, height }

const wrapDeg = d => ((d % 360) + 360) % 360;

// ===== JSON 데이터 =====
let pagesDataJSON = {}; // {p1: {...}, p2: {...}, ...}

function computeWorldBoundsFromJSON() {
    const ids = Object.keys(pagesDataJSON);
    if (!ids.length) return null;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    ids.forEach(id => {
        const d = pagesDataJSON[id];
        if (!d || !d.size || !d.world) return;
        const w = d.size.w;
        const h = d.size.h;
        const cx = d.world.x;
        const cy = d.world.y;
        const left = cx - w / 2;
        const right = cx + w / 2;
        const top = cy - h / 2;
        const bottom = cy + h / 2;
        if (!isNaN(left)) minX = Math.min(minX, left);
        if (!isNaN(right)) maxX = Math.max(maxX, right);
        if (!isNaN(top)) minY = Math.min(minY, top);
        if (!isNaN(bottom)) maxY = Math.max(maxY, bottom);
    });

    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) return null;
    return {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX,
        height: maxY - minY
    };
}

// 실제 생성된 페이지들을 기반으로 worldBounds 계산 (Overview 모드용)
function computeWorldBoundsFromPages() {
    if (!pages || pages.length === 0) return null;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    pages.forEach(page => {
        if (!page) return;
        
        // 페이지의 절대 좌표와 크기 가져오기
        const absX = page._absX;
        const absY = page._absY;
        const size = page._size || { w: page.offsetWidth, h: page.offsetHeight };
        
        if (absX === undefined || absY === undefined || !size) return;
        
        const w = size.w;
        const h = size.h;
        const left = absX - w / 2;
        const right = absX + w / 2;
        const top = absY - h / 2;
        const bottom = absY + h / 2;
        
        if (!isNaN(left)) minX = Math.min(minX, left);
        if (!isNaN(right)) maxX = Math.max(maxX, right);
        if (!isNaN(top)) minY = Math.min(minY, top);
        if (!isNaN(bottom)) maxY = Math.max(maxY, bottom);
    });

    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) return null;
    return {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX,
        height: maxY - minY
    };
}

// JSON 데이터를 pageConfigs 형식으로 변환하는 어댑터
function getPageDataFromJSON(pageId) {
    const data = pagesDataJSON[pageId];
    if (!data) return null;

    return {
        // JSON의 절대 위치 사용
        getStartPoint: () => ({ x: data.world.x, y: data.world.y }),
        // JSON의 size 사용
        getSize: () => data.size,
        getGap: () => 0,
        // JSON의 scrollPath 사용 (이미 절대 좌표)
        getScrollPoints: () => {
            if (data.scrollPath && data.scrollPath.length > 0) {
                return data.scrollPath; // 절대 좌표
            }

            // ✅ JSON의 world 좌표가 이미 중앙 기준이므로 그대로 반환
            return [{
                x: data.world.x,
                y: data.world.y
            }];
        },
        getNextAnchorLocal: (size) => ({ x: size.w, y: 0, rot: 0 }),
        rotation: data.world.rot
    };
}

// ===== 로딩 화면 관리 =====
const loadingScreen = document.getElementById('loadingScreen');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

function updateLoadingProgress(loaded, total) {
    const percent = Math.round((loaded / total) * 100);
    progressFill.style.width = percent + '%';
    progressText.textContent = `${loaded} / ${total}`;
}

function hideLoadingScreen() {
    loadingScreen.classList.add('hidden');
    setTimeout(() => {
        loadingScreen.style.display = 'none';
    }, 500);
}

// ===== 이미지 프리로드 =====
async function preloadAllImages(pageIds) {
    // 빈 페이지는 이미지 로드 제외
    pageIds = pageIds.filter(id => id !== 'blank_p6_7');
    const totalImages = pageIds.length;
    let loadedCount = 0;
    
    updateLoadingProgress(0, totalImages);
    
    // 모든 이미지를 실제로 로드하고 캐시에 저장
    const imagePromises = pageIds.map(async (pageId) => {
        try {
            // resolveImage가 이미 캐시를 사용하므로, 실제로 이미지를 로드하고 캐시에 저장
            const src = await resolveImage(pageId);
            
            // 이미지가 실제로 완전히 로드될 때까지 기다림
            const img = new Image();
            await new Promise((resolve) => {
                img.onload = () => {
                    loadedCount++;
                    updateLoadingProgress(loadedCount, totalImages);
                    resolve();
                };
                img.onerror = () => {
                    // 이미지 로드 실패해도 계속 진행
                    loadedCount++;
                    updateLoadingProgress(loadedCount, totalImages);
                    resolve();
                };
                // 캐시된 src 사용 (이미 resolveImage에서 캐시됨)
                img.src = src;
            });
        } catch (error) {
            loadedCount++;
            updateLoadingProgress(loadedCount, totalImages);
        }
    });
    
    // 모든 이미지가 완전히 로드될 때까지 대기
    await Promise.all(imagePromises);
    
    if (DEBUG) console.log(`✅ 모든 이미지 로드 완료: ${loadedCount}/${totalImages}`);
}

// ===== init first page =====
(async function init() {
    // ✅ pages.json 파일을 직접 불러옵니다.
    const response = await fetch('pages.json');
    const jsonArray = await response.json();
    
    if (!jsonArray || jsonArray.length === 0) {
        console.error("pages.json 파일을 읽을 수 없습니다.");
        hideLoadingScreen();
        return;
    }
 
    // 배열을 객체로 변환 {p1: {...}, p2: {...}, ...}
    jsonArray.forEach(item => {
        pagesDataJSON[item.id] = item;      // {p1: {...}, p2: {...}}
        pageBases.push(item.id);            // ['p1', 'p2', ...]
        pageTypeMap[item.id] = item.type;   // {p1: 'basic', p3: 'special1'}
    });


    // 전체 월드 bounds 미리 계산 (overview 모드용)
    worldBounds = computeWorldBoundsFromJSON();
 
    // 모든 이미지 프리로드
    await preloadAllImages(pageBases);
    
    // 로딩 화면 숨기기
    hideLoadingScreen();
    
    // 첫 페이지 생성
    const id = pageBases[0];
    const cfg = getPageDataFromJSON(id);
 
    if (!cfg) {
        console.error(`No data found for ${id}`);
        return;
    }
 
    const size = cfg.getSize();
    const start = cfg.getStartPoint();
    // 이미 캐시에 있으므로 즉시 반환됨
    const src1 = await resolveImage(id);
 
    const first = createBasicPage({
        x: start.x,
        y: start.y,
        src: src1,
        label: '1p',
        size,
        rot: cfg.rotation || 0,
        pageId: id
    });
    pages.push(first);
    centerCameraOn(first, 0, 0);
    
    // 슬라이더 초기화
    updatePageInfo();
 })();

// ===== 페이지 생성 함수 (새 페이지) =====
async function createNextPage() {
    // clickLocked는 이미 nextBtn에서 설정됨
    if (current >= pageBases.length - 1) {
        clickLocked = false; // 마지막 페이지면 잠금 해제
        return;
    }

    const nextIdx = current + 1;
    
    // 이미 생성된 페이지면 중단
    if (pages[nextIdx]) {
        clickLocked = false;
        return;
    }

    const prev = pages[current];
    const prevType = prev?._type || 'basic';
    const nextPageId = pageBases[nextIdx];
    
    // 빈 페이지인 경우 이미지 없이 생성
    const nextType = pageTypeMap[nextPageId] || 'basic';
    const src = nextType === 'blank' ? '' : await resolveImage(nextPageId);

    // JSON 데이터 또는 기존 config 사용
    const nextCfg = getPageDataFromJSON(nextPageId) || pageConfigs[nextType];
    const nextSize = nextCfg.getSize();
    const start = nextCfg.getStartPoint();
    const rotForNext = nextCfg.rotation || 0;  // JSON에서 rotation 가져오기

    const next = createBasicPage({
        x: start.x,
        y: start.y,
        src,
        label: `${nextIdx + 1}p`,
        size: nextSize,
        rot: rotForNext,
        type: nextType,
        pageId: nextPageId  // ✅ pageId 전달
    });
    
    pages.push(next);
    
    // p32는 p33-p37보다 위에 위치하도록 z-index 설정 (DOM 추가 후에도 적용되도록)
    if (nextPageId === 'p35') {
        // DOM에 추가된 후 z-index 설정
        setTimeout(() => {
            if (next && next.parentElement) {
                next.style.zIndex = '10';
                if (DEBUG) console.log('✅ p32 z-index 설정:', next.style.zIndex);
            }
        }, 0);
    }

    // ✅ 카메라 회전을 고려한 "아래" 방향 계산
    // 카메라는 페이지의 반대 방향으로 회전하므로 -rotForNext를 사용
    const cameraRotRad = (-rotForNext * Math.PI) / 180;
    const downX = Math.sin(cameraRotRad);   // 카메라 시점에서 아래 방향의 x 성분
    const downY = Math.cos(cameraRotRad);   // 카메라 시점에서 아래 방향의 y 성분

    const dist = nextSize.h * 1.2;
    const fromX = downX * dist;
    const fromY = downY * dist;
    
    if (DEBUG) console.log(`📄 [페이지 생성] ${nextPageId} | 페이지 회전: ${rotForNext}° | 카메라 회전: ${-rotForNext}° | 시작위치: (${fromX.toFixed(1)}, ${fromY.toFixed(1)})`);

    // 애니메이션
    const tl = gsap.timeline({ defaults: { ease: 'power3.inOut', duration: 0.8 } });
    tl.fromTo(next, { x: fromX, y: fromY }, { x: 0, y: 0 }, 0);

    // 빈 페이지인 경우
    if (nextType === 'blank') {
        // 빈 페이지는 카메라만 이동하고 바로 잠금 해제
        tl.add(() => {
            centerCameraOn(next, 0.8, nextIdx, false, () => {
                // p40인 경우 0.2초 후 자동으로 다음 페이지 생성
                if (nextPageId === 'p43') {
                    setTimeout(async () => {
                        if (!clickLocked && current < pageBases.length - 1) {
                            await createNextPage();
                        }
                    }, 200);
                }
            });
        }, 0);
    } else {
        // scrollPath가 있는 경우 special 페이지로 처리
        const absScrollPts = nextCfg.getScrollPoints();
        const hasScrollPath = absScrollPts && absScrollPts.length > 0;
        
        if (nextType.startsWith('special') || hasScrollPath) {        // ✅ 특수 페이지 또는 scrollPath가 있는 페이지
            // p32인 경우 p33-p37을 먼저 생성
            if (nextPageId === 'p35') {
                await preloadP33ToP37();
                // p32의 z-index를 명시적으로 설정 (p33-p37 생성 후)
                next.style.zIndex = '10';
                if (DEBUG) console.log('✅ p32 z-index 설정 (special 페이지):', next.style.zIndex);
            }
            
            // centerCameraOn은 이제 250ms 후 자동으로 clickLocked 해제
            // skipUnlock = false로 변경하여 짧은 딜레이만 적용
            tl.add(() => {
                centerCameraOn(next, 0.8, nextIdx, false, () => {
                    // p40인 경우 0.2초 후 자동으로 다음 페이지 생성
                    if (nextPageId === 'p40') {
                        setTimeout(async () => {
                            if (!clickLocked && current < pageBases.length - 1) {
                                await createNextPage();
                            }
                        }, 200);
                    }
                });
            }, 0);

            // 애니메이션 완료 후 스크롤 활성화
            tl.call(() => {
                // JSON의 scrollPath는 절대 좌표
                
                // scrollPath 점이 4개 이하인 경우 첫 번째 점만 사용하고 scrollPath 비활성화
                if (!absScrollPts || absScrollPts.length === 0 || absScrollPts.length <= 4) {
                if (absScrollPts && absScrollPts.length > 0) {
                    const firstPoint = absScrollPts[0];
                    // 첫 번째 점 중심으로 카메라 이동
                    const tx = innerWidth / 2 - firstPoint.x;
                    const ty = innerHeight / 2 - firstPoint.y;
                    
                    gsap.to(viewer, {
                        x: tx,
                        y: ty,
                        duration: 0.8,
                        ease: 'power3.inOut',
                        overwrite: 'auto',
                        // force3D 제거: 거대한 컨테이너는 GPU 가속 사용 안 함
                        // clickLocked는 centerCameraOn에서 250ms 후 자동 해제됨 (onComplete 제거)
                    });
                }
                return;
            }

            // 스크롤 위치 초기화
            window.scrollTo(0, 0);

            // JSON의 scrollPath는 절대 좌표 → 페이지 로컬 좌표로 변환
            const pageLeft = start.x - nextSize.w / 2;
            const pageTop = start.y - nextSize.h / 2;

            const localPts = absScrollPts.map(pt => ({
                x: pt.x - pageLeft,
                y: pt.y - pageTop
            }));

            // special 페이지 스크롤 허용 + ScrollTrigger 부착
            scrollBlocked = false;
            // 타입이 special로 시작하지 않으면 special1로 처리
            const scrollType = nextType.startsWith('special') ? nextType : 'special1';
            attachSpecialScrollPath(next, start, nextSize, localPts, scrollType);

            // clickLocked는 centerCameraOn에서 250ms 후 자동 해제됨
            });
        } else {
            // 일반 페이지 (basic, blank 등)
            tl.add(() => {
                centerCameraOn(next, 0.8, nextIdx, false, () => {
                    // p40인 경우 0.2초 후 자동으로 다음 페이지 생성
                    if (nextPageId === 'p43') {
                        setTimeout(async () => {
                            if (!clickLocked && current < pageBases.length - 1) {
                                await createNextPage();
                            }
                        }, 200);
                    }
                });
            }, 0);
        }
    }

    // ⛔️ current와 updatePageInfo 제거 - onComplete에서 처리
    // current = nextIdx;      <-- ❌ 삭제!
    // updatePageInfo();       <-- ❌ 삭제!
}

// ===== 화면 클릭 네비게이션 =====
document.addEventListener('click', async (e) => {
    // 클릭 이벤트 즉시 처리하여 반응성 향상
    if (clickLocked || isModalOpen || isOverviewMode) {
        return; // 잠금 상태이거나 모달이 열려있거나 Overview 모드면 즉시 반환
    }
    
    // UI 요소 클릭은 무시
    if (e.target.closest('#ui')) return;
    if (e.target.closest('#pageSlider')) return;
    if (e.target.closest('#overviewToggle')) return;
    if (e.target.closest('#infoToggle')) return;
    if (e.target.closest('#infoPanel')) return;
    if (e.target.closest('#appTitle')) return;
    if (e.target.closest('.special-mini-map')) return;
    if (e.target.closest('.modal')) return;
    
    // 현재 페이지 ID 확인
    const currentPageId = pageBases[current];
    
    // 현재 32p이고 스크롤 중이면 클릭 무시
    if (currentPageId === 'p35' && activeST) {
        return;
    }
    
    // 클릭 위치에 따라 좌우 영역 구분
    const clickX = e.clientX;
    const screenWidth = window.innerWidth;
    const leftThird = screenWidth / 2;
    
    // 왼쪽 1/3 영역 클릭 → 이전 페이지
    if (clickX < leftThird) {
        if (current > 0) {
            prevBtn.click();
        }
    } 
    // 오른쪽 2/3 영역 클릭 → 다음 페이지
    else {
        // 선택지 경로의 마지막 페이지에서 다음으로 가려고 할 때 Overview 모드로 전환
        const isPath1End = selectedPath === 'path1' && currentPageId === 'p83';
        const isPath2End = selectedPath === 'path2' && currentPageId === 'p96';
        
        if (isPath1End || isPath2End) {
            if (!isOverviewMode) {
                enterOverviewMode(false); // 깜빡임 없이 Overview 모드로
            }
            return;
        }
        
        if (current < pageBases.length - 1) {
            // 32p에서 다음으로 가려고 할 때는 스크롤 완료 후 38로 이동하므로 무시
            if (currentPageId === 'p35') {
                return;
            }
            
            // ✅ 이미 생성된 페이지면 카메라만 이동
            if (pages[current + 1]) {
                nextBtn.click();
            } else {
                await createNextPage();
            }
        }
    }
});

// ===== UI 업데이트 =====
function getDisplayIndex() {
    return specialProgressIndex !== null ? specialProgressIndex : current;
}

function updatePageInfo() {
    const displayIndex = getDisplayIndex();
    pageInfo.textContent = `${displayIndex + 1} / ${pageBases.length}`;

    // 버튼 활성화/비활성화
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current >= pageBases.length - 1;
    
    // 슬라이더 업데이트
    // - max: 전체 페이지 수 (처음부터 모든 페이지 표시)
    // - 실제 이동 가능 범위: 생성된 페이지까지만
    const totalPages = pageBases.length;
    const maxCreatedPage = pages.length;
    if (totalPages > 0 && maxCreatedPage > 0) {
        isSliderUpdating = true; // 무한 루프 방지
        sliderInput.max = totalPages;
        sliderMax.textContent = totalPages;
        const currentPageNum = displayIndex + 1;
        sliderInput.value = currentPageNum;
        updateSliderTooltip(currentPageNum);
        
        // 슬라이더 왼쪽 라벨을 현재 페이지 번호로 업데이트
        const sliderCurrent = document.getElementById('sliderCurrent');
        if (sliderCurrent) {
            sliderCurrent.textContent = currentPageNum;
        }
        
        // 다음 이벤트 루프에서 플래그 해제
        setTimeout(() => {
            isSliderUpdating = false;
        }, 0);
    }
}

// ===== 네비게이션 버튼 =====
prevBtn.addEventListener('click', () => {
    // 클릭 이벤트 즉시 처리하여 반응성 향상
    if (clickLocked || current <= 0 || isOverviewMode) {
        return; // 잠금 상태이거나 첫 페이지거나 Overview 모드면 즉시 반환
    }
    
    // 특수 스크롤 진행 중이면 먼저 정리
    if (activeST) {
        killSpecialScroll();
    }
    clickLocked = true; // ✅ 먼저 잠그고
    const targetIndex = current - 1;
    const targetPage = pages[targetIndex];

    if (targetPage) {
        // scrollPath가 있는지 확인
        const targetPageId = pageBases[targetIndex];
        const targetCfg = getPageDataFromJSON(targetPageId);
        const targetScrollPts = targetCfg ? targetCfg.getScrollPoints() : [];
        const hasScrollPath = targetScrollPts && targetScrollPts.length > 0;
        const isSpecial = (targetPage._type || '').startsWith('special') || hasScrollPath;
        
        // ✅ "어디로 갈지" 정보만 넘겨줍니다. 상태 변경은 onComplete에서
        centerCameraOn(targetPage, 0.8, targetIndex, false, () => {
            if (isSpecial) {
                setupSpecialScrollForPage(targetPage, targetIndex);
            }
        });
    } else {
        clickLocked = false; // 이동할 페이지가 없으면 잠금 해제
    }
});

nextBtn.addEventListener('click', async () => {
    // 클릭 이벤트 즉시 처리하여 반응성 향상
    if (clickLocked || current >= pageBases.length - 1 || isOverviewMode) {
        return; // 잠금 상태이거나 마지막 페이지거나 Overview 모드면 즉시 반환
    }
    
    const currentPageId = pageBases[current];
    
    // 선택지 경로의 마지막 페이지에서 다음으로 가려고 할 때 Overview 모드로 전환
    const isPath1End = selectedPath === 'path1' && currentPageId === 'p83';
    const isPath2End = selectedPath === 'path2' && currentPageId === 'p96';
    
    if (isPath1End || isPath2End) {
        if (!isOverviewMode) {
            enterOverviewMode(false); // 깜빡임 없이 Overview 모드로
        }
        return;
    }
    
    // p70에서 다음으로 가려고 할 때 선택지가 없으면 선택지 모달 표시
    // 단, 모두보기 모드 중이면 모달을 띄우지 않음
    if (currentPageId === 'p74' && selectedPath === null && !isAllPagesMode) {
        showChoiceModal();
        return;
    }
    
    // 32p에서 다음으로 가려고 할 때는 무시 (스크롤 완료 후 38로 자동 이동)
    if (currentPageId === 'p35') {
        return;
    }
    
    // 특수 스크롤 진행 중이면 먼저 정리
    if (activeST) {
        killSpecialScroll();
    }
    clickLocked = true; // ✅ 먼저 잠그고
    const targetIndex = current + 1;
    const targetPage = pages[targetIndex];

    if (targetPage) {
        // scrollPath가 있는지 확인
        const targetPageId = pageBases[targetIndex];
        const targetCfg = getPageDataFromJSON(targetPageId);
        const targetScrollPts = targetCfg ? targetCfg.getScrollPoints() : [];
        const hasScrollPath = targetScrollPts && targetScrollPts.length > 0;
        const isSpecial = (targetPage._type || '').startsWith('special') || hasScrollPath;
        
        // 이미 생성된 페이지: ✅ "어디로 갈지" 정보만 넘겨줍니다.
        centerCameraOn(targetPage, 0.8, targetIndex, false, () => {
            if (isSpecial) {
                setupSpecialScrollForPage(targetPage, targetIndex);
            }
        });
    } else {
        // 생성되지 않은 페이지: ✅ 생성 함수 호출
        await createNextPage();
    }
});

// ===== 키보드 네비게이션 =====
addEventListener('keydown', (e) => {
    if (!clickLocked && !isOverviewMode) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            // ✅ nextBtn 클릭과 동일
            nextBtn.click();
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            // ✅ prevBtn 클릭과 동일
            prevBtn.click();
        }
        // 디버깅용: 1 키를 누르면 p70까지 모든 페이지 생성 후 선택지 모달 표시
        if (e.key === '1') {
            e.preventDefault();
            goToP70WithAllPages();
        }
    }
});

// ===== 슬라이더 네비게이션 =====
let isSliderUpdating = false; // 슬라이더 업데이트 중 플래그 (무한 루프 방지)
let sliderWarningCount = 0; // 아직 생성되지 않은 페이지로 이동 시도 횟수

// 툴팁 업데이트 함수
// updateProgress: true일 때만 progress bar 업데이트 (기본값: true)
function updateSliderTooltip(value, updateProgress = true) {
    sliderTooltip.textContent = value;

    const min = parseInt(sliderInput.min);
    const max = parseInt(sliderInput.max);
    const safeMax = isNaN(max) || max === min ? min + 1 : max;
    const ratio = (value - min) / (safeMax - min);
    const pct = Math.max(0, Math.min(1, ratio)) * 100;
    sliderTooltip.style.left = pct + '%';
    
    // 슬라이더 진행 부분 업데이트 (현재까지 본 부분) - updateProgress가 true일 때만
    if (updateProgress) {
        const sliderProgress = document.getElementById('sliderProgress');
        if (sliderProgress) {
            sliderProgress.style.width = pct + '%';
        }
    }
}

// 슬라이더 트랙 위에 마우스 올렸을 때 툴팁만 표시 (thumb는 이동하지 않음)
const sliderContainer = document.querySelector('.slider-container');
const sliderTrackWrapper = document.querySelector('.slider-track-wrapper');
if (sliderContainer && sliderTrackWrapper) {
    // sliderInput을 완전히 비활성화 (항상 pointer-events: none 유지)
    sliderInput.style.pointerEvents = 'none';
    
    // sliderInput의 모든 마우스 이벤트를 완전히 막기
    const blockAllEvents = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
    };
    
    // 모든 마우스 이벤트 차단
    ['mousemove', 'mouseenter', 'mouseover', 'mousedown'].forEach(eventType => {
        sliderInput.addEventListener(eventType, blockAllEvents, { passive: false, capture: true });
    });
    
    // sliderContainer에서 툴팁 표시 (progress bar는 업데이트하지 않음) - 넓은 영역에서 작동
    sliderContainer.addEventListener('mousemove', (e) => {
        e.stopPropagation();
        const rect = sliderContainer.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const min = parseInt(sliderInput.min);
        const max = parseInt(sliderInput.max);
        const value = Math.round(min + percent * (max - min));
        const clampedValue = Math.max(min, Math.min(max, value));
        updateSliderTooltip(clampedValue, false); // progress bar 업데이트 안 함
    });
    
    sliderContainer.addEventListener('mouseleave', () => {
        updateSliderTooltip(getDisplayIndex() + 1);
    });
    
    // 슬라이더 컨테이너 클릭 시 페이지 이동 (넓은 영역에서 작동)
    sliderContainer.addEventListener('click', async (e) => {
        if (isSliderUpdating || clickLocked || isModalOpen || isOverviewMode) return;
        
        const rect = sliderContainer.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const min = parseInt(sliderInput.min);
        const max = parseInt(sliderInput.max);
        const value = Math.round(min + percent * (max - min));
        const targetPageNum = Math.max(min, Math.min(max, value));
        const targetIndex = targetPageNum - 1;
        const maxCreatedPage = pages.length;
        
        // 생성되지 않은 페이지를 클릭한 경우
        if (targetPageNum > maxCreatedPage) {
            // 경고 카운터 증가
            sliderWarningCount++;
            if (DEBUG) console.log(`⚠️ 생성되지 않은 페이지 클릭 시도: ${sliderWarningCount}번째`);
            
            // 5번 연속 시도 시 경고 토스트 표시
            if (sliderWarningCount >= 5) {
                showSliderWarningToast();
                sliderWarningCount = 0; // 카운터 리셋
            }
            return;
        }
        
        // 생성된 페이지로 이동하면 경고 카운터 리셋
        sliderWarningCount = 0;
        
        // 현재 페이지와 같으면 무시
        if (targetIndex === current) {
            return;
        }
        
        // 생성된 페이지 범위를 벗어나면 무시
        if (targetIndex < 0 || targetIndex >= pages.length) {
            return;
        }
        
        const targetPageId = pageBases[targetIndex];
        
        // 슬라이더 값 업데이트
        isSliderUpdating = true;
        sliderInput.value = targetPageNum;
        updateSliderTooltip(targetPageNum);
        const sliderCurrent = document.getElementById('sliderCurrent');
        if (sliderCurrent) {
            sliderCurrent.textContent = targetPageNum;
        }
        
        // 특수 스크롤이 살아있다면 먼저 완전히 종료
        if (activeST) {
            killSpecialScroll();
        }
        
        // 페이지 이동
        const targetPage = pages[targetIndex];
        if (targetPage) {
            const isSpecial = (targetPage._type || '').startsWith('special');
            centerCameraOn(targetPage, 0.8, targetIndex, false, () => {
                if (isSpecial) {
                    setupSpecialScrollForPage(targetPage, targetIndex);
                }
            });
        } else {
            // 페이지가 생성되지 않았다면 생성
            await createNextPage();
        }
        
        setTimeout(() => {
            isSliderUpdating = false;
        }, 100);
    });
    
    // thumb를 직접 클릭/드래그할 때만 활성화
    // thumb는 ::-webkit-slider-thumb이므로 직접 접근이 어려움
    // 대신 sliderInput의 click 이벤트를 사용하되, 트랙 클릭은 막기
    sliderInput.addEventListener('click', (e) => {
        const rect = sliderInput.getBoundingClientRect();
        const min = parseInt(sliderInput.min);
        const max = parseInt(sliderInput.max);
        const currentValue = parseInt(sliderInput.value);
        const percent = (currentValue - min) / (max - min);
        const thumbX = rect.left + percent * rect.width;
        const thumbSize = 12;
        const distance = Math.abs(e.clientX - thumbX);
        
        // thumb 근처가 아니면 클릭 무시
        if (distance > thumbSize) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }, { passive: false, capture: true });
}

// 슬라이더 값 변경 시 툴팁 업데이트 및 페이지 이동
// input 이벤트는 사용자가 직접 드래그하거나 클릭했을 때만 발생
sliderInput.addEventListener('input', async (e) => {
    // pointer-events는 변경하지 않음 - 항상 none으로 유지
    let targetPageNum = parseInt(e.target.value);
    updateSliderTooltip(targetPageNum);
    
    // 슬라이더 왼쪽 라벨도 업데이트
    const sliderCurrent = document.getElementById('sliderCurrent');
    if (sliderCurrent) {
        sliderCurrent.textContent = targetPageNum;
    }
    
    if (isSliderUpdating || clickLocked || isOverviewMode) return;

    // 🔴 특수 스크롤이 살아있다면 먼저 완전히 종료
    if (activeST) {
        killSpecialScroll();
    }
    
    const targetIndex = targetPageNum - 1; // 0-based index
    const targetPageId = pageBases[targetIndex];
    
    const maxCreatedPage = pages.length;      // 실제로 생성된 페이지 수
    const maxReachableNum = Math.max(1, maxCreatedPage); // 최소 1
    
    // 아직 생성되지 않은 페이지로 가려고 하면, 마지막으로 생성된 페이지로 되돌림
    if (targetPageNum > maxReachableNum) {
        // 경고 카운터 증가
        sliderWarningCount++;
        
        // 5번 연속 시도 시 경고 토스트 표시
        if (sliderWarningCount >= 5) {
            showSliderWarningToast();
            sliderWarningCount = 0; // 카운터 리셋
        }
        
        isSliderUpdating = true;
        targetPageNum = maxReachableNum;
        sliderInput.value = targetPageNum;
        updateSliderTooltip(targetPageNum);
        setTimeout(() => {
            isSliderUpdating = false;
        }, 0);
        return;
    }
    
    // 생성된 페이지로 이동하면 경고 카운터 리셋
    if (targetIndex < pages.length) {
        sliderWarningCount = 0;
    }
    
    // 생성된 페이지 범위를 벗어나면 무시 (예외 방어용)
    if (targetIndex < 0 || targetIndex >= pages.length) {
        return;
    }
    
    // 현재 페이지와 같으면 무시
    if (targetIndex === current) {
        return;
    }
    
    clickLocked = true;
    
    // 생성된 페이지로 이동
    if (pages[targetIndex]) {
        const targetPage = pages[targetIndex];
        const isSpecial = (targetPage._type || '').startsWith('special');
        centerCameraOn(targetPage, 0.8, targetIndex, false, () => {
            if (isSpecial) {
                setupSpecialScrollForPage(targetPage, targetIndex);
            }
        });
    } else {
        // 페이지가 생성되지 않았다면 생성 필요
        // 하지만 슬라이더는 생성된 페이지까지만 이동 가능하므로 이 경우는 발생하지 않아야 함
        clickLocked = false;
    }
});

// 슬라이더가 UI 업데이트로 인해 변경될 때는 이벤트를 발생시키지 않도록
// mousedown 이벤트는 위에서 이미 처리되므로 여기서는 제거
// sliderInput.addEventListener('mousedown', () => {
//     isSliderUpdating = false;
// });




// ===== scroll =====
let activeST = null, specialSvg = null, specialSpacer = null;
// 오른쪽 상단 미니맵용 요소들
let specialMini = null, specialMiniIndicator = null, specialMiniMeta = null;
// 현재 스크롤 트리거가 연결된 special 페이지 엘리먼트
let activeScrollPageEl = null;
// 각 special 페이지별 스크롤 완료 상태 (pageId → boolean)
const specialScrollDone = {};
// 스크롤 100% 도달 후 추가 스크롤 감지용
let isScrollAtMax = false;
let scrollAtMaxWheelHandler = null;

// 이미 생성된 special 페이지에 대해 scrollTrigger와 미니맵을 다시 세팅
function setupSpecialScrollForPage(pageEl, pageIndex) {
    // 혹시 남아 있을지 모르는 이전 special 스크롤 상태를 먼저 완전히 정리
    if (activeST || specialSvg || specialSpacer || specialMini) {
        killSpecialScroll();
    }

    const pageId = pageEl.dataset.pageId || pageBases[pageIndex];
    const cfg = getPageDataFromJSON(pageId);
    if (!cfg) return;

    const size = cfg.getSize();
    const start = cfg.getStartPoint();

    // JSON의 scrollPath는 절대 좌표 → 페이지 로컬 좌표로 변환
    const absScrollPts = cfg.getScrollPoints();
    if (!absScrollPts || !absScrollPts.length) return;

    // scrollPath 점이 4개 이하인 경우 첫 번째 점만 사용하고 scrollPath 비활성화
    if (absScrollPts.length <= 4) {
        const firstPoint = absScrollPts[0];
        // 첫 번째 점 중심으로 카메라 이동
        const tx = innerWidth / 2 - firstPoint.x;
        const ty = innerHeight / 2 - firstPoint.y;
        
        gsap.to(viewer, {
            x: tx,
            y: ty,
            duration: 0.8,
            ease: 'power3.inOut',
            overwrite: 'auto',
            // force3D 제거: 거대한 컨테이너는 GPU 가속 사용 안 함
            onComplete: () => {
                clickLocked = false;
                
                // scrollPath가 비활성화된 경우에도 자동으로 다음 페이지로 이동
                // 약간의 딜레이 후 자동 이동
                if (!clickLocked && !isModalOpen && current < pageBases.length - 1) {
                    setTimeout(async () => {
                        // 다시 확인 (이미 이동했을 수 있음)
                        if (!clickLocked && !isModalOpen && current < pageBases.length - 1) {
                            clickLocked = true;
                            
                            // 다음 페이지로 이동
                            const targetIndex = current + 1;
                            const targetPage = pages[targetIndex];
                            
                            if (targetPage) {
                                const isSpecial = (targetPage._type || '').startsWith('special');
                                centerCameraOn(targetPage, 0.8, targetIndex, false, () => {
                                    if (isSpecial) {
                                        setupSpecialScrollForPage(targetPage, targetIndex);
                                    }
                                });
                            } else {
                                // 페이지가 생성되지 않았다면 생성
                                await createNextPage();
                            }
                        }
                    }, 1000); // 1초 후 자동 이동
                }
            }
        });
        
        // scrollPath 활성화하지 않음
        return;
    }

    const pageLeft = start.x - size.w / 2;
    const pageTop = start.y - size.h / 2;
    const localPts = absScrollPts.map(pt => ({
        x: pt.x - pageLeft,
        y: pt.y - pageTop
    }));

    // 스크롤 위치 초기화 (다른 페이지에서 내려와도 항상 맨 위에서 시작)
    window.scrollTo(0, 0);

    // special 페이지 스크롤 허용
    scrollBlocked = false;

    // 32p인 경우 33~37 페이지 미리 생성 (숨김 상태)
    if (pageId === 'p35') {
        preloadP33ToP37();
    }

    attachSpecialScrollPath(pageEl, start, size, localPts, pageEl._type || pageTypeMap[pageId] || 'special1');
    
    // setupSpecialScrollForPage 호출 후 즉시 잠금 해제하여 반응성 향상
    // (attachSpecialScrollPath 내부에서 필요한 초기화가 완료된 후)
    setTimeout(() => {
        clickLocked = false;
    }, 100); // 100ms 딜레이로 초기화 완료 보장
}

// 스크롤 100% 도달 후 추가 스크롤 감지 핸들러 설정
function setupScrollAtMaxHandler() {
    if (scrollAtMaxWheelHandler) return; // 이미 설정되어 있으면 중복 방지
    
    scrollAtMaxWheelHandler = async (e) => {
        // 아래로 스크롤하려고 할 때만 다음 페이지로 이동
        if (e.deltaY > 0 && !clickLocked && !isModalOpen) {
            // 다음 페이지가 있는지 확인
            if (current < pageBases.length - 1) {
                e.preventDefault();
                e.stopPropagation();
                
                // 특수 스크롤 정리
                if (activeST) {
                    killSpecialScroll();
                }
                
                // 다음 페이지로 이동
                clickLocked = true;
                const targetIndex = current + 1;
                const targetPage = pages[targetIndex];
                
                if (targetPage) {
                    const isSpecial = (targetPage._type || '').startsWith('special');
                    centerCameraOn(targetPage, 0.8, targetIndex, false, () => {
                        if (isSpecial) {
                            setupSpecialScrollForPage(targetPage, targetIndex);
                        }
                    });
                } else {
                    // 페이지가 생성되지 않았다면 생성
                    await createNextPage();
                }
            }
        }
    };
    
    window.addEventListener('wheel', scrollAtMaxWheelHandler, { passive: false });
}

// 스크롤 100% 도달 후 추가 스크롤 감지 핸들러 제거
function removeScrollAtMaxHandler() {
    if (scrollAtMaxWheelHandler) {
        window.removeEventListener('wheel', scrollAtMaxWheelHandler);
        scrollAtMaxWheelHandler = null;
    }
}

// 32p 관련: 33~37 페이지 요소 저장
let p33ToP37Pages = [];

// 32p 스크롤 진행률에 따라 33~37 페이지 순차 표시
async function preloadP33ToP37() {
    // 이미 생성되어 있으면 스킵
    if (p33ToP37Pages.length > 0) return;
    
    const pageIds = ['p36', 'p37', 'p38', 'p39', 'p40'];
    const startIndex = pageBases.findIndex(id => id === 'p36');
    
    if (startIndex === -1) return;
    
    // p36-p40을 한번에 생성
    for (let i = 0; i < pageIds.length; i++) {
        const pageId = pageIds[i];
        const pageIndex = startIndex + i;
        
        if (pageIndex >= pageBases.length) break;
        if (pageBases[pageIndex] !== pageId) continue;
        
        // 이미 생성된 페이지면 사용
        if (pages[pageIndex]) {
            const pageEl = pages[pageIndex];
            pageEl.style.opacity = '0';
            pageEl.style.pointerEvents = 'none';
            pageEl._isP35Sequence = true; // 35p 시퀀스 페이지임을 표시
            // p36-p40은 p35보다 아래에 위치하도록 z-index 설정
            pageEl.style.zIndex = '1';
            p33ToP37Pages.push({ el: pageEl, index: pageIndex });
            continue;
        }
        
        // 페이지 생성
        const pageType = pageTypeMap[pageId] || 'basic';
        const src = pageType === 'blank' ? '' : await resolveImage(pageId);
        const cfg = getPageDataFromJSON(pageId) || pageConfigs[pageType];
        const pageSize = cfg.getSize();
        const pageStart = cfg.getStartPoint();
        const rot = cfg.rotation || 0;
        
        const pageEl = createBasicPage({
            x: pageStart.x,
            y: pageStart.y,
            src,
            label: `${pageIndex + 1}p`,
            size: pageSize,
            rot,
            type: pageType,
            pageId
        });
        
        // 초기에는 숨김 상태 (p32 스크롤에 따라 순서대로 드러남)
        pageEl.style.opacity = '0';
        pageEl.style.pointerEvents = 'none';
        pageEl.style.transition = 'opacity 0.5s ease';
        pageEl._isP35Sequence = true; // 35p 시퀀스 페이지임을 표시
        // p36-p40은 p35보다 아래에 위치하도록 z-index 설정
        pageEl.style.zIndex = '1';
        
        pages[pageIndex] = pageEl;
        pageStage.appendChild(pageEl);
        p33ToP37Pages.push({ el: pageEl, index: pageIndex });
    }
    
    if (DEBUG) console.log(`✅ p36-p40 페이지 생성 완료: ${p33ToP37Pages.length}개`);
}

// 32p 스크롤 진행률에 따라 33~37 페이지 표시 및 슬라이더 업데이트
function handleP32ScrollProgress(progress) {
    // progress를 5개 구간으로 나눔 (0%, 20%, 40%, 60%, 80%)
    const segmentCount = 5;
    const segmentSize = 1.0 / segmentCount;
    
    let lastVisibleIndex = -1;
    
    for (let i = 0; i < p33ToP37Pages.length; i++) {
        const threshold = i * segmentSize; // 0, 0.2, 0.4, 0.6, 0.8
        const pageEl = p33ToP37Pages[i].el;
        const pageIndex = p33ToP37Pages[i].index;
        
        if (progress >= threshold) {
            // 페이지 표시 (한번 표시되면 다시 숨기지 않음)
            if (pageEl.style.opacity !== '1') {
                pageEl.style.opacity = '1';
                pageEl.style.pointerEvents = 'auto'; // 클릭 가능하게
                if (DEBUG) console.log(`✅ p${33 + i} 표시됨 (progress: ${(progress * 100).toFixed(1)}%)`);
            }
            lastVisibleIndex = pageIndex;
        }
        // ✅ else 블록 제거 - 한번 표시된 페이지는 영구적으로 유지
    }
    
    // 마지막으로 보이는 페이지를 UI에만 반영 (실제 current는 유지)
    const newOverrideIndex = lastVisibleIndex !== -1 ? lastVisibleIndex : null;
    if (specialProgressIndex !== newOverrideIndex) {
        specialProgressIndex = newOverrideIndex;
        updatePageInfo();
        if (DEBUG && specialProgressIndex !== null) {
            console.log(`📍 슬라이더 업데이트(override): ${specialProgressIndex + 1} / ${pageBases.length}`);
        }
        if (DEBUG && specialProgressIndex === null) {
            console.log('📍 슬라이더 override 해제 → 실제 current 사용');
        }
    }

    // dim 효과는 실제로 보이는 페이지 기준으로 업데이트
    if (newOverrideIndex !== null && pages[newOverrideIndex]) {
        updatePageDimming(pages[newOverrideIndex]);
    } else if (pages[current]) {
        updatePageDimming(pages[current]);
    }
    
    // p37(마지막 페이지)까지 모두 표시되면 잠금 해제
    if (progress >= 0.8 && lastVisibleIndex === pageBases.findIndex(id => id === 'p40')) {
        if (clickLocked) {
            clickLocked = false;
            if (DEBUG) console.log('🔓 p37까지 표시 완료 - 네비게이션 잠금 해제');
        }
    }
}

// 32p 스크롤 완료 후 38로 이동
async function goToP38AfterP32() {
    if (clickLocked) return;
    
    const p38Index = pageBases.findIndex(id => id === 'p41');
    if (p38Index === -1) return;
    
    clickLocked = true;
    
    // ✅ p33~37 페이지는 그대로 유지 (숨기지 않음)
    
    // 특수 스크롤 정리
    if (activeST) {
        killSpecialScroll();
    }
    
    // 38 페이지로 이동
    const targetPage = pages[p38Index];
    if (targetPage) {
        const isSpecial = (targetPage._type || '').startsWith('special');
        centerCameraOn(targetPage, 0.8, p38Index, false, () => {
            if (isSpecial) {
                setupSpecialScrollForPage(targetPage, p38Index);
            }
        });
    } else {
        // 38 페이지 생성
        await createNextPage();
    }
}

function killSpecialScroll() {
    scrollBlocked = true;

    // ScrollTrigger 인스턴스가 남아있으면 완전히 제거
    if (activeST) {
        try {
            activeST.kill();
        } catch (_) {}
        activeST = null;
    }

    if (specialSvg) { specialSvg.remove(); specialSvg = null; }
    if (specialSpacer) { specialSpacer.remove(); specialSpacer = null; }

    // 특수 페이지 미니맵 제거
    if (specialMini) { specialMini.remove(); specialMini = null; }
    specialMiniIndicator = null;
    specialMiniMeta = null;

    // special 모드에서만 적용하던 스크롤바 숨김 클래스 제거
    document.body.classList.remove('hide-scrollbar');
    document.documentElement.classList.remove('hide-scrollbar');
    activeScrollPageEl = null;
    if (specialProgressIndex !== null) {
        specialProgressIndex = null;
        updatePageInfo();
        if (pages[current]) {
            updatePageDimming(pages[current]);
        }
    }
    
    // 스크롤 100% 도달 후 추가 스크롤 감지 핸들러 제거
    removeScrollAtMaxHandler();
    isScrollAtMax = false;
    
    // 32p 시퀀스 페이지 정리 (38로 이동할 때는 유지)
    // p33ToP37Pages는 유지 (다시 32p로 돌아올 수 있으므로)
}


function attachSpecialScrollPath(pageEl, start, size, points, pageType = 'special2') {
    // 이 special 페이지에 대한 스크롤 완료 상태 초기화
    const pageIdForScroll = pageEl.dataset.pageId || pageBases[current];
    specialScrollDone[pageIdForScroll] = false;
    pageEl._scrollDone = false;
    activeScrollPageEl = pageEl;
    
    // 타입에 따라 회전 여부 결정
    const enableRotation = pageType === 'special2';
    if (DEBUG) console.log(`🎬 [스크롤 경로 설정] 타입: ${pageType} | 회전: ${enableRotation ? 'ON' : 'OFF'}`);

    // special 페이지에서는 스크롤은 유지하되, 스크롤바만 시각적으로 숨김
    document.body.classList.add('hide-scrollbar');
    document.documentElement.classList.add('hide-scrollbar');

    // special1, special2 모두 오른쪽 상단 미니맵 생성
    if (pageType && pageType.startsWith('special')) {
        // 이전 미니맵 정리
        if (specialMini) { specialMini.remove(); }
        specialMiniIndicator = null;
        specialMiniMeta = null;

        // points 기준으로 bbox 계산
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const w = Math.max(1, maxX - minX);
        const h = Math.max(1, maxY - minY);

        const MINI_SIZE = 120;
        const PADDING = 20; // ✅ 패딩 증가 (10 → 20) - 인디케이터가 밖으로 나가지 않도록
        const INDICATOR_RADIUS = 4;
        const EXTRA_PADDING = INDICATOR_RADIUS + 2; // 인디케이터 반지름 + 여유공간
        const scale = Math.min((MINI_SIZE - (PADDING + EXTRA_PADDING) * 2) / w, (MINI_SIZE - (PADDING + EXTRA_PADDING) * 2) / h);

        specialMiniMeta = { minX, minY, scale, padding: PADDING + EXTRA_PADDING };

        // path d 생성 (축소/이동된 좌표) 및 첫 번째 점 좌표 계산
        const actualPadding = PADDING + EXTRA_PADDING;
        let firstMiniX = actualPadding;
        let firstMiniY = actualPadding;
        const miniD = 'M' + points.map((p, i) => {
            const mx = (p.x - minX) * scale + actualPadding;
            const my = (p.y - minY) * scale + actualPadding;
            if (i === 0) {
                firstMiniX = mx;
                firstMiniY = my;
            }
            return (i ? 'L' : '') + Math.round(mx) + ',' + Math.round(my);
        }).join(' ');

        const pageRot = -pageEl._rot || 0;
        const rotCx = MINI_SIZE / 2;
        const rotCy = MINI_SIZE / 2;

        specialMini = document.createElement('div');
        specialMini.className = 'special-mini-map';
        specialMini.innerHTML = `
            <svg viewBox="0 0 ${MINI_SIZE} ${MINI_SIZE}" style="overflow: visible;">
                <g transform="rotate(${pageRot} ${rotCx} ${rotCy})">
                    <path d="${miniD}" class="special-mini-path"></path>
                    <circle cx="${firstMiniX}" cy="${firstMiniY}" r="${INDICATOR_RADIUS}" class="special-mini-indicator"></circle>
                </g>
            </svg>
            <div class="special-mini-label">SCROLL</div>
        `;
        document.body.appendChild(specialMini);
        specialMiniIndicator = specialMini.querySelector('.special-mini-indicator');
    }

    // 1) SVG path (페이지 로컬 좌표계, 월드에 위치시킴)
    specialSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    specialSvg.setAttribute('width', size.w);
    specialSvg.setAttribute('height', size.h);
    specialSvg.style.position = 'absolute';

    // ✅ start는 중앙 좌표 → SVG는 왼쪽 상단에 위치
    specialSvg.style.left = (start.x - size.w / 2) + 'px';
    specialSvg.style.top = (start.y - size.h / 2) + 'px';
    specialSvg.style.pointerEvents = 'none';
    specialSvg.style.opacity = 0;               // 디버그 때 0.3 등으로 조정 가능
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathDFromPoints(points));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'none');
    specialSvg.appendChild(path);
    pageStage.appendChild(specialSvg);

    const rawPath = MotionPathPlugin.getRawPath(path);           // ✅ SVGPathElement → rawPath
    MotionPathPlugin.cacheRawPathMeasurements(rawPath);
    _lastAngle = undefined;

    // 2) 스페이서: 경로 길이에 비례(최소 2000px)
    const pathLen = Math.max(1, path.getTotalLength());
    const scrollSpeed = 3;  // 스크롤 느린 정도 (1=기본, 2=2배 느림, 3=3배 느림)

  specialSpacer = document.createElement('div');
    const spacerHeight = Math.max(2000, Math.round(pathLen * scrollSpeed));
    specialSpacer.style.height = spacerHeight + 'px';
    specialSpacer.style.pointerEvents = 'none';
    // 스크롤 끝까지 도달할 수 있도록 하단 여유 공간 추가
    specialSpacer.style.marginBottom = window.innerHeight + 'px';
  document.body.appendChild(specialSpacer);

    if (DEBUG) console.log(`📏 [스크롤 설정] 경로 길이: ${pathLen.toFixed(0)}px | 스페이서 높이: ${spacerHeight}px | 하단 여유: ${window.innerHeight}px`);

    // 디버그만: 경로 보이게
    // specialSvg.style.opacity = 0.3;
    // path.setAttribute('stroke', '#0ff');
    // path.setAttribute('stroke-width', '2');


    // 3) 스크롤 진행도 → path 위치/각도로 매핑, viewer를 반대로 이동해 센터 정렬
  activeST = ScrollTrigger.create({
    trigger: specialSpacer,
    start: 'top top',
    end: 'bottom bottom',
        scrub: 0.5,  // 작을수록 즉각 반응 (0.5 = 부드러우면서도 빠름)
        onKill: killSpecialScroll,
        invalidateOnRefresh: true,  // 리사이즈 시 재계산
    onUpdate(self) {
      const t = self.progress;
            
            // 🔍 디버그: progress 모니터링 (10% 단위로만 출력)
            if (DEBUG) {
                const progressPercent = Math.floor(t * 10) * 10;
                if (!self._lastLoggedProgress || self._lastLoggedProgress !== progressPercent) {
                    console.log(`📜 [스크롤] progress: ${(t * 100).toFixed(1)}% | scroll: ${window.scrollY.toFixed(0)}px | max: ${(document.documentElement.scrollHeight - window.innerHeight).toFixed(0)}px`);
                    self._lastLoggedProgress = progressPercent;
                }
            }

            // 32p 특수 처리: 스크롤 진행률에 따라 33~37 페이지 순차 표시
            if (pageIdForScroll === 'p35') {
                handleP32ScrollProgress(t);
            }

            // ✅ 스크롤 완료 체크 - 거의 끝까지 왔을 때 (0.93 이상)
            // 이제는 ScrollTrigger를 kill하지 않고, 상태만 기록 → 언제든 다시 위/아래로 스크롤 가능
            if (t >= 0.93) {
                if (scrollBlocked == false) {
                    if (!pageEl._scrollDone) {
                        if (DEBUG) console.log('🏁 [스크롤 완료] progress: ' + t.toFixed(3));
                    }
                    // 이 페이지의 스크롤 완료 상태 저장
                    specialScrollDone[pageIdForScroll] = true;
                    pageEl._scrollDone = true;
                    clickLocked = false;  // ✅ 스크롤 완료 시에도 네비게이션 가능
                    
                    // 32p 스크롤 완료 시 38로 자동 이동
                    // p37까지 표시되고 (0.8 이상) 조금 더 스크롤하면 (0.85 이상) 바로 p38로 이동
                    if (pageIdForScroll === 'p35' && t >= 0.85 && !pageEl._p38AutoMoveScheduled) {
                        const p37Index = pageBases.findIndex(id => id === 'p40');
                        // p37까지 표시되었는지 확인 (override 포함)
                        const hasReachedP37 = p37Index !== -1 && (specialProgressIndex === p37Index || current === p37Index);
                        if (hasReachedP37) {
                            pageEl._p38AutoMoveScheduled = true;
                            if (DEBUG) console.log('🚀 p37 표시 완료 - p38로 자동 이동 시작');
                            setTimeout(() => {
                                goToP38AfterP32();
                            }, 500);
                        }
                    }
                }
            }
            
            // 스크롤 100% 도달 시 처리
            if (pageIdForScroll === 'p74') {
                // p70 스크롤 완료 시 선택지 모달 표시
                if (t >= 0.99 && !pageEl._p70ChoiceShown && selectedPath === null && !isAllPagesMode) {
                    pageEl._p70ChoiceShown = true;
                    setTimeout(() => {
                        showChoiceModal();
                    }, 500); // 스크롤 완료 후 0.5초 딜레이
                }
            } else if (pageIdForScroll !== 'p35' || pageIdForScroll !== 'p43') {
                // p32가 아닌 다른 페이지의 경우 자동으로 다음 페이지로 이동
                // 0.99 이상이면 거의 완료로 간주 (정확히 1.0에 도달하지 않을 수 있음)
                if (t >= 0.99 && !isScrollAtMax) {
                    isScrollAtMax = true;
                    setupScrollAtMaxHandler();
                    
                    // 스크롤 100% 도달 시 자동으로 다음 페이지로 이동 (약간의 딜레이 후)
                    // 단, 이미 이동 중이거나 모달이 열려있으면 이동하지 않음
                    if (!clickLocked && !isModalOpen && current < pageBases.length - 1) {
                        // 한 번만 실행되도록 플래그 설정
                        if (!pageEl._autoNavScheduled) {
                            pageEl._autoNavScheduled = true;
                            
                            setTimeout(async () => {
                                // 다시 확인 (이미 이동했을 수 있음)
                                if (!clickLocked && !isModalOpen && current < pageBases.length - 1 && isScrollAtMax) {
                                    clickLocked = true;
                                    
                                    // 다음 페이지로 이동 (스크롤은 유지 - killSpecialScroll 호출 안 함)
                                    const targetIndex = current + 1;
                                    const targetPage = pages[targetIndex];
                                    
                                    if (targetPage) {
                                        const isSpecial = (targetPage._type || '').startsWith('special');
                                        // 이전 스크롤 정리 후 다음 페이지로 이동
                                        if (activeST) {
                                            killSpecialScroll();
                                        }
                                        centerCameraOn(targetPage, 0.8, targetIndex, false, () => {
                                            if (isSpecial) {
                                                setupSpecialScrollForPage(targetPage, targetIndex);
                                            }
                                        });
                                    } else {
                                        // 페이지가 생성되지 않았다면 생성
                                        // 이전 스크롤 정리
                                        if (activeST) {
                                            killSpecialScroll();
                                        }
                                        await createNextPage();
                                    }
                                }
                            }, 800); // 0.8초 후 자동 이동
                        }
                    }
                } else if (t < 0.99 && isScrollAtMax) {
                    isScrollAtMax = false;
                    removeScrollAtMaxHandler();
                    // 스크롤이 다시 위로 올라가면 플래그 리셋
                    if (pageEl._autoNavScheduled) {
                        pageEl._autoNavScheduled = false;
                    }
                }
            }

            const pos = MotionPathPlugin.getPositionOnPath(rawPath, t, true);

            // ✅ pageEl._absX는 이제 중앙 좌표 → 왼쪽 상단으로 변환
            const pageLeftX = pageEl._absX - size.w / 2;
            const pageTopY = pageEl._absY - size.h / 2;

            // pos.x, pos.y는 페이지 왼쪽 상단 기준 로컬 좌표
            const wx = pageLeftX + pos.x;
            const wy = pageTopY + pos.y;

            // ✅ wx, wy를 직접 사용
            const camX = innerWidth / 2 - wx;
            const camY = innerHeight / 2 - wy;

            // 1. viewer는 이동만 담당
      gsap.set(viewer, {
                x: camX,
                y: camY,
                // force3D 제거: 거대한 컨테이너는 GPU 가속 사용 안 함
            });

            // 2. cameraWrapper는 회전 담당 (타입에 따라 조건부)
            let appliedDeg = 0;
            const pageRotation = pageEl._rot || 0; // 페이지의 rot 값 가져오기
            const baseRotation = -pageRotation; // 카메라는 페이지 회전의 반대 방향
            
            if (enableRotation) {
                // special2: 경로를 따라 회전 + 페이지의 rot 유지
                const rawDeg = pos.angle;
                const smoothDeg = unwrapAngle(rawDeg);
                
                // pos.angle은 월드 좌표계 기준이므로, 페이지 로컬 좌표계로 변환
                const worldAngle = smoothDeg + ANGLE_OFFSET;
                const localAngle = worldAngle - pageRotation;  // 페이지 회전만큼 빼서 로컬 각도로
                const pathRotation = ROTATE_SIGN * localAngle;
                
                appliedDeg = baseRotation + pathRotation; // 페이지 rot + 경로 회전
                pageEl._liveRot = wrapDeg(appliedDeg);
            } else {
                // special1: 페이지의 rot 값만 유지 (0도가 아님)
                appliedDeg = baseRotation;
                pageEl._liveRot = baseRotation;
            }
            
            gsap.set(cameraWrapper, {
                rotation: appliedDeg,
                force3D: true
            });

            // 3. 오른쪽 상단 미니맵에 현재 위치 반영
            if (specialMiniIndicator && specialMiniMeta) {
                const { minX, minY, scale, padding } = specialMiniMeta;
                const miniX = (pos.x - minX) * scale + padding;
                const miniY = (pos.y - minY) * scale + padding;
                specialMiniIndicator.setAttribute('cx', miniX);
                specialMiniIndicator.setAttribute('cy', miniY);
            }

            //console.log(
            //    `[MotionPath] t=${t.toFixed(3)}`,
            //    `page-local=(${pos.x.toFixed(1)},${pos.y.toFixed(1)})`,
            //    `world(raw)=(${wx.toFixed(1)},${wy.toFixed(1)})`,
            //    `pivot=(${cx.toFixed(1)},${cy.toFixed(1)})`,
            //    `angle=${appliedDeg.toFixed(1)}°`
            //);
        }
    });
}


// + NEW (유틸)
function pathDFromPoints(pts) {                // M L L ... (직선 연결)
    if (!pts?.length) return 'M0,0';
    return 'M' + pts.map((p, i) => (i ? 'L' : '') + Math.round(p.x) + ',' + Math.round(p.y)).join(' ');
}

const ROTATE_SIGN = -1;     // 방향 맞추려면 -1 또는 1
const ANGLE_OFFSET = 0;   // 기본 보정 (0, -90 등)

let _lastAngle;

function unwrapAngle(deg) {
    if (_lastAngle == null) { _lastAngle = deg; return deg; }
    let a = deg;
    let diff = a - _lastAngle;
    if (diff > 180) a -= 360;
    if (diff < -180) a += 360;
    _lastAngle = a;
    return a;
}


window.addEventListener("wheel", e => { if (scrollBlocked) e.preventDefault(); }, { passive: false });
window.addEventListener("touchmove", e => { if (scrollBlocked) e.preventDefault(); }, { passive: false });
window.addEventListener("keydown", e => {
    if (scrollBlocked && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
    }
});

function parseSvgGroupId(fullId = '') {
   const trimmed = (fullId || '').trim();
   if (!trimmed) return null;
   const match = trimmed.match(/^p\d+/i);
   if (!match) return null;
   const numberPart = match[0].slice(1);
   const id = `p${numberPart}`;
   let suffix = trimmed.slice(match[0].length);
   suffix = suffix.replace(/^[\s_\-]+/, '').trim();
   suffix = suffix.split(/\s+/)[0];
   suffix = suffix.replace(/^_+/, '').replace(/_+$/, '');
   const type = suffix || 'basic';
   return { id, type };
}


function convertSvgToPagesJson(svgString) {
   const parser = new DOMParser();
   const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
   const pageData = [];

   const pageGroups = svgDoc.querySelectorAll('g[id]');

   pageGroups.forEach(group => {
       const fullId = group.id || '';
       const parsed = parseSvgGroupId(fullId);
       if (!parsed) return;
       const { id, type } = parsed;

       const boundsRect = group.querySelector('rect#bounds'); // id가 bounds인 rect만 찾도록 강화
       const scrollPath = group.querySelector('path[id^="scrollpath"]');
       if (!boundsRect) {
           console.warn(`페이지 그룹 "${fullId}"에 <rect id="bounds">가 없습니다. 건너뜁니다.`);
           return;
       }

       // 1. size 추출
       const size = {
           w: parseFloat(boundsRect.getAttribute('width')),
           h: parseFloat(boundsRect.getAttribute('height'))
       };

       // 2. world (position, rotation) 추출
       const transform = group.getAttribute('transform') || '';
       let tx = 0, ty = 0, rot = 0;

       const translateMatch = transform.match(/translate\(([^)]+)\)/);
       const rotateMatch = transform.match(/rotate\(([^)]+)\)/);

       if (translateMatch) {
           [tx, ty] = translateMatch[1].split(/\s*,\s*|\s+/).map(parseFloat);
       }
       if (rotateMatch) {
           const rotateParams = rotateMatch[1].split(/\s*,\s*|\s+/).map(parseFloat);
           rot = rotateParams[0];
       }
       
       // 최종 월드 좌표 (페이지 중앙 기준)
       const world = {
           x: (parseFloat(boundsRect.getAttribute('x')) || 0) + tx + size.w / 2,
           y: (parseFloat(boundsRect.getAttribute('y')) || 0) + ty + size.h / 2,
           rot: rot
       };
       
       // 3. scrollPath 추출
       let scrollPathPoints = [];
       if (scrollPath) {
           const d = scrollPath.getAttribute('d');
           // 'M'과 'L'을 기준으로 좌표만 추출 (정규식 사용)
           const pointsStr = d.replace(/[ML]/g, '').trim();
           const pointsArr = pointsStr.split(/\s*,\s*|\s+/).filter(p => p !== '');

           for (let i = 0; i < pointsArr.length; i += 2) {
               // 경로 좌표는 월드 기준이므로 변환 필요 없음 (수정된 SVG 기준)
               scrollPathPoints.push({
                   x: parseFloat(pointsArr[i]),
                   y: parseFloat(pointsArr[i+1]),
               });
           }
       }

       pageData.push({ id, type, world, size, scrollPath: scrollPathPoints });
   });

   pageData.sort((a, b) => {
       const numA = parseInt(a.id.replace('p', ''));
       const numB = parseInt(b.id.replace('p', ''));
       return numA - numB;
   });

   return pageData;
}
