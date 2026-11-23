"use client";

import { useEffect, useRef } from "react";
import { loadYouTubeApi, youtubeErrorMessage, type YTPlayer } from "@/lib/audio/youtube";

interface Props {
  videoId: string;
  title: string;
  /** False while Chrome still asks to share the tab: the player loads, the video waits for the capture. */
  play: boolean;
  onError: (message: string) => void;
}

/**
 * Small embedded YouTube player. It stays on screen even when the HUD hides: YouTube's rules forbid hiding a player
 * to keep only its sound, and want it at least 200 × 200 px.
 */
export function YouTubePlayer({ videoId, title, play, onError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const playRef = useRef(play);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const host = hostRef.current!;
    // The API swaps the element it gets for its iframe: give it a node React doesn't manage.
    const mount = document.createElement("div");
    host.appendChild(mount);
    let cancelled = false;
    loadYouTubeApi().then(
      (YT) => {
        if (cancelled) return;
        const player = new YT.Player(mount, {
          host: "https://www.youtube-nocookie.com",
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: () => {
              readyRef.current = true;
              if (playRef.current) player.playVideo();
            },
            onError: (e) => onErrorRef.current(youtubeErrorMessage(e.data)),
          },
        });
        playerRef.current = player;
      },
      (e: Error) => {
        if (!cancelled) onErrorRef.current(e.message);
      },
    );
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      readyRef.current = false;
      host.replaceChildren();
    };
  }, [videoId]);

  useEffect(() => {
    playRef.current = play;
    if (play && readyRef.current) playerRef.current?.playVideo();
  }, [play]);

  return <div ref={hostRef} className="yt-player" role="region" aria-label={`Lecteur YouTube : ${title}`} />;
}
