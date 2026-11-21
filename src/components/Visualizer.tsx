"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { AudioEngine, type SourceKind } from "@/lib/audio/AudioEngine";
import { defaultParams, SCENES, sceneById, type ParamValue, type SceneInstance, type Viewport } from "@/scenes";
import { ControlPanel, SOURCE_LABELS } from "./ControlPanel";
import { loadSettings, QUALITY_DPR, saveSettings, type Settings } from "./settings";

const IDLE_MS = 3500;

function describeError(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === "NotAllowedError") return "Accès refusé : autorise le micro ou le partage d'écran dans le navigateur.";
    if (e.name === "NotFoundError") return "Aucune entrée audio détectée.";
    if (e.name === "NotSupportedError") return "Ce navigateur ne permet pas cette source.";
  }
  return e instanceof Error ? e.message : "Impossible de démarrer l'audio.";
}

export default function Visualizer() {
  const [engine] = useState(() => new AudioEngine());
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [source, setSource] = useState<SourceKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [filePaused, setFilePaused] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [uiHidden, setUiHidden] = useState(false);
  const [idle, setIdle] = useState(false);
  const [dragging, setDragging] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const canvasGlRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const meterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const beatRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);
  const overPanelRef = useRef(false);

  const scene = sceneById(settings.sceneId);
  const params = settings.params[scene.id] ?? defaultParams(scene);

  useEffect(() => {
    settingsRef.current = settings;
    engine.setSensitivity(settings.sensitivity);
    saveSettings(settings);
  }, [settings, engine]);

  const patchSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);

  const goToScene = useCallback((id: string) => setSettings((s) => ({ ...s, sceneId: id })), []);

  const stepScene = useCallback((delta: number) => {
    setSettings((s) => {
      const i = SCENES.findIndex((x) => x.id === s.sceneId);
      const next = SCENES[(i + delta + SCENES.length) % SCENES.length];
      return { ...s, sceneId: next.id };
    });
  }, []);

  // ---------------------------------------------------------------- render loop
  useEffect(() => {
    const stage = stageRef.current!;
    const c2d = canvas2dRef.current!;
    const cgl = canvasGlRef.current!;
    const ctx2d = c2d.getContext("2d")!;
    const renderer = new THREE.WebGLRenderer({ canvas: cgl, antialias: true, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 1);
    // Scene colours are authored as final display values (same as the 2D canvas), so no sRGB encode at the end.
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    let instance: SceneInstance | null = null;
    let instanceId = "";
    let lastSwitch = performance.now();
    let viewport: Viewport = { width: 1, height: 1, dpr: 1 };
    let raf = 0;
    let last = performance.now();

    const measure = () => {
      const q = QUALITY_DPR[settingsRef.current.quality];
      viewport = {
        width: Math.max(1, stage.clientWidth),
        height: Math.max(1, stage.clientHeight),
        dpr: Math.min(window.devicePixelRatio || 1, q),
      };
      c2d.width = Math.round(viewport.width * viewport.dpr);
      c2d.height = Math.round(viewport.height * viewport.dpr);
      renderer.setPixelRatio(viewport.dpr);
      renderer.setSize(viewport.width, viewport.height, false);
      instance?.resize?.(viewport);
    };

    const mountScene = (id: string) => {
      instance?.dispose?.();
      const def = sceneById(id);
      instanceId = def.id;
      lastSwitch = performance.now();
      ctx2d.setTransform(1, 0, 0, 1, 0, 0);
      ctx2d.globalCompositeOperation = "source-over";
      ctx2d.globalAlpha = 1;
      ctx2d.fillStyle = "#000";
      ctx2d.fillRect(0, 0, c2d.width, c2d.height);
      c2d.style.display = def.kind === "2d" ? "block" : "none";
      cgl.style.display = def.kind === "webgl" ? "block" : "none";
      instance =
        def.kind === "2d"
          ? def.create({ canvas: c2d, ctx: ctx2d, viewport })
          : def.create({ canvas: cgl, renderer, viewport });
      instance.resize?.(viewport);
    };

    let lastQuality = settingsRef.current.quality;
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    measure();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = settingsRef.current;

      if (s.quality !== lastQuality) {
        lastQuality = s.quality;
        measure();
      }
      if (s.sceneId !== instanceId) mountScene(s.sceneId);

      const frame = engine.update(dt);
      const p = s.params[instanceId] ?? defaultParams(sceneById(instanceId));
      instance!.render(frame, p, dt);

      // HUD meters, written straight to the DOM (no React re-render per frame)
      const levels = [frame.bass, frame.mid, frame.treble, frame.volume];
      meterRefs.current.forEach((el, i) => {
        if (el) el.style.transform = `scaleY(${0.04 + levels[i] * 0.96})`;
      });
      if (beatRef.current) beatRef.current.style.opacity = String(0.15 + frame.beatPulse * 0.85);

      // Auto-cycle: switch on a beat once the delay has passed (or a bit later if no beat comes)
      if (s.autoCycle && frame.active) {
        const elapsed = (now - lastSwitch) / 1000;
        if ((elapsed > s.cycleSeconds && frame.beat) || elapsed > s.cycleSeconds + 4) {
          lastSwitch = now;
          const i = SCENES.findIndex((x) => x.id === instanceId);
          const nextId = SCENES[(i + 1) % SCENES.length].id;
          setSettings((cur) => ({ ...cur, sceneId: nextId }));
        }
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      instance?.dispose?.();
      renderer.dispose();
    };
  }, [engine]);

  useEffect(() => {
    engine.setOnEnded(() => setSource(null));
    return () => {
      engine.setOnEnded(null);
      engine.stop();
    };
  }, [engine]);

  // ---------------------------------------------------------------- audio sources
  const startSource = useCallback(
    async (kind: SourceKind, file?: File) => {
      if (kind === "file" && !file) {
        fileInputRef.current?.click();
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await engine.start(kind, file);
        setSource(kind);
        setFileName(file?.name ?? null);
        setFilePaused(false);
      } catch (e) {
        setError(describeError(e));
        setSource(engine.kind);
      } finally {
        setBusy(false);
      }
    },
    [engine],
  );

  const stopSource = useCallback(() => {
    engine.stop();
    setSource(null);
    setFileName(null);
  }, [engine]);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("audio/") && !/\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(f.name)) {
      setError("Ce fichier n'a pas l'air d'être un fichier audio.");
      return;
    }
    void startSource("file", f);
  };

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  // ---------------------------------------------------------------- keyboard & idle UI
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, select, textarea") && !(target instanceof HTMLInputElement && target.type === "range")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") stepScene(1);
      else if (e.key === "ArrowLeft") stepScene(-1);
      else if (e.key === "f" || e.key === "F") toggleFullscreen();
      else if (e.key === "h" || e.key === "H") setUiHidden((v) => !v);
      else if (/^[1-9]$/.test(e.key)) {
        const s = SCENES[Number(e.key) - 1];
        if (s) goToScene(s.id);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepScene, goToScene, toggleFullscreen]);

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (!overPanelRef.current) setIdle(true);
    }, IDLE_MS);
  }, []);
  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  const uiVisible = !uiHidden && !(idle && source);

  // ---------------------------------------------------------------- render
  return (
    <div
      className={`root ${uiVisible ? "" : "ui-hidden"}`}
      onPointerMove={wake}
      onPointerDown={wake}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFile(e.dataTransfer.files[0]);
      }}
    >
      <div ref={stageRef} className="stage">
        <canvas ref={canvas2dRef} />
        <canvas ref={canvasGlRef} />
      </div>
      <div key={scene.id} className="flash" />

      {!source ? (
        <div className="start">
          <div className="start-card">
            <h1 className="logo logo-big">Discome</h1>
            <p className="tagline">Visualiseur audio psychédélique. Choisis ce qui fait danser l&apos;écran :</p>
            <div className="start-grid">
              <button className="start-btn" disabled={busy} onClick={() => startSource("mic")}>
                <strong>Micro / entrée audio</strong>
                <span>Carte son, line-in, micro</span>
              </button>
              <button className="start-btn" disabled={busy} onClick={() => startSource("tab")}>
                <strong>Son d&apos;un onglet</strong>
                <span>Spotify web, YouTube… (Chrome)</span>
              </button>
              <button className="start-btn" disabled={busy} onClick={() => startSource("file")}>
                <strong>Fichier audio</strong>
                <span>MP3, WAV… ou glisse-le ici</span>
              </button>
              <button className="start-btn start-btn-accent" disabled={busy} onClick={() => startSource("demo")}>
                <strong>Démo</strong>
                <span>Boucle techno générée en direct</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <header className="hud hud-top">
            <span className="logo">Discome</span>
            <span className="scene-title">
              <button className="icon-btn" onClick={() => stepScene(-1)} aria-label="Scène précédente">
                ‹
              </button>
              {scene.name}
              <button className="icon-btn" onClick={() => stepScene(1)} aria-label="Scène suivante">
                ›
              </button>
            </span>
            <span className="hud-actions">
              <button className="icon-btn wide" onClick={toggleFullscreen}>
                Plein écran
              </button>
              <button className="icon-btn wide" onClick={() => setPanelOpen((v) => !v)}>
                {panelOpen ? "Fermer" : "Réglages"}
              </button>
            </span>
          </header>

          {panelOpen && (
            <aside
              className="hud panel"
              onPointerEnter={() => (overPanelRef.current = true)}
              onPointerLeave={() => (overPanelRef.current = false)}
            >
              <ControlPanel
                scene={scene}
                params={params}
                settings={settings}
                source={source}
                busy={busy}
                onScene={goToScene}
                onParam={(key: string, value: ParamValue) =>
                  setSettings((s) => ({
                    ...s,
                    params: { ...s.params, [scene.id]: { ...s.params[scene.id], [key]: value } },
                  }))
                }
                onResetParams={() =>
                  setSettings((s) => ({ ...s, params: { ...s.params, [scene.id]: defaultParams(scene) } }))
                }
                onSettings={patchSettings}
                onSource={(k) => startSource(k)}
              />
            </aside>
          )}

          <footer className="hud hud-bottom">
            <div className="meters" aria-hidden>
              {["Basses", "Médiums", "Aigus", "Volume"].map((label, i) => (
                <div key={label} className="meter" title={label}>
                  <div className="meter-fill" ref={(el) => void (meterRefs.current[i] = el)} />
                  <span>{label[0]}</span>
                </div>
              ))}
              <div className="beat" ref={beatRef} title="Beat" />
            </div>
            <div className="source-info">
              <span className="dot" />
              {SOURCE_LABELS[source]}
              {fileName && <em> · {fileName}</em>}
              {source === "file" && (
                <button
                  className="icon-btn wide"
                  onClick={() => {
                    engine.toggleFilePlayback();
                    setFilePaused((v) => !v);
                  }}
                >
                  {filePaused ? "Lecture" : "Pause"}
                </button>
              )}
              <button className="icon-btn wide" onClick={stopSource}>
                Arrêter
              </button>
            </div>
          </footer>
        </>
      )}

      {dragging && <div className="dropzone">Dépose ton fichier audio</div>}
      {error && (
        <div className="toast" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
