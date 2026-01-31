import { registerRoot, getInputProps } from 'remotion';
import React, { useMemo } from 'react';
import { Composition, AbsoluteFill, Img, Audio, staticFile, useCurrentFrame, useVideoConfig, interpolate, Sequence } from 'remotion';

// 🎨 디자인 상수
const STYLE = {
  BG_COLOR: '#000000', // 빈 공간이 생기면 검은색으로 처리
  FONT_TITLE: 'Impact, sans-serif',
  FONT_SUB: 'sans-serif',
  COLOR_TITLE: '#FFFFFF',
  COLOR_HIGHLIGHT: '#FFD700',
  COLOR_SUBTITLE: '#FFFFFF',
};

// 🧠 단어 줄바꿈 로직 (기존 유지)
const groupWordsIntoLines = (words: any[]) => {
  const lines: { text: string; start: number; end: number }[] = [];
  if (!words || words.length === 0) return lines;

  let currentLine: string[] = [];
  let startTime = words[0].start;
  let lastEndTime = words[0].end;

  words.forEach((item, index) => {
    const word = item.word.trim();
    const currentLength = currentLine.join(' ').length;
    if ((currentLength + word.length > 20) && currentLine.length > 0) {
      lines.push({ text: currentLine.join(' '), start: startTime, end: lastEndTime + 0.3 });
      currentLine = []; startTime = item.start;
    }
    currentLine.push(word); lastEndTime = item.end;
    if (index === words.length - 1) {
      lines.push({ text: currentLine.join(' '), start: startTime, end: lastEndTime + 1.0 });
    }
  });
  return lines;
};

// 🎬 자막 컴포넌트
const NewsSubtitles = ({ transcript, fps, frame }: { transcript: any[], fps: number, frame: number }) => {
  const currentTime = frame / fps;
  const lines = useMemo(() => groupWordsIntoLines(transcript), [transcript]);
  const currentLineObj = lines.find((line) => currentTime >= line.start && currentTime <= line.end);

  if (!currentLineObj) return null;

  return (
    <div style={{
      width: '85%', // 좌우 여백 확보
      textAlign: 'center',
      padding: '20px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderRadius: 25,
      backdropFilter: 'blur(10px)',
    }}>
      <span style={{
        fontSize: 55, // 폰트 크기 키움
        fontFamily: STYLE.FONT_SUB,
        fontWeight: 800,
        color: STYLE.COLOR_SUBTITLE,
        lineHeight: 1.3,
        wordBreak: 'keep-all',
        whiteSpace: 'pre-wrap'
      }}>
        {currentLineObj.text}
      </span>
    </div>
  );
};

// 🎬 [핵심 수정] 움직이는 이미지 (무조건 꽉 채움)
const MovingImage = ({ src }: { src: string }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // 줌인 효과
  const scale = interpolate(frame, [0, durationInFrames], [1.05, 1.25]); // 1.05배부터 시작해서 흰 여백 방지

  return (
    <AbsoluteFill>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover', // ★ 비율 무시하고 꽉 채우기 (잘림 허용)
          transform: `scale(${scale})`,
          position: 'absolute', // 절대 위치 강제
          top: 0,
          left: 0
        }}
      />
    </AbsoluteFill>
  );
};

// 🎬 메인 비디오 구성
const MarketingVideo = (props: any) => {
  const { durationInFrames, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const globalProps = getInputProps();
  const finalProps = { ...globalProps, ...props };

  const imagePaths = finalProps.imagePaths || [];
  const bgmPath = finalProps.bgmPath;
  const audioPath = finalProps.audioPath;
  const transcript = finalProps.transcript || [];
  const title = finalProps.title || "";
  const subtitle = finalProps.subtitle || "";

  const durationPerImage = imagePaths.length > 0
    ? Math.floor(durationInFrames / imagePaths.length)
    : durationInFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>

      {/* 1. 배경 이미지 슬라이드 (화면 전체 꽉 채움) */}
      <AbsoluteFill>
        {imagePaths.length > 0 ? (
          imagePaths.map((src: string, index: number) => (
            <Sequence key={index} from={index * durationPerImage} durationInFrames={durationPerImage}>
              <MovingImage src={staticFile(src)} />
            </Sequence>
          ))
        ) : (
          <div style={{ color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            이미지 로딩 실패
          </div>
        )}
      </AbsoluteFill>

      {/* 2. 가독성을 위한 그라데이션 오버레이 (상단/하단 어둡게) */}
      <AbsoluteFill style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 75%, rgba(0,0,0,0.8) 100%)'
      }} />

      {/* 3. 제목 (상단 Safe Zone 고려) */}
      <AbsoluteFill style={{ top: 150, alignItems: 'center', width: '100%', zIndex: 10 }}>
        <h1 style={{
          margin: 0, color: STYLE.COLOR_TITLE, fontFamily: STYLE.FONT_TITLE,
          fontSize: 85, fontWeight: 900, textAlign: 'center', width: '90%',
          textShadow: '0 4px 20px rgba(0,0,0,0.8)', textTransform: 'uppercase', lineHeight: 1.1
        }}>
          {title}
        </h1>
        <div style={{
          marginTop: 20, backgroundColor: STYLE.COLOR_HIGHLIGHT, color: 'black',
          fontSize: 40, fontFamily: STYLE.FONT_TITLE, fontWeight: 800, padding: '8px 30px',
          transform: 'rotate(-2deg)', boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
          borderRadius: 5
        }}>
          {subtitle}
        </div>
      </AbsoluteFill>

      {/* 4. 자막 (하단 Safe Zone 고려) */}
      <AbsoluteFill style={{ top: 'unset', bottom: 150, height: 'auto', alignItems: 'center', width: '100%', zIndex: 10 }}>
        <NewsSubtitles transcript={transcript} fps={fps} frame={frame} />
      </AbsoluteFill>

      {/* 5. 오디오 */}
      {audioPath ? <Audio src={staticFile(audioPath)} /> : null}
      {bgmPath ? <Audio src={staticFile(bgmPath)} volume={0.15} loop /> : null}

    </AbsoluteFill>
  );
};

// 🌱 Remotion 설정 (여기가 가장 중요합니다)
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MarketingClip"
        component={MarketingVideo}
        durationInFrames={30 * 30}
        fps={30}
        // ▼▼▼ 비율 강제 설정 구간 ▼▼▼
        width={1080}   // 가로 (Shorts 표준)
        height={1920}  // 세로 (Shorts 표준)
      />
    </>
  );
};

registerRoot(RemotionRoot);