import 'dotenv/config';
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import TelegramBot from 'node-telegram-bot-api';

const ROOT_DIR = process.cwd();
const STATE_FILE = path.join(ROOT_DIR, 'data', 'state.json');
const OUT_DIR = path.join(ROOT_DIR, 'out');
const ENTRY_POINT = path.join(ROOT_DIR, 'src', 'engine', 'index.tsx');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.MY_CHAT_ID;

if (!token || !chatId) {
    console.error(chalk.red('❌ TELEGRAM_BOT_TOKEN 또는 MY_CHAT_ID가 .env에 없습니다.'));
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });

async function run() {
    console.log(chalk.blue('🏭 렌더링 로봇 가동...'));

    await fs.ensureDir(OUT_DIR);

    if (!fs.existsSync(STATE_FILE)) { console.error('state.json 없음'); return; }

    const state = await fs.readJSON(STATE_FILE);
    const targets = state.filter((s: any) => s.status === 'planned');

    // 타겟이 없으면 테스트용으로 첫 번째 아이템 강제 선택
    const itemsToRender = targets.length > 0 ? targets : [];

    if (itemsToRender.length === 0) {
        console.log(chalk.yellow('💤 렌더링할 대기열(planned)이 없습니다.'));
        process.exit(0);
        return;
    }

    console.log(chalk.cyan(`📊 렌더링 대상: ${itemsToRender.length}개`));

    const bundleLoc = await bundle({
        entryPoint: ENTRY_POINT,
        webpackOverride: (config) => ({ ...config, resolve: { ...config.resolve, fallback: { fs: false, path: false } } })
    });

    for (const item of itemsToRender) {
        if (!item || !item.props) continue;

        console.log(chalk.magenta(`\n🎬 [${item.id}] 렌더링 시작`));

        // [수정] file:// 절대 경로 대신 상대 경로("assets/...")를 그대로 사용합니다.
        // Remotion의 staticFile()은 bundle 실행 위치 기준의 public 폴더를 참조합니다.

        // props 복사
        const cleanProps = {
            title: item.props.title,
            subtitle: item.props.subtitle,
            videoPath: item.props.videoPath, // 예: "assets/idea_123_bg.mp4"
            audioPath: item.props.audioPath, // 예: "assets/idea_123_tts.mp3"
            themeColor: item.props.themeColor
        };

        console.log("👉 [Renderer] Input Props:", JSON.stringify(cleanProps, null, 2));

        const outputFileName = `${item.id}.mp4`;
        const outputLocation = path.join(OUT_DIR, outputFileName);

        try {
            // 1. Composition 선택 시에도 props 주입 (중요)
            const composition = await selectComposition({
                serveUrl: bundleLoc,
                id: 'MarketingClip',
                inputProps: cleanProps,
            });

            // 2. 렌더링
            await renderMedia({
                composition,
                serveUrl: bundleLoc,
                codec: "h264",
                outputLocation: outputLocation,
                inputProps: cleanProps,
                timeoutInMilliseconds: 240000,
            });

            console.log(chalk.green(`✅ 렌더링 완성: ${outputLocation}`));

            item.status = 'rendered';
            item.finalVideoPath = `out/${outputFileName}`;

            console.log(chalk.blue(`📨 텔레그램 전송 중... (ID: ${item.id})`));

            await bot.sendVideo(chatId!, outputLocation, {
                caption: `🎉 **영상이 생성되었습니다!**\n\n제목: ${cleanProps.title}\n\n유튜브에 업로드하시겠습니까?`,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ 업로드 승인', callback_data: `approve_${item.id}` },
                            { text: '❌ 폐기', callback_data: `reject_${item.id}` }
                        ]
                    ]
                }
            });

            console.log(chalk.green(`📨 전송 완료`));

        } catch (err: any) {
            console.error(chalk.red(`❌ 렌더링/전송 실패 [${item.id}]: ${err.message}`));
        }
    }

    await fs.writeJSON(STATE_FILE, state, { spaces: 2 });
    console.log(chalk.green(`\n✨ 모든 작업 완료. state.json 업데이트됨.`));
    process.exit(0);
}

run();