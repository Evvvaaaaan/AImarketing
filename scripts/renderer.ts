import 'dotenv/config';
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import TelegramBot from 'node-telegram-bot-api';
// uploader 가져오기
import { uploadVideoToYoutube } from './uploader';

const ROOT_DIR = process.cwd();
const STATE_FILE = path.join(ROOT_DIR, 'data', 'state.json');
const ARCHIVE_FILE = path.join(ROOT_DIR, 'data', 'archive.json');
const OUT_DIR = path.join(ROOT_DIR, 'out');
const ENTRY_POINT = path.join(ROOT_DIR, 'src', 'engine', 'index.tsx');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.MY_CHAT_ID;

if (!token || !chatId) {
    console.error(chalk.red('❌ TELEGRAM_BOT_TOKEN 또는 MY_CHAT_ID가 .env에 없습니다.'));
    process.exit(1);
}

// Polling: false (충돌 방지: bot_server가 polling 담당)
const bot = new TelegramBot(token, { polling: false });

async function run() {
    console.log(chalk.blue('🏭 렌더링 로봇 가동...'));
    await fs.ensureDir(OUT_DIR);

    if (!fs.existsSync(STATE_FILE)) { console.error('state.json 없음'); process.exit(1); }

    const state = await fs.readJSON(STATE_FILE);
    const targets = state.filter((s: any) => s.status === 'planned');
    const itemsToRender = targets;

    if (itemsToRender.length === 0) {
        console.log(chalk.yellow('💤 렌더링할 대기열(planned)이 없습니다.'));
        process.exit(0);
    }

    console.log(chalk.cyan(`📊 렌더링 대상: ${itemsToRender.length}개`));

    const bundleLoc = await bundle({
        entryPoint: ENTRY_POINT,
        webpackOverride: (config) => ({ ...config, resolve: { ...config.resolve, fallback: { fs: false, path: false } } })
    });

    // 1. 렌더링 루프
    const successfulItems: any[] = [];

    for (const item of itemsToRender) {
        if (!item || !item.props) continue;
        console.log(chalk.magenta(`\n🎬 [${item.id}] 렌더링 시작`));

        const cleanProps = {
            title: item.props.title,
            subtitle: item.props.subtitle,
            imagePaths: item.props.imagePaths || [],
            audioPath: item.props.audioPath,
            bgmPath: item.props.bgmPath,
            themeColor: item.props.themeColor,
            transcript: item.props.transcript || []
        };

        const outputFileName = `${item.id}.mp4`;
        const outputLocation = path.join(OUT_DIR, outputFileName);

        try {
            const composition = await selectComposition({
                serveUrl: bundleLoc, id: 'MarketingClip', inputProps: cleanProps,
            });
            await renderMedia({
                composition, serveUrl: bundleLoc, codec: "h264",
                outputLocation: outputLocation, inputProps: cleanProps, timeoutInMilliseconds: 240000,
            });

            console.log(chalk.green(`✅ 렌더링 완성: ${outputLocation}`));
            item.status = 'rendered';
            item.finalVideoPath = `out/${outputFileName}`;

            // 텔레그램 전송 (메시지만 보냄, 응답은 bot_server가 받음)
            await bot.sendVideo(chatId!, outputLocation, {
                caption: `🎉 **영상이 생성되었습니다!**\n\n제목: ${cleanProps.title}\n\n유튜브에 업로드하시겠습니까?`,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ 업로드 승인', callback_data: `approve_${item.id}` },
                        { text: '❌ 폐기', callback_data: `reject_${item.id}` }
                    ]]
                }
            });
            console.log(chalk.blue(`📨 텔레그램 승인 요청 전송됨`));

            successfulItems.push(item);

        } catch (err: any) {
            console.error(chalk.red(`❌ 렌더링 실패 [${item.id}]: ${err.message}`));
        }
    }

    // 2. 상태 저장 & 아카이빙 (Safe Update)
    console.log(chalk.gray(`\n💾 상태 저장 및 아카이빙...`));

    if (successfulItems.length > 0) {
        let archive = [];
        try { archive = await fs.readJSON(ARCHIVE_FILE); } catch (e) { }
        await fs.writeJSON(ARCHIVE_FILE, [...archive, ...successfulItems], { spaces: 2 });
        console.log(chalk.green(`📦 ${successfulItems.length}개 항목 아카이브 이동 완료`));

        let currentState = [];
        try { currentState = await fs.readJSON(STATE_FILE); } catch (e) { }

        const successIds = new Set(successfulItems.map(i => i.id));
        const remainingState = currentState.filter((item: any) => !successIds.has(item.id));

        await fs.writeJSON(STATE_FILE, remainingState, { spaces: 2 });
        console.log(chalk.cyan(`♻️ State 업데이트 완료 (남은 항목: ${remainingState.length}개)`));
    } else {
        console.log(chalk.yellow('⚠️ 성공한 작업이 없어 상태를 변경하지 않습니다.'));
    }

    console.log(chalk.green(`✨ 렌더링 프로세스 종료. 승인 대기는 bot_server가 담당합니다.`));
    process.exit(0);
}

run();