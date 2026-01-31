import 'dotenv/config';
import fs from 'fs-extra';
import chalk from 'chalk';
import { google } from 'googleapis';
import open from 'open';
import { createInterface } from 'readline';

const STATE_FILE = 'data/state.json';
const CREDENTIALS_PATH = 'client_secret.json';
const TOKEN_PATH = 'data/token.json';

// 인증 로직
async function authorize() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        throw new Error('❌ client_secret.json 파일이 없습니다.');
    }
    const content = await fs.readJSON(CREDENTIALS_PATH);
    const { client_secret, client_id, redirect_uris } = content.installed || content.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    if (fs.existsSync(TOKEN_PATH)) {
        const token = await fs.readJSON(TOKEN_PATH);
        oAuth2Client.setCredentials(token);
        return oAuth2Client;
    }
    return getNewToken(oAuth2Client);
}

async function getNewToken(oAuth2Client: any) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/youtube.upload'],
    });
    console.log(chalk.yellow('\n🔐 인증 필요: 브라우저에서 아래 링크로 로그인하세요.'));
    await open(authUrl);

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const code = await new Promise<string>(resolve => {
        rl.question(chalk.yellow('🔑 코드 입력: '), (code) => {
            rl.close();
            resolve(code);
        });
    });
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    await fs.writeJSON(TOKEN_PATH, tokens);
    return oAuth2Client;
}

const ARCHIVE_FILE = 'data/archive.json';

// ★ [핵심] 외부(Bot)에서 부를 수 있게 export 붙임
export async function uploadVideoToYoutube(targetId?: string) {
    console.log(chalk.red('🚀 유튜브 업로더 시작...'));

    let state = [];
    let archive = [];
    try { state = await fs.readJSON(STATE_FILE); } catch (e) { state = []; }
    try { archive = await fs.readJSON(ARCHIVE_FILE); } catch (e) { archive = []; }

    let itemsToUpload: any[] = [];
    let sourceFile: 'state' | 'archive' = 'state';

    if (targetId) {
        // 1. Target ID가 있으면 Archive에서 먼저 찾고, 없으면 State에서 찾음 (Renderer가 Archive로 옮겼을 확률 높음)
        const inArchive = archive.find((item: any) => item.id === targetId);
        const inState = state.find((item: any) => item.id === targetId);

        if (inArchive) {
            itemsToUpload = [inArchive];
            sourceFile = 'archive';
        } else if (inState) {
            itemsToUpload = [inState];
            sourceFile = 'state';
        } else {
            console.log(chalk.red(`❌ ID not found: ${targetId}`));
            return null;
        }
    } else {
        // 2. ID가 없으면 State에서 'rendered' 전체 찾기 (기존 로직)
        itemsToUpload = state.filter((item: any) => item.status === 'rendered');
        sourceFile = 'state';
    }

    if (itemsToUpload.length === 0) {
        if (!targetId) console.log(chalk.red('❌ 업로드할 영상(rendered)이 없습니다.'));
        return targetId ? null : '업로드할 영상이 없습니다. 먼저 렌더링을 완료해주세요.';
    }

    let auth;
    try { auth = await authorize(); } catch (e: any) {
        console.error(e.message);
        return `인증 실패: ${e.message}`;
    }

    const youtube = google.youtube({ version: 'v3', auth });
    let uploadedCount = 0;
    let lastUploadedId = '';

    for (const item of itemsToUpload) {
        console.log(chalk.yellow(`\n📦 업로드 중: ${item.props.title}`));
        const videoPath = item.finalVideoPath;

        if (!fs.existsSync(videoPath)) {
            console.error(chalk.red(`❌ 파일 없음: ${videoPath}`));
            continue;
        }

        try {
            // const fileSize = fs.statSync(videoPath).size;
            const res = await youtube.videos.insert({
                part: ['snippet', 'status'],
                requestBody: {
                    snippet: {
                        title: `${item.props.title} #Shorts`,
                        description: `${item.props.subtitle}\n\n#Shorts #AI`,
                        tags: ['Shorts', 'AI'],
                    },
                    status: {
                        privacyStatus: 'private', // 일단 비공개
                        selfDeclaredMadeForKids: false,
                    },
                },
                media: { body: fs.createReadStream(videoPath) },
            });

            console.log(chalk.green(`✅ 업로드 완료! https://youtube.com/shorts/${res.data.id}`));

            // 상태 업데이트
            item.status = 'uploaded';
            item.uploadId = res.data.id;
            item.uploadUrl = `https://youtube.com/shorts/${res.data.id}`;

            uploadedCount++;
            lastUploadedId = res.data.id || '';

        } catch (e: any) {
            console.error(chalk.red(`❌ 실패: ${e.message}`));
        }
    }

    // 변경사항 저장
    if (sourceFile === 'archive') {
        await fs.writeJSON(ARCHIVE_FILE, archive, { spaces: 2 });
    } else {
        await fs.writeJSON(STATE_FILE, state, { spaces: 2 });
    }

    // targetId가 있었으면(단일 업로드) ID 반환, 아니면 메시지 반환
    if (targetId) {
        return lastUploadedId || null;
    }
    return `${uploadedCount}개의 영상이 업로드 되었습니다!`;
}

// 직접 실행될 때만 작동 (npm run upload)
if (require.main === module) {
    uploadVideoToYoutube();
}