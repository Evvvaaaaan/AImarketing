import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

const ROOT_DIR = process.cwd();
const STATE_FILE = path.join(ROOT_DIR, 'data', 'state.json');

function clean() {
    console.log(chalk.yellow('🧹 [Clean] 강력 초기화 시작...'));

    try {
        // 1. 파일이 있으면 아예 삭제해버림 (가장 확실함)
        if (fs.existsSync(STATE_FILE)) {
            fs.unlinkSync(STATE_FILE); // 동기식 삭제 (Sync)
            console.log(chalk.gray('   🗑️ 기존 state.json 삭제 완료'));
        }

        // 2. 깨끗한 빈 배열로 새로 생성 (Sync)
        // ensureFileSync: 파일이 없으면 만들고, 폴더도 알아서 만듦
        fs.ensureFileSync(STATE_FILE);
        fs.writeJsonSync(STATE_FILE, [], { spaces: 2 }); // 동기식 쓰기
        
        console.log(chalk.green('✨ state.json이 완벽하게 초기화되었습니다!'));
    } catch (e: any) {
        console.error(chalk.red(`❌ 초기화 실패: ${e.message}`));
        process.exit(1); // 실패하면 파이프라인 전체 중단
    }
}

clean();