import { registerRoot } from 'remotion';
import React from 'react';
import { Composition, AbsoluteFill, Video, Audio, staticFile, useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { z } from 'zod';

// 1. Props 스키마 정의
const mySchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  videoPath: z.string(),
  audioPath: z.string(),
  themeColor: z.string(),
});

// 2. 영상 디자인 컴포넌트
const MarketingVideo = (props: z.infer<typeof mySchema>) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame === 0) {
    console.log("✅ [엔진 내부] 전달받은 Props:", JSON.stringify(props, null, 2));
  }

  const { title, subtitle, themeColor, videoPath, audioPath } = props;

  // 애니메이션 효과
  const textSlide = spring({ frame, fps, from: 50, to: 0, config: { damping: 12 } });
  const opacity = spring({ frame, fps, from: 0, to: 1, config: { damping: 20 } });

  // [수정] 단순화: videoPath가 있으면 staticFile로 감싸서 사용
  // renderMedia 실행 시, 프로젝트 루트의 public 폴더가 자동으로 서빙됨
  const bgSource = videoPath ? staticFile(videoPath) : null;
  const audioSource = audioPath ? staticFile(audioPath) : null;

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>

      {/* 배경 비디오 */}
      <AbsoluteFill>
        {bgSource ? (
          <Video
            src={bgSource}
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }}
            muted
          />
        ) : null}
      </AbsoluteFill>

      {/* 나레이션 */}
      {audioSource ? <Audio src={audioSource} /> : null}

      {/* 텍스트 자막 */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 40 }}>
        <h1 style={{
          color: 'white', fontSize: 70, fontWeight: 900, textAlign: 'center',
          textShadow: '0 4px 20px rgba(0,0,0,0.8)', zIndex: 10,
          transform: `translateY(${textSlide}px)`, opacity
        }}>
          {title}
        </h1>

        <div style={{
          marginTop: 40, padding: '15px 30px',
          backgroundColor: themeColor,
          borderRadius: 15, color: 'white', fontWeight: 'bold', fontSize: 30,
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)', opacity, zIndex: 10
        }}>
          {subtitle}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 3. 엔진 등록
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MarketingClip"
        component={MarketingVideo}
        durationInFrames={30 * 15} // 15초
        fps={30}
        width={1080}
        height={1920}
        schema={mySchema}
        defaultProps={{
          title: "기본 제목 Example",
          subtitle: "기본 자막 Example",
          videoPath: "",
          audioPath: "",
          themeColor: "#FF0000"
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);