import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.MY_CHAT_ID;

console.log(`토큰: ${token}`);
console.log(`챗ID: ${chatId}`);

if (!token || !chatId) {
    console.error('❌ .env 파일에 토큰이나 Chat ID가 없습니다!');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });

bot.sendMessage(chatId, "🚀 테스트 메시지입니다! 이게 보이면 성공입니다.")
    .then(() => console.log("✅ 전송 성공! 텔레그램을 확인하세요."))
    .catch((err) => console.error("❌ 전송 실패:", err.message));