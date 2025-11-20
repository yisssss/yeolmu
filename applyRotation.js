// pagerot.txt 파일을 읽어서 pages.json에 rotation 값 일괄 적용
const fs = require('fs');

function parsePageRotFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    
    const rotations = {}; // { p17: 90, p18: 90, ... }
    
    for (let i = 0; i < lines.length; i += 2) {
        if (i + 1 >= lines.length) break;
        
        const pageRange = lines[i];
        const rotLine = lines[i + 1];
        
        // rot: 90 형식에서 숫자 추출
        const rotMatch = rotLine.match(/rot:\s*(\d+)/i);
        if (!rotMatch) continue;
        
        const rot = parseFloat(rotMatch[1]);
        
        // 범위 처리 (p17-p19 또는 단일 p42)
        if (pageRange.includes('-')) {
            const [start, end] = pageRange.split('-').map(s => s.trim());
            const startNum = parseInt(start.replace('p', ''));
            const endNum = parseInt(end.replace('p', ''));
            
            for (let num = startNum; num <= endNum; num++) {
                rotations[`p${num}`] = rot;
            }
        } else {
            // 단일 페이지
            const pageId = pageRange.trim();
            rotations[pageId] = rot;
        }
    }
    
    return rotations;
}

// pages.json 파일 읽기 및 수정
try {
    console.log('📖 pagerot.txt 파일을 읽는 중...');
    const rotations = parsePageRotFile('pagerot.txt');
    
    console.log('📖 pages.json 파일을 읽는 중...');
    const pagesData = JSON.parse(fs.readFileSync('pages.json', 'utf-8'));
    
    let updatedCount = 0;
    
    // 각 페이지에 rotation 적용
    pagesData.forEach(page => {
        if (rotations[page.id]) {
            page.world.rot = rotations[page.id];
            updatedCount++;
            console.log(`✅ ${page.id}: rot = ${rotations[page.id]}°`);
        }
    });
    
    // 수정된 pages.json 저장
    console.log('💾 pages.json 파일로 저장 중...');
    fs.writeFileSync('pages.json', JSON.stringify(pagesData, null, 2), 'utf-8');
    
    console.log('✅ 완료!');
    console.log(`📄 총 ${updatedCount}개의 페이지에 rotation이 적용되었습니다.`);
    
} catch (error) {
    console.error('❌ 오류 발생:', error.message);
    console.error(error.stack);
}

