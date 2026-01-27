import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import chalk from 'chalk';
import { uploadVideoToYoutube } from './uploader'; // 우리가 만든 업로드 모듈

// 1. 봇 초기화 (Polling: true로 설정하여 계속 메시지를 듣게 함)
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error(chalk.red('❌ .env 파일에 TELEGRAM_BOT_TOKEN이 없습니다.'));
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log(chalk.yellow('🤖 Clawdbot 관제 서버 가동 중... (종료하려면 Ctrl+C)'));
console.log(chalk.gray('   대기 중: 텔레그램 승인 버튼 클릭 이벤트 감시'));

// 2. 버튼 클릭(Callback Query) 이벤트 리스너
bot.on('callback_query', async (query: TelegramBot.CallbackQuery) => {
    const { data, message } = query;

    // 예외 처리: 데이터나 메시지 정보가 없으면 무시
    if (!data || !message) return;

    const chatId = message.chat.id;
    const messageId = message.message_id;

    // [CASE A] 업로드 승인 버튼을 눌렀을 때
    if (data.startsWith('approve_')) {
        const videoId = data.split('_')[1]; // 'approve_idea_123' -> 'idea_123' 추출

        // 1) 사용자에게 "작업 시작" 알림 (UI 반응성)
        await bot.answerCallbackQuery(query.id, { text: '🚀 업로드를 시작합니다!' });
        await bot.sendMessage(chatId, `⏳ **[업로드 중]** 유튜브 서버로 영상을 전송하고 있습니다...\n(약 10~30초 소요)`);

        try {
            // 2) 실제 업로드 함수 실행 (uploader.ts)
            // 성공 시 유튜브 영상 ID(string), 실패 시 false 반환
            const youtubeId = await uploadVideoToYoutube(videoId);

            // 3) 결과에 따른 알림 전송
            if (youtubeId) {
                const youtubeUrl = `https://youtu.be/${youtubeId}`; // 혹은 https://youtube.com/shorts/${youtubeId}
                await bot.sendMessage(chatId, `🎉 **업로드 성공!**\n\n📺 **링크:** ${youtubeUrl}\n\n잠시 후 유튜브 스튜디오에서 처리 상태를 확인하세요.`);
            } else {
                await bot.sendMessage(chatId, `❌ **업로드 실패.**\n\n터미널의 에러 로그를 확인해주세요.`);
            }
        } catch (error) {
            console.error(error);
            await bot.sendMessage(chatId, `❌ **시스템 에러.** 업로드 중 문제가 발생했습니다.`);
        }

        // 4) 버튼 제거 (중복 클릭 방지)
        // 기존 메시지의 버튼(reply_markup)을 빈 배열로 수정하여 삭제함
        try {
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
        } catch (e) {
            // 메시지가 너무 오래되어서 수정 못 할 수도 있음 (무시)
        }
    } 
    
    // [CASE B] 반려(폐기) 버튼을 눌렀을 때
    else if (data.startsWith('reject_')) {
        const videoId = data.split('_')[1];

        await bot.answerCallbackQuery(query.id, { text: '삭제되었습니다.' });
        await bot.sendMessage(chatId, `🗑️ **폐기 완료.**\nID: ${videoId} 영상은 업로드되지 않았습니다.`);

        // 버튼 제거
        try {
            await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
        } catch (e) {
            // 무시
        }
    }
});

// 에러 핸들링 (폴링 에러 등)
bot.on('polling_error', (error) => {
    console.error(chalk.red(`[Polling Error] ${error.code}: ${error.message}`));
});