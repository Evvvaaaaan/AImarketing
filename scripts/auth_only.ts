import 'dotenv/config';
import fs from 'fs-extra';
import chalk from 'chalk';
import { google } from 'googleapis';
import open from 'open';
import { createInterface } from 'readline';

const CREDENTIALS_PATH = 'client_secret.json';
const TOKEN_PATH = 'data/token.json';

async function forceAuth() {
    console.log(chalk.blue('🔐 구글 로그인(채널 설정) 전용 도구'));

    // 1. client_secret.json 확인
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.log(chalk.red('❌ [실패] client_secret.json 파일이 없습니다!'));
        console.log(chalk.yellow('👉 구글 클라우드에서 다운로드 받아 프로젝트 폴더에 넣으세요.'));
        return;
    }

    // 2. 인증 설정
    const content = await fs.readJSON(CREDENTIALS_PATH);
    const { client_secret, client_id, redirect_uris } = content.installed || content.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // 3. 인증 URL 생성
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/youtube.upload'],
    });

    console.log(chalk.yellow('\n🌐 브라우저가 열리면 업로드할 [유튜브 채널 계정]을 선택하세요.'));
    await open(authUrl); // 브라우저 자동 열기

    // 4. 코드 입력 받기
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const code = await new Promise<string>(resolve => {
        rl.question(chalk.green('\n🔑 로그인 후 나오는 코드를 복사해서 여기에 붙여넣으세요: '), (code) => {
            rl.close();
            resolve(code);
        });
    });

    // 5. 토큰 교환 및 저장
    try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        
        // 폴더가 없으면 생성
        await fs.ensureDir('data');
        await fs.writeJSON(TOKEN_PATH, tokens);
        
        console.log(chalk.green('\n✨ [성공] token.json 파일이 생성되었습니다!'));
        console.log(chalk.white('이제 "npm run upload"를 하면 이 채널로 업로드됩니다.'));
        
    } catch (error: any) {
        console.error(chalk.red(`❌ [인증 실패] ${error.message}`));
    }
}

forceAuth();