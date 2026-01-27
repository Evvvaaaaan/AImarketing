import React from 'react';
import { AbsoluteFill, Video, Audio, useCurrentFrame, spring, useVideoConfig, staticFile } from 'remotion';

// 1. 데이터 타입 정의 (Planner가 주는 데이터와 똑같아야 함)
export type VideoProps = {
  title: string;
  subtitle: string;
  videoPath: string;
  audioPath: string;
  themeColor: string;
};

export const MarketingVideo: React.FC<VideoProps> = ({ title, subtitle, videoPath, audioPath, themeColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 2. 애니메이션 효과
  const textSlide = spring({ frame, fps, from: 50, to: 0, config: { damping: 12 } });
  const opacity = spring({ frame, fps, from: 0, to: 1, config: { damping: 20 } });

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      
      {/* 3. 배경 비디오 */}
      <AbsoluteFill>
        {videoPath ? (
          <Video 
            src={staticFile(videoPath)} // public 폴더 기준 경로
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} 
            startFrom={0}
            muted
          />
        ) : null}
      </AbsoluteFill>

      {/* 4. 나레이션 오디오 */}
      {audioPath ? <Audio src={staticFile(audioPath)} /> : null}

      {/* 5. 텍스트 UI (여기가 핵심! 변수들이 제대로 꽂혀야 함) */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 40 }}>
        
        {/* 제목 */}
        <h1 style={{ 
            color: 'white', fontFamily: 'sans-serif', fontSize: 70, fontWeight: 900, 
            textAlign: 'center', textShadow: '0 4px 20px rgba(0,0,0,0.8)',
            width: '90%', wordBreak: 'keep-all', zIndex: 10,
            transform: `translateY(${textSlide}px)`, opacity
        }}>
          {title}
        </h1>

        {/* 부제목 */}
        <div style={{
            marginTop: 40, padding: '15px 30px', 
            backgroundColor: themeColor || '#007BFF', 
            borderRadius: 15, color: 'white', fontWeight: 'bold', fontSize: 30,
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)', opacity,
            maxWidth: '85%', textAlign: 'center', zIndex: 10
        }}>
          {subtitle}
        </div>

      </AbsoluteFill>
    </AbsoluteFill>
  );
};