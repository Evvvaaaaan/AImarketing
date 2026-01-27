import React from 'react';
import { Composition, AbsoluteFill, Video, Audio, staticFile, useCurrentFrame, spring, useVideoConfig } from 'remotion';

// 1. 데이터 타입 정의 (무조건 이 모양대로 받아야 함)
type VideoProps = {
  title: string;
  subtitle: string;
  videoPath: string;
  audioPath: string;
  themeColor: string;
};

// 2. 영상을 그리는 컴포넌트 (내부 정의)
const MarketingVideo: React.FC<VideoProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ★ 데이터가 잘 들어왔는지 터미널에 로그를 찍습니다 (디버깅용)
  if (frame === 0) {
    console.log("✅ [Remotion] 컴포넌트가 받은 데이터:", JSON.stringify(props, null, 2));
  }

  const { title, subtitle, videoPath, audioPath, themeColor } = props;

  // 애니메이션
  const textSlide = spring({ frame, fps, from: 50, to: 0, config: { damping: 12 } });
  const opacity = spring({ frame, fps, from: 0, to: 1, config: { damping: 20 } });

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* 배경 영상 */}
      <AbsoluteFill>
        {videoPath ? (
          <Video 
            src={staticFile(videoPath)} 
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} 
            muted
          />
        ) : null}
      </AbsoluteFill>

      {/* 오디오 */}
      {audioPath ? <Audio src={staticFile(audioPath)} /> : null}

      {/* 텍스트 */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 40 }}>
        <h1 style={{ 
            color: 'white', fontSize: 70, fontWeight: 900, textAlign: 'center', 
            textShadow: '0 4px 20px rgba(0,0,0,0.8)', zIndex: 10,
            transform: `translateY(${textSlide}px)`, opacity
        }}>
          {title || "제목 에러: 데이터가 없습니다"} 
        </h1>

        <div style={{
            marginTop: 40, padding: '15px 30px', 
            backgroundColor: themeColor || '#007BFF', 
            borderRadius: 15, color: 'white', fontWeight: 'bold', fontSize: 30,
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)', opacity, zIndex: 10
        }}>
          {subtitle || "부제목 에러: 데이터가 없습니다"}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 3. Remotion 등록
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
        // defaultProps를 아예 삭제했습니다. 
        // 데이터가 안 들어오면 화면에 "제목 에러"라고 뜨게 해서 원인을 바로 찾게 합니다.
      />
    </>
  );
};