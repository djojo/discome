"use client";

import dynamic from "next/dynamic";

// Web Audio + WebGL only exist in the browser: skip server prerendering for the visualizer.
const Visualizer = dynamic(() => import("./Visualizer"), {
  ssr: false,
  loading: () => <div className="boot">Discome</div>,
});

export default function VisualizerClient() {
  return <Visualizer />;
}
