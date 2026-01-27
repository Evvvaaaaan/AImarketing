import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import OpenAI from 'openai';
import axios from 'axios';
import chalk from 'chalk';

// 1. 설정 및 API 초기화
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PEXELS_KEY = process.env.PEXELS_API_KEY;

const STATE_FILE = 'data/state.json';
const INPUT_FILE = 'data/ideas/input.txt';
const ASSETS_DIR = 'public/assets';

// 2. [핵심] 타입 정의 (Never 오류 해결용)
interface VideoItem {
    id: string;
    idea: string;
    status: string;
    props: {
        title: string;
        subtitle: string;
        videoPath: string;
        audioPath: string;
        themeColor: string;
    };
    // 렌더링/업로드 후 추가될 수 있는 속성들 (옵션)
    finalVideoPath?: string; 
    platformId?: string;
}

// 3. Pexels 비디오 다운로드 함수
async function downloadVideo(query: string, filename: string) {
    console.log(chalk.gray(`   🎥 Pexels 검색어: ${query}`));
    
    try {
        const res = await axios.get(`https://api.pexels.com/videos/search?query=${query}&orientation=portrait&per_page=3`, {
            headers: { Authorization: PEXELS_KEY }
        });

        // 가장 적절한 화질(HD급) 찾기, 없으면 첫 번째 것 사용
        const videoFiles = res.data.videos[0]?.video_files || [];
        const videoUrl = videoFiles.find((v: any) => v.height >= 720 && v.height <= 1080)?.link 
                      || videoFiles[0]?.link;

        if (!videoUrl) throw new Error('검색된 영상이 없습니다.');

        const writer = fs.createWriteStream(path.join(ASSETS_DIR, filename));
        const stream = await axios({ url: videoUrl, responseType: 'stream' });
        
        stream.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (e: any) {
        throw new Error(`Pexels 다운로드 실패: ${e.message}`);
    }
}

// 4. OpenAI TTS(음성 합성) 함수
async function generateAudio(text: string, filename: string) {
    console.log(chalk.gray(`   🎙️ 대본 생성(TTS): "${text.substring(0, 15)}..."`));
    try {
        const mp3 = await openai.audio.speech.create({
            model: "tts-1",
            voice: "onyx", // onyx, alloy, echo, fable, nova, shimmer 중 선택 가능
            input: text
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        await fs.writeFile(path.join(ASSETS_DIR, filename), buffer);
    } catch (e: any) {
        throw new Error(`TTS 생성 실패: ${e.message}`);
    }
}

// 5. 메인 실행 로직
async function run() {
    console.log(chalk.blue('🧠 Clawdbot 기획 로봇 가동...'));

    // 필수 폴더 생성
    await fs.ensureDir(ASSETS_DIR);
    await fs.ensureDir(path.dirname(INPUT_FILE));

    // input.txt가 없으면 생성하고 종료
    if (!fs.existsSync(INPUT_FILE)) {
        await fs.writeFile(INPUT_FILE, '', 'utf-8');
        console.log(chalk.yellow(`⚠️ '${INPUT_FILE}' 파일이 생성되었습니다. 여기에 영상 주제를 한 줄씩 적어주세요!`));
        return;
    }

    // 아이디어 읽기
    const rawText = await fs.readFile(INPUT_FILE, 'utf-8');
    const ideas = rawText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    if (ideas.length === 0) {
        console.log(chalk.yellow('😴 처리할 아이디어가 없습니다. input.txt에 주제를 입력해주세요.'));
        return;
    }

    // 상태 파일 읽기
    let state: VideoItem[] = []; // ★ 타입 명시로 에러 해결
    try {
        state = await fs.readJSON(STATE_FILE);
    } catch (e) {
        state = [];
    }

    let newWorkCount = 0;

    for (const idea of ideas) {
        // 이미 기획된 아이디어인지 중복 체크
        if (state.find(s => s.idea === idea)) {
            console.log(chalk.gray(`⏭️ 스킵 (이미 완료됨): ${idea}`));
            continue;
        }

        const id = `idea_${Date.now()}`;
        console.log(chalk.cyan(`\n📌 [NEW] 기획 시작: ${idea}`));

        try {
            // [Step 1] GPT에게 기획 요청
            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { 
                        role: "system", 
                        content: `너는 숏폼 영상 기획자야. 주어진 주제로 JSON 데이터를 만들어.
                        - title: 15자 이내, 시선을 끄는 제목
                        - subtitle: 20자 이내, 호기심 유발 부제목
                        - searchKeyword: Pexels에서 배경 영상을 찾을 영어 키워드 (예: "code matrix", "calm office")
                        - script: 나레이션 대본 (2~3문장, 구어체)
                        - color: 주제와 어울리는 헥사코드 (예: "#FF5733")`
                    },
                    { role: "user", content: idea }
                ],
                response_format: { type: "json_object" }
            });

            const content = JSON.parse(completion.choices[0].message.content || "{}");

            // [Step 2] 리소스 다운로드 (병렬 처리)
            const videoFilename = `${id}_bg.mp4`;
            const audioFilename = `${id}_tts.mp3`;

            await Promise.all([
                downloadVideo(content.searchKeyword, videoFilename),
                generateAudio(content.script, audioFilename)
            ]);

            // [Step 3] 상태 저장
            const newItem: VideoItem = {
                id,
                idea,
                status: 'planned',
                props: {
                    title: content.title,
                    subtitle: content.subtitle,
                    videoPath: `assets/${videoFilename}`,
                    audioPath: `assets/${audioFilename}`,
                    themeColor: content.color
                }
            };

            state.push(newItem);
            await fs.writeJSON(STATE_FILE, state, { spaces: 2 });
            
            console.log(chalk.green(`✅ 기획 성공!`));
            newWorkCount++;

        } catch (error: any) {
            console.error(chalk.red(`❌ 실패 (${idea}): ${error.message}`));
        }
    }

    if (newWorkCount > 0) {
        console.log(chalk.green(`\n✨ 총 ${newWorkCount}개의 기획이 완료되었습니다.`));
        console.log(chalk.white(`👉 다음 명령어 실행: npm run render`));
    } else {
        console.log(chalk.gray('\n💤 새로운 작업이 없습니다.'));
    }
}

run();