import { registerRoot, getInputProps } from 'remotion';
import React, { useMemo } from 'react';
import { Composition, AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig, Sequence, OffthreadVideo, Img } from 'remotion';

// 🎨 디자인 상수
const STYLE = {
  FONT_MAIN: 'Impact, sans-serif',
  FONT_SUB: '"Apple SD Gothic Neo", sans-serif',
  COLOR_TITLE: '#FFFFFF',
  COLOR_HIGHLIGHT: '#FFD700',
  COLOR_SUBTITLE: '#FFFFFF',
};

// 자막 줄바꿈 로직
const groupWordsIntoLines = (words: any[]) => {
  const lines: { text: string; start: number; end: number }[] = [];
  if (!words || words.length === 0) return lines;
  let currentLine: string[] = [];
  let startTime = words[0].start;
  let lastEndTime = words[0].end;

  words.forEach((item, index) => {
    const word = item.word.trim();
    if ((currentLine.join(' ').length + word.length > 20) && currentLine.length > 0) {
      lines.push({ text: currentLine.join(' '), start: startTime, end: lastEndTime + 0.3 });
      currentLine = []; startTime = item.start;
    }
    currentLine.push(word); lastEndTime = item.end;
    if (index === words.length - 1) lines.push({ text: currentLine.join(' '), start: startTime, end: lastEndTime + 1.0 });
  });
  return lines;
};

// 자막 컴포넌트
const NewsSubtitles = ({ transcript, fps, frame }: { transcript: any[], fps: number, frame: number }) => {
  const currentTime = frame / fps;
  const lines = useMemo(() => groupWordsIntoLines(transcript), [transcript]);
  const currentLineObj = lines.find((line) => currentTime >= line.start && currentTime <= line.end);

  if (!currentLineObj) return null;

  return (
    <div style={{
      width: '85%', textAlign: 'center', padding: '20px',
      backgroundColor: 'rgba(0, 0, 0, 0.65)', borderRadius: 20,
      backdropFilter: 'blur(10px)',
    }}>
      <span style={{
        fontSize: 55, fontFamily: STYLE.FONT_SUB, fontWeight: 800,
        color: STYLE.COLOR_SUBTITLE, lineHeight: 1.3, wordBreak: 'keep-all', whiteSpace: 'pre-wrap'
      }}>
        {currentLineObj.text}
      </span>
    </div>
  );
};

// ★ [핵심] 동영상/이미지 재생 컴포넌트
const DynamicVideoBackground = ({ src }: { src: string }) => {
  const isVideo = src.toLowerCase().endsWith('.mp4');

  return (
    <AbsoluteFill>
      {isVideo ? (
        <OffthreadVideo
          src={src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover', // 9:16 비율 꽉 채움
          }}
          muted={true} // 배경음은 BGM이 담당하므로 뮤트
        />
      ) : (
        <Img
          src={src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}
    </AbsoluteFill>
  );
};

const MarketingVideo = (props: any) => {
  const { durationInFrames, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const globalProps = getInputProps();
  const finalProps = { ...globalProps, ...props };

  const videoPaths = finalProps.imagePaths || [];
  const bgmPath = finalProps.bgmPath;
  const audioPath = finalProps.audioPath;
  const transcript = finalProps.transcript || [];
  const title = finalProps.title || "";
  const subtitle = finalProps.subtitle || "";

  const durationPerClip = videoPaths.length > 0
    ? Math.floor(durationInFrames / videoPaths.length)
    : durationInFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>

      {/* 1. 배경 동영상 슬라이드 */}
      <AbsoluteFill>
        {videoPaths.length > 0 ? (
          videoPaths.map((src: string, index: number) => (
            <Sequence key={index} from={index * durationPerClip} durationInFrames={durationPerClip}>
              <DynamicVideoBackground src={staticFile(src)} />
            </Sequence>
          ))
        ) : (
          <div style={{ color: 'white' }}>Video Loading Failed</div>
        )}
      </AbsoluteFill>

      {/* 2. 오버레이 */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.8) 100%)' }} />

      {/* 3. 제목 */}
      <AbsoluteFill style={{ top: 150, alignItems: 'center', width: '100%', zIndex: 10 }}>
        <h1 style={{
          margin: 0, color: STYLE.COLOR_TITLE, fontFamily: STYLE.FONT_MAIN,
          fontSize: 90, fontWeight: 900, textAlign: 'center', width: '90%',
          textShadow: '0 4px 15px rgba(0,0,0,0.8)', textTransform: 'uppercase'
        }}>
          {title}
        </h1>
        <div style={{
          marginTop: 20, backgroundColor: STYLE.COLOR_HIGHLIGHT, color: 'black',
          fontSize: 45, fontFamily: STYLE.FONT_MAIN, fontWeight: 800, padding: '10px 30px',
          transform: 'rotate(-2deg)', boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
        }}>
          {subtitle}
        </div>
      </AbsoluteFill>

      {/* 4. 자막 */}
      <AbsoluteFill style={{ top: 'unset', bottom: 180, height: 'auto', alignItems: 'center', width: '100%', zIndex: 10 }}>
        <NewsSubtitles transcript={transcript} fps={fps} frame={frame} />
      </AbsoluteFill>

      {/* 5. 오디오 */}
      {audioPath ? <Audio src={staticFile(audioPath)} /> : null}
      {bgmPath ? <Audio src={staticFile(bgmPath)} volume={0.15} loop /> : null}

    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MarketingClip"
        component={MarketingVideo}
        durationInFrames={30 * 15}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};

registerRoot(RemotionRoot);