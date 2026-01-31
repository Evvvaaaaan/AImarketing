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

// 데이터 인터페이스
interface VideoItem {
    id: string;
    idea: string;
    status: string;
    props: {
        title: string;
        subtitle: string;
        imagePaths: string[]; // 실제로는 비디오 경로가 들어감
        audioPath: string;
        bgmPath: string;
        themeColor: string;
        transcript?: any[];
    };
}

// 🎵 BGM 라이브러리
const BGM_LIBRARY: Record<string, string> = {
    'energetic': 'https://cdn.pixabay.com/download/audio/2022/04/27/audio_6ebb6d5736.mp3?filename=dont-stop-me-112662.mp3',
    'calm': 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_1a5554b238.mp3?filename=lofi-study-112191.mp3',
    'dramatic': 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=epic-cinematic-trailer-9653.mp3',
    'happy': 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=good-vibes-11867.mp3',
    'tech': 'https://cdn.pixabay.com/download/audio/2021/11/16/audio_03d6d52528.mp3?filename=technology-corporation-13253.mp3'
};

// ★ [핵심 변경] 동영상 다운로드 함수 (고화질 세로 영상 - 속도 최적화를 위해 1개만 다운로드)
async function downloadPexelsVideos(query: string, id: string): Promise<string[]> {
    console.log(chalk.magenta(`   🎥 Pexels 동영상 검색: "${query}"`));
    const downloadedPaths: string[] = [];

    try {
        // videos/search API 사용
        const res = await axios.get(`https://api.pexels.com/videos/search?query=${query}&orientation=portrait&per_page=5&min_duration=3`, {
            headers: { Authorization: PEXELS_KEY }
        });

        const videos = res.data.videos || [];
        if (videos.length === 0) throw new Error('동영상 검색 결과 없음');

        // 속도 최적화를 위해 1개만 다운로드
        for (let i = 0; i < videos.length; i++) {
            if (downloadedPaths.length >= 1) break; // 1개만 다운로드하면 중단

            const videoFiles = videos[i].video_files || [];
            // 세로(높이 > 너비)이면서 HD급(720p 이상)인 파일 찾기
            const bestFile = videoFiles.find((f: any) => f.height > f.width && f.width >= 720) || videoFiles[0];

            if (!bestFile) continue;

            const videoUrl = bestFile.link;
            const filename = `${id}_vid_${i}.mp4`;
            const filePath = path.join(ASSETS_DIR, filename);

            const writer = fs.createWriteStream(filePath);
            const response = await axios({ url: videoUrl, responseType: 'stream' });
            response.data.pipe(writer);

            await new Promise<void>((resolve, reject) => {
                writer.on('finish', () => resolve());
                writer.on('error', reject);
            });

            downloadedPaths.push(`assets/${filename}`);
        }

        console.log(chalk.gray(`      ✨ 동영상 ${downloadedPaths.length}개 저장 완료`));
        return downloadedPaths;

    } catch (e: any) {
        console.error(chalk.red(`   ❌ Pexels 비디오 오류: ${e.message}`));
        return [];
    }
}

// BGM 다운로드 (속도 문제로 비활성화)
async function downloadBgm(mood: string, id: string): Promise<string> {
    // console.log(chalk.gray(`   🚫 BGM 다운로드 생략`));
    return '';
    /*
    const filename = `${id}_bgm.mp3`;
    const filePath = path.join(ASSETS_DIR, filename);
    const bgmUrl = BGM_LIBRARY[mood] || BGM_LIBRARY['energetic'];
    
    try {
        const response = await axios({ url: bgmUrl, method: 'GET', responseType: 'stream' });
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        await new Promise<void>((resolve, reject) => {
            writer.on('finish', () => resolve());
            writer.on('error', reject);
        });
        return `assets/${filename}`;
    } catch (e) { return ''; }
    */
}

// TTS 생성
async function generateAudioWithSubtitles(text: string, filename: string) {
    const filePath = path.join(ASSETS_DIR, filename);
    try {
        const mp3 = await openai.audio.speech.create({
            model: "tts-1-hd", voice: "shimmer", input: text, speed: 1.2, // 속도 약간 올림 (도파민)
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
    console.log(chalk.blue('🧠 Clawdbot High-Retention Engine...'));
    await fs.ensureDir(ASSETS_DIR);
    if (!fs.existsSync(INPUT_FILE)) await fs.writeFile(INPUT_FILE, '', 'utf-8');

    const rawText = await fs.readFile(INPUT_FILE, 'utf-8');
    const ideas = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // ★ [오류 해결] 명시적 타입 선언
    let state: VideoItem[] = [];
    try { state = await fs.readJSON(STATE_FILE); } catch (e) { state = []; }

    for (const idea of ideas) {
        if (state.find((item) => item.idea === idea)) continue;

        const id = `idea_${Date.now()}`;
        console.log(chalk.cyan(`\n📌 [NEW] 기획: ${idea}`));

        try {
            // ★ [대본 강화] Hook & Fast Pacing
            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `너는 유튜브 쇼츠 전문 PD야. 시청자가 3초 안에 이탈하지 않도록 강력한 '훅(Hook)'을 넣어서 대본을 써.
                        
                        [필수 요청사항]
                        1. Pexels 검색어(searchKeyword)는 구체적인 영어로 (예: "person typing laptop close up").
                        2. 대본(script)은 첫 문장이 질문이나 충격적인 사실이어야 함. 전체 15초 내외로 짧고 강렬하게(Short & Impactful).
                        3. mood는 'energetic', 'calm', 'dramatic', 'tech' 중 선택.

                        [JSON 포맷]
                        - title: (한국어 제목)
                        - subtitle: (짧고 강렬한 부제목)
                        - searchKeyword: (영어 동영상 검색어)
                        - mood: (BGM 분위기)
                        - script: (한국어 대본)
                        - color: (테마 컬러)`
                    },
                    { role: "user", content: idea }
                ],
                response_format: { type: "json_object" }
            });

            const content = JSON.parse(completion.choices[0].message.content || "{}");
            const audioFilename = `${id}_tts.mp3`;

            // 비디오, BGM, TTS 병렬 다운로드
            const [videoPaths, bgmPath, transcript] = await Promise.all([
                downloadPexelsVideos(content.searchKeyword, id), // ★ 동영상 다운로드
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
                    imagePaths: videoPaths,
                    audioPath: `assets/${audioFilename}`,
                    bgmPath: bgmPath,
                    themeColor: content.color,
                    transcript: transcript
                }
            });

            await fs.writeJSON(STATE_FILE, state, { spaces: 2 });
            console.log(chalk.green(`✅ 기획 완료`));

        } catch (error: any) {
            console.error(chalk.red(`❌ 실패: ${error.message}`));
        }
    }
}

run();