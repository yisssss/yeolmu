const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// 썸네일 설정
const THUMBNAIL_WIDTH = 400; // 썸네일 가로 크기 (픽셀)
const THUMBNAIL_QUALITY = 60; // JPEG 품질 (1-100, 낮을수록 용량 작음)
const THUMBNAIL_PNG_QUALITY = 8; // PNG 압축 레벨 (0-9, 높을수록 압축률 높음)
const THUMBNAIL_DIR = path.join(__dirname, 'images', 'thumbnails');

// thumbnails 폴더 생성
if (!fs.existsSync(THUMBNAIL_DIR)) {
    fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
    console.log('✅ thumbnails 폴더 생성 완료');
}

// images 폴더 경로
const imagesDir = path.join(__dirname, 'images');

// 이미지 파일 목록 가져오기
function getImageFiles() {
    const files = fs.readdirSync(imagesDir);
    return files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    }).sort((a, b) => {
        // p1, p2, ... 순서로 정렬
        const numA = parseInt(a.match(/p(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/p(\d+)/)?.[1] || '0');
        return numA - numB;
    });
}

// 썸네일 생성 함수
async function generateThumbnail(inputPath, outputPath, outputExt) {
    try {
        const stats = fs.statSync(inputPath);
        const originalSize = stats.size;
        
        let sharpInstance = sharp(inputPath)
            .resize(THUMBNAIL_WIDTH, null, {
                withoutEnlargement: true, // 원본보다 크게 만들지 않음
                fit: 'inside' // 비율 유지하면서 안에 맞춤
            });
        
        // 확장자에 따라 다른 형식으로 저장
        if (outputExt === '.png') {
            // PNG: 알파값 보존, 압축 레벨 설정
            sharpInstance = sharpInstance.png({ 
                compressionLevel: THUMBNAIL_PNG_QUALITY,
                quality: 100 // PNG는 quality 대신 compressionLevel 사용
            });
        } else {
            // JPG: 기존 설정 유지
            sharpInstance = sharpInstance.jpeg({ 
                quality: THUMBNAIL_QUALITY,
                mozjpeg: true // 최적화된 JPEG 인코딩
            });
        }
        
        await sharpInstance.toFile(outputPath);
        
        const thumbStats = fs.statSync(outputPath);
        const thumbnailSize = thumbStats.size;
        const compressionRatio = ((1 - thumbnailSize / originalSize) * 100).toFixed(1);
        
        return {
            success: true,
            originalSize,
            thumbnailSize,
            compressionRatio
        };
    } catch (error) {
        console.error(`❌ ${path.basename(inputPath)} 처리 실패:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// 메인 실행 함수
async function main() {
    console.log('🚀 썸네일 생성 시작...\n');
    console.log(`설정: 가로 ${THUMBNAIL_WIDTH}px, 품질 ${THUMBNAIL_QUALITY}%\n`);
    
    const imageFiles = getImageFiles();
    console.log(`📁 총 ${imageFiles.length}개 이미지 발견\n`);
    
    let successCount = 0;
    let failCount = 0;
    let totalOriginalSize = 0;
    let totalThumbnailSize = 0;
    
    // 각 이미지 처리
    for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const inputPath = path.join(imagesDir, file);
        const originalExt = path.extname(file).toLowerCase();
        
        // 원본 확장자에 맞춰 썸네일 확장자 결정 (PNG는 PNG, 나머지는 JPG)
        const outputExt = originalExt === '.png' ? '.png' : '.jpg';
        const outputFileName = path.basename(file, originalExt) + '_thumb' + outputExt;
        const outputPath = path.join(THUMBNAIL_DIR, outputFileName);
        
        process.stdout.write(`[${i + 1}/${imageFiles.length}] ${file} 처리 중... `);
        
        const result = await generateThumbnail(inputPath, outputPath, outputExt);
        
        if (result.success) {
            successCount++;
            totalOriginalSize += result.originalSize;
            totalThumbnailSize += result.thumbnailSize;
            const originalMB = (result.originalSize / 1024 / 1024).toFixed(2);
            const thumbMB = (result.thumbnailSize / 1024 / 1024).toFixed(2);
            console.log(`✅ 완료 (${originalMB}MB → ${thumbMB}MB, ${result.compressionRatio}% 감소)`);
        } else {
            failCount++;
            console.log(`❌ 실패`);
        }
    }
    
    // 결과 요약
    console.log('\n' + '='.repeat(50));
    console.log('📊 생성 완료 요약');
    console.log('='.repeat(50));
    console.log(`✅ 성공: ${successCount}개`);
    console.log(`❌ 실패: ${failCount}개`);
    console.log(`📦 원본 총 용량: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📦 썸네일 총 용량: ${(totalThumbnailSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`💾 절약된 용량: ${((totalOriginalSize - totalThumbnailSize) / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📉 평균 압축률: ${((1 - totalThumbnailSize / totalOriginalSize) * 100).toFixed(1)}%`);
    console.log(`📁 저장 위치: ${THUMBNAIL_DIR}`);
    console.log('='.repeat(50));
}

// 실행
main().catch(error => {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
});

