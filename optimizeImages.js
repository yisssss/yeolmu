const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// 압축 설정
const MAX_WIDTH = 2000; // 최대 가로 크기 (웹에서 보기 충분한 크기)
const JPEG_QUALITY = 85; // JPEG 품질 (80-90 권장)
const PNG_QUALITY = 8; // PNG 압축 레벨 (6-9 권장)
const BACKUP_DIR = path.join(__dirname, 'images', 'originals'); // 원본 백업 폴더

// originals 백업 폴더 생성
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log('✅ originals 백업 폴더 생성 완료');
}

const imagesDir = path.join(__dirname, 'images');

// 이미지 파일 목록 가져오기
function getImageFiles() {
    const files = fs.readdirSync(imagesDir);
    return files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
        const isNotThumb = !file.includes('_thumb');
        // originals 폴더 제외
        return isImage && isNotThumb;
    }).sort((a, b) => {
        const numA = parseInt(a.match(/p(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/p(\d+)/)?.[1] || '0');
        return numA - numB;
    });
}

// 이미지 압축 함수
async function optimizeImage(inputPath, outputPath, backupPath, fileExt) {
    try {
        const stats = fs.statSync(inputPath);
        const originalSize = stats.size;
        
        // 1. 원본 백업
        fs.copyFileSync(inputPath, backupPath);
        
        // 2. Sharp로 이미지 압축
        let sharpInstance = sharp(inputPath)
            .resize(MAX_WIDTH, null, {
                withoutEnlargement: true,
                fit: 'inside'
            });
        
        // 확장자에 따라 다른 형식으로 저장
        if (fileExt === '.png') {
            // PNG: 알파값 보존, 압축
            sharpInstance = sharpInstance.png({ 
                compressionLevel: PNG_QUALITY,
                quality: 100,
                effort: 7 // 압축 노력도 (1-10, 높을수록 더 압축되지만 느림)
            });
        } else {
            // JPG: 최적화된 압축
            sharpInstance = sharpInstance.jpeg({ 
                quality: JPEG_QUALITY,
                mozjpeg: true,
                progressive: true
            });
        }
        
        // 3. 압축된 이미지 저장 (원본 파일명 그대로)
        await sharpInstance.toFile(outputPath);
        
        const optimizedStats = fs.statSync(outputPath);
        const optimizedSize = optimizedStats.size;
        const compressionRatio = ((1 - optimizedSize / originalSize) * 100).toFixed(1);
        
        return {
            success: true,
            originalSize,
            optimizedSize,
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
    console.log('🚀 이미지 압축 시작...\n');
    console.log(`설정: 최대 ${MAX_WIDTH}px, JPEG 품질 ${JPEG_QUALITY}%, PNG 압축 레벨 ${PNG_QUALITY}\n`);
    console.log('⚠️  원본 이미지는 images/originals 폴더에 백업됩니다.\n');
    
    const imageFiles = getImageFiles();
    console.log(`📁 총 ${imageFiles.length}개 이미지 발견\n`);
    
    // 사용자 확인 (5초 대기)
    console.log('⏰ 5초 후 시작됩니다. 중단하려면 Ctrl+C를 누르세요...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    let successCount = 0;
    let failCount = 0;
    let totalOriginalSize = 0;
    let totalOptimizedSize = 0;
    
    // 각 이미지 처리
    for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const inputPath = path.join(imagesDir, file);
        const originalExt = path.extname(file).toLowerCase();
        
        // 백업 경로와 출력 경로 설정
        const backupPath = path.join(BACKUP_DIR, file);
        const outputPath = inputPath; // 원본 파일을 덮어씀
        
        // 임시 파일로 먼저 저장 후 원본과 교체
        const tempPath = inputPath + '.tmp';
        
        process.stdout.write(`[${i + 1}/${imageFiles.length}] ${file} 압축 중... `);
        
        const result = await optimizeImage(inputPath, tempPath, backupPath, originalExt);
        
        if (result.success) {
            // 임시 파일을 원본으로 교체
            fs.renameSync(tempPath, outputPath);
            
            successCount++;
            totalOriginalSize += result.originalSize;
            totalOptimizedSize += result.optimizedSize;
            const originalMB = (result.originalSize / 1024 / 1024).toFixed(2);
            const optimizedMB = (result.optimizedSize / 1024 / 1024).toFixed(2);
            console.log(`✅ 완료 (${originalMB}MB → ${optimizedMB}MB, ${result.compressionRatio}% 감소)`);
        } else {
            failCount++;
            console.log(`❌ 실패`);
            // 임시 파일 정리
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
        }
    }
    
    // 결과 요약
    console.log('\n' + '='.repeat(60));
    console.log('📊 압축 완료 요약');
    console.log('='.repeat(60));
    console.log(`✅ 성공: ${successCount}개`);
    console.log(`❌ 실패: ${failCount}개`);
    console.log(`📦 원본 총 용량: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📦 압축 총 용량: ${(totalOptimizedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`💾 절약된 용량: ${((totalOriginalSize - totalOptimizedSize) / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📉 평균 압축률: ${((1 - totalOptimizedSize / totalOriginalSize) * 100).toFixed(1)}%`);
    console.log(`💼 원본 백업 위치: ${BACKUP_DIR}`);
    console.log('='.repeat(60));
    console.log('\n✨ 압축 완료! 브라우저를 새로고침하세요.');
}

// 실행
main().catch(error => {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
});

