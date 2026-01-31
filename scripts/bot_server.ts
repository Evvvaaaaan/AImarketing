import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs-extra';
import chalk from 'chalk';
// ★ [수정] 방금 만든 uploader에서 함수를 가져옵니다.
import { uploadVideoToYoutube } from './uploader';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN이 .env에 없습니다.");

const bot = new TelegramBot(token, { polling: true });

console.log(chalk.blue('🤖 텔레그램 봇 서버 가동 중...'));

// /start 명령어
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "반갑습니다! /plan [주제] 로 기획하거나 /upload 로 업로드하세요.");
});

// /upload 명령어
bot.onText(/\/upload/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "🚀 유튜브 업로드를 시작합니다...");

    try {
        // ★ [수정] 이제 함수가 존재하므로 에러가 안 납니다.
        const resultMsg = await uploadVideoToYoutube();
        bot.sendMessage(chatId, `결과: ${resultMsg}`);
    } catch (error: any) {
        bot.sendMessage(chatId, `❌ 에러 발생: ${error.message}`);
    }
});

// 에러 핸들링 (Polling Error 방지)
bot.on('polling_error', (error) => {
    console.log(chalk.red(`[Polling Error] ${error.code}: ${error.message}`));
});

const ARCHIVE_FILE = 'data/archive.json';

// 버튼 클릭(Callback Query) 처리 - renderer에서 생성된 버튼에 대한 응답
bot.on('callback_query', async (query) => {
    const { data, message } = query;
    if (!data || !message) return;

    const chatId = message.chat.id;
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