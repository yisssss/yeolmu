// Node.js 환경에서 실행되는 SVG to JSON 변환 스크립트
const fs = require('fs');
const { JSDOM } = require('jsdom');

// SVG 좌표를 2배로 확대하는 스케일 팩터
const SCALE_FACTOR = 2;

/**
 * SVG 파일 내용을 파싱하여 pages.json 형식의 배열로 변환합니다.
 * @param {string} svgString - SVG 파일의 전체 텍스트 내용
 * @returns {Array<Object>} pages.json 데이터 배열
 */
function convertSvgToPagesJson(svgString) {
    // 좌표값에 스케일 팩터를 적용하는 헬퍼 함수
    const scale = (val) => {
        const num = parseFloat(val);
        return isNaN(num) ? 0 : num * SCALE_FACTOR;
    };
    const dom = new JSDOM(svgString, { contentType: "text/xml" });
    const svgDoc = dom.window.document;
    const pageData = [];

    const pageGroups = svgDoc.querySelectorAll('g[id*="_"]');

    pageGroups.forEach(group => {
        const fullId = group.id;
        
        // 레이어 그룹 제외 (id가 'p'로 시작하지 않으면 건너뛰기)
        if (!fullId.startsWith('p')) {
            return;
        }
        
        const [id, type = 'basic'] = fullId.split('_');

        // bounds rect 찾기: id가 "bounds"로 시작하거나 data-name="bounds"
        const rects = Array.from(group.getElementsByTagName('rect'));
        const boundsRect = rects.find(r => {
            const id = r.getAttribute('id') || '';
            const dataName = r.getAttribute('data-name') || '';
            return id.startsWith('bounds') || dataName === 'bounds';
        });
        
        // scrollPath 찾기: path, line, polyline 모두 지원
        const paths = Array.from(group.getElementsByTagName('path'));
        const lines = Array.from(group.getElementsByTagName('line'));
        const polylines = Array.from(group.getElementsByTagName('polyline'));
        const allPaths = [...paths, ...lines, ...polylines];
        const scrollPath = allPaths.find(p => 
            (p.getAttribute('id') && p.getAttribute('id').includes('scrollpath')) || 
            p.getAttribute('data-name') === 'scrollpath'
        );
        

        if (!boundsRect) {
            console.warn(`페이지 그룹 "${fullId}"에 bounds rect가 없습니다. 건너뜁니다.`);
            return;
        }

        // 1. size 추출 (2배 확대)
        const size = {
            w: scale(boundsRect.getAttribute('width')),
            h: scale(boundsRect.getAttribute('height'))
        };

        // 2. world (position, rotation) 추출
        // rect의 transform을 우선 확인, 없으면 group의 transform 사용
        const rectTransform = boundsRect.getAttribute('transform') || '';
        const groupTransform = group.getAttribute('transform') || '';
        const transform = rectTransform || groupTransform;
        
        let tx = 0, ty = 0, rot = 0;

        const translateMatch = transform.match(/translate\(([^)]+)\)/);
        const rotateMatch = transform.match(/rotate\(([^)]+)\)/);

        if (translateMatch) {
            [tx, ty] = translateMatch[1].split(/\s*,\s*|\s+/).map(v => scale(v));
        }
        if (rotateMatch) {
            const rotateParams = rotateMatch[1].split(/\s*,\s*|\s+/).map(parseFloat);
            rot = rotateParams[0];
        }
        
        // 최종 월드 좌표 계산 (2배 확대)
        let worldX, worldY;
        const rectX = scale(boundsRect.getAttribute('x') || 0);
        const rectY = scale(boundsRect.getAttribute('y') || 0);
        
        if (rectTransform) {
            // rect에 transform이 있으면 translate 값이 최종 위치
            // (SVG에서 이미 회전과 이동이 적용된 상태)
            worldX = tx + size.w / 2;
            worldY = ty + size.h / 2;
        } else {
            // group transform이면 rect의 x,y에 더함
            worldX = rectX + tx + size.w / 2;
            worldY = rectY + ty + size.h / 2;
        }
        
        const world = {
            x: worldX,
            y: worldY,
            rot: rot
        };
        
        // 3. scrollPath 추출
        let scrollPathPoints = [];
        if (scrollPath) {
            const tagName = scrollPath.tagName.toLowerCase();
            
            if (tagName === 'line') {
                // line 태그: x1, y1, x2, y2 속성 사용 (2배 확대)
                scrollPathPoints.push({
                    x: scale(scrollPath.getAttribute('x1')),
                    y: scale(scrollPath.getAttribute('y1'))
                });
                scrollPathPoints.push({
                    x: scale(scrollPath.getAttribute('x2')),
                    y: scale(scrollPath.getAttribute('y2'))
                });
            } else if (tagName === 'polyline') {
                // polyline: points 속성 사용 (2배 확대)
                const points = scrollPath.getAttribute('points');
                const pointsArr = points.trim().split(/\s+/);
                for (let i = 0; i < pointsArr.length; i += 2) {
                    if (i + 1 < pointsArr.length) {
                        scrollPathPoints.push({
                            x: scale(pointsArr[i]),
                            y: scale(pointsArr[i + 1])
                        });
                    }
                }
            } else if (tagName === 'path') {
                // path: d 속성 사용 (2배 확대)
                const d = scrollPath.getAttribute('d');
                const pointsStr = d.replace(/[ML]/g, '').trim();
                const pointsArr = pointsStr.split(/\s*,\s*|\s+/).filter(p => p !== '');

                for (let i = 0; i < pointsArr.length; i += 2) {
                    scrollPathPoints.push({
                        x: scale(pointsArr[i]),
                        y: scale(pointsArr[i+1]),
                    });
                }
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

// 메인 실행
try {
    console.log('📖 shapes2.svg 파일을 읽는 중...');
    const svgContent = fs.readFileSync('final.svg', 'utf-8');
    
    console.log('🔄 SVG를 JSON으로 변환 중...');
    const jsonData = convertSvgToPagesJson(svgContent);
    
    console.log('💾 pages.json 파일로 저장 중...');
    fs.writeFileSync('pages.json', JSON.stringify(jsonData, null, 2), 'utf-8');
    
    console.log('✅ 완료! pages.json 파일이 생성되었습니다.');
    console.log(`📄 총 ${jsonData.length}개의 페이지가 변환되었습니다.`);
} catch (error) {
    console.error('❌ 오류 발생:', error.message);
    console.log('\n💡 jsdom이 설치되지 않았다면 다음 명령어를 실행하세요:');
    console.log('   npm install jsdom');
}


