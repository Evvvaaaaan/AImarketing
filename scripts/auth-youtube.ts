import { google } from 'googleapis';
import fs from 'fs-extra';
import open from 'open';
import path from 'path';

const CREDENTIALS_PATH = path.join(process.cwd(), 'client_secret.json');
const TOKEN_PATH = path.join(process.cwd(), 'tokens.json');

async function authenticate() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.error('❌ client_secret.json 파일이 없습니다! 구글 클라우드에서 받아오세요.');
        return;
    }

    const creds = fs.readJSONSync(CREDENTIALS_PATH);
    const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;

    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/youtube.upload'],
    });

    console.log('🌍 인증을 위해 브라우저를 엽니다...');
    await open(authUrl);

    console.log('🔑 브라우저에서 로그인 후, 리다이렉트된 주소(URL) 전체를 복사해서 아래에 붙여넣으세요:');

    // 터미널에서 입력 받기
    const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });

    readline.question('URL 붙여넣기: ', async (codeUrl: string) => {
        const code = new URL(codeUrl).searchParams.get('code');
        if (!code) {
             console.error('❌ 코드를 찾을 수 없습니다.');
             return;
        }
        const { tokens } = await oAuth2Client.getToken(code);
        fs.writeJSONSync(TOKEN_PATH, tokens);
        console.log('✅ 인증 성공! tokens.json 파일이 생성되었습니다.');
        readline.close();
    });
}

authenticate();