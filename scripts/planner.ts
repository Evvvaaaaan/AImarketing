import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import OpenAI from 'openai';
import axios from 'axios';
import chalk from 'chalk';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PEXELS_KEY = process.env.PEXELS_API_KEY;

const STATE_FILE = 'data/state.json';
const INPUT_FILE = 'data/ideas/input.txt';
const ASSETS_DIR = path.join(process.cwd(), 'public', 'assets');

// 데이터 구조 변경 (imagePaths 배열 사용)
interface VideoItem {
    id: string;
    idea: string;
    status: string;
    props: {
        title: string;
        subtitle: string;
        imagePaths: string[]; // ★ 여러 장의 이미지 경로
        audioPath: string;    // TTS
        bgmPath: string;      // ★ 분위기별 BGM
        themeColor: string;
        transcript?: any[];
    };
}

// 🎵 분위기별 무료 BGM 라이브러리 (저작권 무료 소스)
const BGM_LIBRARY: Record<string, string> = {
    'energetic': 'https://cdn.pixabay.com/download/audio/2022/04/27/audio_6ebb6d5736.mp3?filename=dont-stop-me-112662.mp3', // 신나는
    'calm': 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_1a5554b238.mp3?filename=lofi-study-112191.mp3',      // 차분한
    'dramatic': 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=epic-cinematic-trailer-9653.mp3', // 웅장한
    'happy': 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=good-vibes-11867.mp3',       // 밝은
    'tech': 'https://cdn.pixabay.com/download/audio/2021/11/16/audio_03d6d52528.mp3?filename=technology-corporation-13253.mp3' // 기술/뉴스
};

// 1. Pexels 이미지 5장 다운로드
async function downloadPexelsImages(query: string, id: string): Promise<string[]> {
    console.log(chalk.magenta(`   📸 Pexels 이미지 검색 (5장): "${query}"`));
    const downloadedPaths: string[] = [];

    try {
        const res = await axios.get(`https://api.pexels.com/v1/search?query=${query}&orientation=portrait&per_page=5`, {
            headers: { Authorization: PEXELS_KEY }
        });

        const photos = res.data.photos || [];
        if (photos.length === 0) throw new Error('이미지 검색 결과 없음');

        // 최대 5장 다운로드
        for (let i = 0; i < photos.length; i++) {
            const photoUrl = photos[i].src.large2x; // 고화질
            const filename = `${id}_img_${i}.jpg`;
            const filePath = path.join(ASSETS_DIR, filename);

            const writer = fs.createWriteStream(filePath);
            const response = await axios({ url: photoUrl, responseType: 'stream' });
            response.data.pipe(writer);

            await new Promise<void>((resolve, reject) => {
                writer.on('finish', () => resolve());
                writer.on('error', reject);
            });

            // public/assets/... 가 아니라 assets/... 로 저장 (Remotion 용)
            downloadedPaths.push(`assets/${filename}`);
        }

        console.log(chalk.gray(`      ✨ 이미지 ${downloadedPaths.length}장 저장 완료`));
        return downloadedPaths;

    } catch (e: any) {
        throw new Error(`Pexels 오류: ${e.message}`);
    }
}

// 2. 분위기에 맞는 BGM 다운로드
async function downloadBgm(mood: string, id: string): Promise<string> {
    const filename = `${id}_bgm.mp3`;
    const filePath = path.join(ASSETS_DIR, filename);

    // mood가 라이브러리에 없으면 기본값(energetic)
    const bgmUrl = BGM_LIBRARY[mood] || BGM_LIBRARY['energetic'];
    console.log(chalk.yellow(`   🎵 BGM 선택: ${mood} -> 다운로드 중...`));

    try {
        const response = await axios({
            url: bgmUrl,
            method: 'GET',
            responseType: 'stream'
        });
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        await new Promise<void>((resolve, reject) => {
            writer.on('finish', () => resolve());
            writer.on('error', reject);
        });
        return `assets/${filename}`;
    } catch (e) {
        console.error(chalk.red('   ❌ BGM 다운로드 실패.'));
        return '';
    }
}

// 3. TTS 및 자막
async function generateAudioWithSubtitles(text: string, filename: string) {
    const filePath = path.join(ASSETS_DIR, filename);
    try {
        const mp3 = await openai.audio.speech.create({
            model: "tts-1-hd", voice: "shimmer", input: text, speed: 1.15,
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        await fs.writeFile(filePath, buffer);

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "whisper-1", response_format: "verbose_json", timestamp_granularities: ["word"]
        });
        return transcription.words;
    } catch (e) { return []; }
}

async function run() {
    console.log(chalk.blue('🧠 Clawdbot Multi-Image Slideshow Engine...'));
    await fs.ensureDir(ASSETS_DIR);
    if (!fs.existsSync(INPUT_FILE)) await fs.writeFile(INPUT_FILE, '', 'utf-8');

    const rawText = await fs.readFile(INPUT_FILE, 'utf-8');
    const ideas = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let state = [];
    try { state = await fs.readJSON(STATE_FILE); } catch (e) { state = []; }

    for (const idea of ideas) {
        const id = `idea_${Date.now()}`;
        console.log(chalk.cyan(`\n📌 기획: ${idea}`));

        try {
            // GPT에게 이미지 검색어와 BGM 분위기를 물어봄
            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `너는 숏폼 PD야. JSON으로 답해.
                        
                        [searchKeyword]: Pexels에서 검색할 영어 단어 (예: "cyberpunk city night").
                        [mood]: 영상 분위기 (선택: 'energetic', 'calm', 'dramatic', 'happy', 'tech').
                        
                        [JSON 포맷]
                        - title: (한국어) 제목 (8자 이내)
                        - subtitle: (한국어) 부제목
                        - searchKeyword: (영어) 이미지 검색어
                        - mood: (영어) BGM 분위기
                        - script: (한국어) 30초 대본
                        - color: 테마 컬러`
                    },
                    { role: "user", content: idea }
                ],
                response_format: { type: "json_object" }
            });

            const content = JSON.parse(completion.choices[0].message.content || "{}");
            const audioFilename = `${id}_tts.mp3`;

            // 병렬 처리: 이미지들, BGM, TTS 동시에 준비
            const [imagePaths, bgmPath, transcript] = await Promise.all([
                downloadPexelsImages(content.searchKeyword, id),
                downloadBgm(content.mood, id),
                generateAudioWithSubtitles(content.script, audioFilename)
            ]);

            state.push({
                id,
                idea,
                status: 'planned',
                props: {
                    title: content.title,
                    subtitle: content.subtitle,
                    imagePaths: imagePaths, // 배열로 저장
                    audioPath: `assets/${audioFilename}`,
                    bgmPath: bgmPath,
                    themeColor: content.color,
                    transcript: transcript
                }
            });

            await fs.writeJSON(STATE_FILE, state, { spaces: 2 });
            console.log(chalk.green(`✅ 완료`));

        } catch (error: any) {
            console.error(chalk.red(`❌ 실패: ${error.message}`));
        }
    }
}

run();