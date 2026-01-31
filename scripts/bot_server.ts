import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs-extra';
import chalk from 'chalk';
// ★ [수정] 방금 만든 uploader에서 함수를 가져옵니다.
import { uploadVideoToYoutube } from './uploader';

import { spawn } from 'child_process';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN이 .env에 없습니다.");

const bot = new TelegramBot(token, { polling: true });

console.log(chalk.blue('🤖 텔레그램 봇 서버 가동 중...'));

// 메인 메뉴 키보드
const MAIN_KEYBOARD = {
    reply_markup: {
        inline_keyboard: [[
            { text: '✨ 아이디어 생성 & 업로드 (One-Click)', callback_data: 'pipeline_start' }
        ]]
    }
};

// /start 명령어
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🎬 **유튜브 자동화 봇입니다.**\n원하는 작업을 선택하세요.", {
        parse_mode: 'Markdown',
        ...MAIN_KEYBOARD
    });
});

// /upload 명령어
bot.onText(/\/upload/, async (msg) => {
    // ... (기존 코드)
});

// ... polling_error ...

// 버튼 클릭 처리
bot.on('callback_query', async (query) => {
    const { data, message } = query;
    if (!data || !message) return;
    const chatId = message.chat.id;

    // 1. 전체 파이프라인 실행
    if (data === 'pipeline_start') {
        await bot.answerCallbackQuery(query.id, { text: '파이프라인 가동 시작!' });
        await bot.sendMessage(chatId, "🏭 **자동화 파이프라인을 시작합니다...**\n(기획 -> 렌더링 / 승인 대기)", { parse_mode: 'Markdown' });

        // npm run pipeline 실행
        const proc = spawn('npm', ['run', 'pipeline'], { shell: true });

        // 로그 전송 (너무 자주 보내면 API 제한 걸리므로, 중요 로그만)
        proc.stdout.on('data', (data) => {
            const log = data.toString();
            console.log(log); // 서버 콘솔에도 출력

            if (log.includes('📌 [NEW]')) bot.sendMessage(chatId, `💡 **새로운 기획 감지:**\n${log.split('기획:')[1].trim()}`, { parse_mode: 'Markdown' });
            if (log.includes('🎬')) bot.sendMessage(chatId, `🎥 **렌더링 시작:** ${log.split(']')[1].trim()}`);
            if (log.includes('✅ 업로드 완료')) bot.sendMessage(chatId, `🎉 **업로드 성공!**\n${log.split('!')[1].trim()}`);
            if (log.includes('❌')) bot.sendMessage(chatId, `⚠️ **오류:** ${log}`);
        });

        proc.stderr.on('data', (data) => console.error(chalk.red(data.toString())));

        proc.on('close', (code) => {
            if (code === 0) {
                bot.sendMessage(chatId, "✅ **모든 작업이 완료되었습니다.**", MAIN_KEYBOARD);
            } else {
                bot.sendMessage(chatId, `🛑 **작업 중단 (Exit Code: ${code})**`, MAIN_KEYBOARD);
            }
        });
        return;
    }

    // ... (기존 approve/reject 로직)
    const ARCHIVE_FILE = 'data/archive.json';

    // const chatId = message.chat.id; // 이미 위에서 선언됨
    const messageId = message.message_id;
    const parts = data.split('_');
    const action = parts[0];
    const videoId = parts.slice(1).join('_');

    if (action === 'approve') {
        await bot.answerCallbackQuery(query.id, { text: '업로드 시작!' });
        await bot.sendMessage(chatId, `🚀 [${videoId}] 유튜브 업로드 중...`);

        // 업로드 실행 (단일 영상)
        const resultId = await uploadVideoToYoutube(videoId);

        if (resultId) {
            await bot.sendMessage(chatId, `🎉 **업로드 완료!**\nhttps://youtube.com/shorts/${resultId}`, { parse_mode: 'Markdown' });
            console.log(chalk.green(`✅ [${videoId}] 업로드 완료`));
        } else {
            await bot.sendMessage(chatId, `❌ 업로드 실패 또는 영상 없음.`);
        }
    } else if (action === 'reject') {
        await bot.answerCallbackQuery(query.id, { text: '폐기되었습니다.' });
        await bot.sendMessage(chatId, `🗑️ 영상이 폐기되었습니다.`);
        console.log(chalk.gray(`⛔ [${videoId}] 사용자 거절`));

        // 아카이브 상태 업데이트 (rejected)
        try {
            const archive = await fs.readJSON(ARCHIVE_FILE).catch(() => []);
            const targetItem = archive.find((item: any) => item.id === videoId);
            if (targetItem) {
                targetItem.status = 'rejected';
                await fs.writeJSON(ARCHIVE_FILE, archive, { spaces: 2 });
            }
        } catch (e) {
            console.error('아카이브 업데이트 실패:', e);
        }
    }

    // 버튼 제거 (선택 처리가 끝났으므로)
    try {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
    } catch (e) { }
});