/**
 * The YouTube set behind the « play » button of the start screen.
 *
 * A YouTube player is an iframe from another origin: its sound never reaches the Web Audio API. Discome plays it in a
 * small embedded player and listens to it by capturing the sound of its own tab (AudioEngine, source "youtube").
 */
export const YOUTUBE_SET = {
  videoId: "OpstwHg3FiQ",
  title: "Kolter · Thuishaven Amsterdam 2025",
};

/** The few calls of the YouTube IFrame Player API that Discome uses. */
export interface YTPlayer {
  playVideo(): void;
  destroy(): void;
}

interface YTPlayerOptions {
  host?: string;
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: () => void;
    onError?: (e: { data: number }) => void;
  };
}

interface YTApi {
  Player: new (el: HTMLElement, options: YTPlayerOptions) => YTPlayer;
}

type YTWindow = Window & { YT?: Partial<YTApi>; onYouTubeIframeAPIReady?: () => void };

let api: Promise<YTApi> | null = null;

/** Loads https://www.youtube.com/iframe_api once, on first use (nothing is fetched from YouTube before the click). */
export function loadYouTubeApi(): Promise<YTApi> {
  if (api) return api;
  api = new Promise<YTApi>((resolve, reject) => {
    const w = window as YTWindow;
    if (w.YT?.Player) return resolve(w.YT as YTApi);
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(w.YT as YTApi);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      api = null;
      script.remove();
      reject(new Error("Impossible de charger le lecteur YouTube : vérifie la connexion."));
    };
    document.head.appendChild(script);
  });
  return api;
}

/** Player error codes, see https://developers.google.com/youtube/iframe_api_reference#onError */
export function youtubeErrorMessage(code: number): string {
  if (code === 100) return "Cette vidéo YouTube n'existe plus ou est privée.";
  if (code === 101 || code === 150) return "Le propriétaire de cette vidéo n'autorise plus sa lecture hors de YouTube.";
  return "Le lecteur YouTube n'arrive pas à lire cette vidéo.";
}
