"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine, type SourceKind } from "@/lib/audio/AudioEngine";
import { defaultParams, SCENES, sceneById, type ParamValue, type Viewport } from "@/scenes";
import { Compositor } from "@/engine/Compositor";
import { Director } from "@/engine/Director";
import type { Section } from "@/lib/audio/MusicAnalyzer";
import { ControlPanel, SOURCE_LABELS } from "./ControlPanel";
import {
  allLooks,
  applyLook,
  enterWorld,
  findLook,
  loadSettings,
  nextWorldId,
  QUALITY_DPR,
  resetPlan,
  saveCurrentLook,
  saveSettings,
  type Settings,
} from "./settings";
import { NEUTRAL_FX, type FxSettings } from "@/engine/fx";
import { findPlan, lookBackgrounds, lookPlans, planDefaults, sceneForKey } from "@/looks";
import { HEADS, preloadHeads } from "@/scenes/art/heads";
import { getPalette, ink } from "@/scenes/palettes";
import { preloadDancer } from "@/scenes/3d/humanoid/dancerAsset";
import type { DirectorContext } from "@/engine/Director";

const IDLE_MS = 3500;

const SECTION_LABELS: Record<Section, string> = {
  calm: "Groove",
  breakdown: "Breakdown",
  build: "Montée",
  drop: "Drop",
};

function describeError(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === "NotAllowedError") return "Accès refusé : autorise le micro ou le partage d'écran dans le navigateur.";
    if (e.name === "NotFoundError") return "Aucune entrée audio détectée.";
    if (e.name === "NotSupportedError") return "Ce navigateur ne permet pas cette source.";
  }
  return e instanceof Error ? e.message : "Impossible de démarrer l'audio.";
}

/** Plans of the current world (arrows and digits move through them). */
function worldOrder(s: Settings) {
  const own = lookPlans(findLook(s)).map((p) => p.key);
  return own.length ? own : SCENES.map((x) => x.id);
}

/** Scene behind a plan key (or a plain scene id). */
const sceneOf = (s: Settings, key: string) => sceneForKey(key, allLooks(s)) ?? sceneById(key);

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
  const [debugOpen, setDebugOpen] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const meterRefs = useRef<(HTMLDivElement | null)[]>([]);
  const beatRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLSpanElement>(null);
  const debugRef = useRef<HTMLPreElement>(null);
  const settingsRef = useRef(settings);
  const overPanelRef = useRef(false);

  const scene = sceneOf(settings, settings.sceneId);
  const params = settings.params[settings.sceneId] ?? defaultParams(scene);
  const planLabel = findPlan(settings.sceneId, allLooks(settings))?.label ?? scene.name;

  useEffect(() => {
    settingsRef.current = settings;
    engine.setSensitivity(settings.sensitivity);
    saveSettings(settings);
  }, [settings, engine]);

  const patchSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);

  const goToScene = useCallback((id: string) => setSettings((s) => ({ ...s, sceneId: id })), []);

  const stepScene = useCallback((delta: number) => {
    setSettings((s) => {
      const order = worldOrder(s);
      const i = order.indexOf(s.sceneId);
      return { ...s, sceneId: order[(Math.max(0, i) + delta + order.length) % order.length] };
    });
  }, []);

  // ---------------------------------------------------------------- render loop
  useEffect(() => {
    const stage = stageRef.current!;
    const compositor = new Compositor(canvasRef.current!, (key) => sceneOf(settingsRef.current, key));
    let viewport: Viewport = { width: 1, height: 1, dpr: 1 };
    let raf = 0;
    let last = performance.now();
    let firstShow = true;
    // Every head of the library loads in the background shortly after start: the director can then cut to
    // any of them (or another world) without a head popping in late. ~25 Mo, read once.
    const headsTimer = window.setTimeout(() => preloadHeads(HEADS.map((h) => h.id)), 4000);

    // "Auto" quality: lower the resolution when frames get slow, raise it back when there's headroom.
    const AUTO_MIN = 0.6;
    const autoMax = Math.min(window.devicePixelRatio || 1, 1.5);
    let autoDpr = Math.min(QUALITY_DPR.auto, autoMax);
    let frameAvg = 1 / 60;
    let nextCheck = performance.now() + 2500;
    let goodChecks = 0;

    const measure = () => {
      const q = settingsRef.current.quality;
      const cap = q === "auto" ? autoDpr : QUALITY_DPR[q];
      viewport = {
        width: Math.max(1, stage.clientWidth),
        height: Math.max(1, stage.clientHeight),
        dpr: Math.min(window.devicePixelRatio || 1, cap),
      };
      compositor.setViewport(viewport);
    };

    const adaptQuality = (now: number, interval: number) => {
      if (interval < 0.25) frameAvg += (interval - frameAvg) * 0.05; // ignore pauses (hidden tab)
      if (settingsRef.current.quality !== "auto" || now < nextCheck) return;
      nextCheck = now + 2000;
      if (frameAvg > 1 / 45 && autoDpr > AUTO_MIN) {
        autoDpr = Math.max(AUTO_MIN, autoDpr * 0.85);
        goodChecks = 0;
        measure();
      } else if (frameAvg < 1 / 57 && autoDpr < autoMax && ++goodChecks >= 4) {
        autoDpr = Math.min(autoMax, autoDpr * 1.1);
        goodChecks = 0;
        measure();
      }
    };

    if (process.env.NODE_ENV !== "production") {
      // Dev-only handle for debugging from the console.
      (window as unknown as { __discome?: unknown }).__discome = {
        compositor,
        engine,
        /** Force the night's drift (0..1) to look at a world at any point of the night; null to let it run. */
        setDrift: (v: number | null) => (driftOverride = v),
      };
    }

    let lastQuality = settingsRef.current.quality;
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    measure();

    // The night's drift: counted while a source plays, from zero again when the source changes
    let driftTime = 0;
    let driftKind: unknown = null;
    let driftOverride: number | null = null;
    const director = new Director();
    const fxShown: FxSettings = { ...NEUTRAL_FX, ...settingsRef.current.fx };
    // Director pool derived from the active look, rebuilt only when the look changes
    let lookKey = "";
    let lookCtx: Pick<DirectorContext, "plans" | "palettes" | "transitions"> = { plans: [] };
    let bgShots: { id: string; weight?: number }[] = [];
    let bgInk: [number, number, number] = [1, 1, 1];
    let firstBg = true;
    const lookContext = (s: Settings) => {
      const key = `${s.lookId}:${s.customLooks.length}`;
      if (key !== lookKey) {
        lookKey = key;
        const look = findLook(s);
        lookCtx = {
          plans: lookPlans(look).map((p) => ({
            key: p.key,
            scene: p.scene,
            energy: p.energy,
            weight: p.shot.weight ?? 1,
            defaults: planDefaults(p),
            vary: p.shot.vary,
            role: p.shot.role,
          })),
          palettes: look.palettes,
          transitions: look.transitions,
        };
        // the world's heads load now, so none pops in late when its plan comes up
        preloadHeads(
          lookPlans(look).flatMap((p) => [planDefaults(p).head, s.params[p.key]?.head, ...(p.shot.vary?.choices?.head ?? [])]),
        );
        bgShots = lookBackgrounds(look);
        bgInk = ink(getPalette(look.palettes[0]));
      }
      return lookCtx;
    };
    let hudText = "";
    let debugText = "";

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const interval = (now - last) / 1000;
      const dt = Math.min(0.1, interval);
      last = now;

      adaptQuality(now, interval);
      if (settingsRef.current.quality !== lastQuality) {
        lastQuality = settingsRef.current.quality;
        measure();
      }

      const frame = engine.update(dt);
      if (engine.kind !== driftKind) {
        driftKind = engine.kind;
        driftTime = 0;
      }
      if (frame.active) driftTime += dt;
      const driftMin = settingsRef.current.drift;
      frame.drift = driftOverride ?? (driftMin > 0 ? Math.min(1, driftTime / (driftMin * 60)) : 0);
      let s = settingsRef.current;

      // ---- Auto director
      const decision = director.update(frame, {
        mode: s.director,
        locked: s.locked,
        vary: s.vary,
        currentId: compositor.sceneId,
        layerId: s.layer.sceneId,
        inTransition: compositor.inTransition,
        params: s.params,
        worldCycle: s.worldCycle,
        ...lookContext(s),
        background: { auto: s.background.auto, currentId: compositor.backgroundId, shots: bgShots },
      });
      if (decision?.background) {
        const id = decision.background;
        s = { ...s, background: { ...s.background, sceneId: id } };
        settingsRef.current = s;
        setSettings((cur) => ({ ...cur, background: { ...cur.background, sceneId: id } }));
        compositor.setBackground(id, decision.bgFade ?? 4);
      }
      if (decision?.preload) {
        const id = decision.preload;
        compositor.preload(id, frame, s.params[id] ?? defaultParams(sceneOf(s, id)));
      }
      if (decision?.changeWorld) {
        // Next world: its look, its shots, and a dip to black between the two
        const next = enterWorld(s, nextWorldId(s));
        s = next;
        settingsRef.current = next;
        setSettings(next);
        compositor.show(next.sceneId, { type: "dip", duration: (frame.bpm > 0 ? 60 / frame.bpm : 0.5) * 6 });
        director.noteWorldChange(next.sceneId);
        firstShow = false;
      }
      if (decision?.sceneId && decision.transition) {
        const id = decision.sceneId;
        const varied = decision.params;
        s = { ...s, sceneId: id, params: varied ? { ...s.params, [id]: varied } : s.params };
        settingsRef.current = s; // right away, so the manual-change check below doesn't undo the cut
        setSettings((cur) => ({ ...cur, sceneId: id, params: varied ? { ...cur.params, [id]: varied } : cur.params }));
        compositor.show(id, decision.transition);
        firstShow = false;
      }

      // ---- Manual changes (panel, keyboard)
      if (s.sceneId !== compositor.sceneId) {
        compositor.show(
          s.sceneId,
          firstShow ? { type: "cut", duration: 0 } : { type: s.transition, duration: s.transitionTime },
        );
        if (!firstShow) director.noteManualCut(s.sceneId);
        firstShow = false;
      }
      if (s.layer.sceneId !== compositor.layerId) compositor.setLayer(s.layer.sceneId);
      if (s.background.sceneId !== compositor.backgroundId) {
        compositor.setBackground(s.background.sceneId, firstBg ? 0 : 3);
      }
      firstBg = false;

      const params = s.params;
      // Post-effects glide to the new world's values instead of jumping
      const k = 1 - Math.exp(-dt * 1.2);
      for (const key of Object.keys(fxShown) as (keyof FxSettings)[]) {
        const target = s.fx[key];
        if (typeof target === "number" && key !== "mirror") {
          (fxShown[key] as number) += (target - (fxShown[key] as number)) * k;
        } else {
          (fxShown as unknown as Record<string, unknown>)[key] = target;
        }
      }
      lookContext(s); // keeps the background ink in sync with the world
      compositor.render(
        frame,
        (id) => params[id] ?? defaultParams(sceneOf(s, id)),
        dt,
        s.layer,
        { tension: director.tension, fx: fxShown, safeFlash: s.safeFlash },
        {
          opacity: Math.min(1, s.background.opacity * director.bgLevel),
          tint: s.background.tint ? 1 : 0,
          blur: s.background.blur,
          ink: bgInk,
        },
      );

      // ---- HUD, written straight to the DOM (no React re-render per frame)
      const levels = [frame.bass, frame.mid, frame.treble, frame.volume];
      meterRefs.current.forEach((el, i) => {
        if (el) el.style.transform = `scaleY(${0.04 + levels[i] * 0.96})`;
      });
      if (beatRef.current) beatRef.current.style.opacity = String(0.15 + frame.beatPulse * 0.85);
      const hud = `${frame.bpm > 0 ? Math.round(frame.bpm) : "—"} BPM · ${SECTION_LABELS[frame.section]} · ${findLook(s).name}`;
      if (hudRef.current && hud !== hudText) {
        hudText = hud;
        hudRef.current.textContent = hud;
        hudRef.current.dataset.section = frame.section;
      }
      if (debugRef.current) {
        const info = compositor.sceneInfo;
        const text = director.describe(frame, s.director) + (info ? `\n${info}` : "");
        if (text !== debugText) {
          debugText = text;
          debugRef.current.textContent = text;
        }
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(headsTimer);
      ro.disconnect();
      compositor.dispose();
    };
  }, [engine]);

  useEffect(() => {
    // Warm the dancer model download so humanoid scenes appear without a wait
    preloadDancer().catch(() => {});
  }, []);

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
      const target = e.target instanceof Element ? e.target : null;
      const typing = target?.closest("input, select, textarea");
      if (typing && !(target instanceof HTMLInputElement && target.type === "range")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") stepScene(1);
      else if (e.key === "ArrowLeft") stepScene(-1);
      else if (e.key === "f" || e.key === "F") toggleFullscreen();
      else if (e.key === "h" || e.key === "H") setUiHidden((v) => !v);
      else if (e.key === " ") {
        (document.activeElement as HTMLElement | null)?.blur?.();
        engine.triggerDrop();
      } else if (e.key === "t" || e.key === "T") engine.tap();
      else if (e.key === "l" || e.key === "L") setSettings((s) => ({ ...s, locked: !s.locked }));
      else if (e.key === "d" || e.key === "D") setDebugOpen((v) => !v);
      else if (/^[1-9]$/.test(e.key)) {
        const id = worldOrder(settingsRef.current)[Number(e.key) - 1];
        if (id) goToScene(id);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepScene, goToScene, toggleFullscreen, engine]);

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
        <canvas ref={canvasRef} />
      </div>

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
              {planLabel}
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
                planLabel={planLabel}
                params={params}
                settings={settings}
                source={source}
                busy={busy}
                onScene={goToScene}
                onParam={(key: string, value: ParamValue) =>
                  setSettings((s) => ({
                    ...s,
                    params: { ...s.params, [s.sceneId]: { ...s.params[s.sceneId], [key]: value } },
                  }))
                }
                onResetParams={() => setSettings((s) => resetPlan(s, s.sceneId))}
                onSettings={patchSettings}
                onSource={(k) => startSource(k)}
                onTap={() => engine.tap()}
                onDrop={() => engine.triggerDrop()}
                onLook={(id) => {
                  const look = findLook(settings, id);
                  if (look.fx.strobe && look.fx.strobe !== "off" && !settings.strobeWarned) {
                    setError("Ce look utilise un stroboscope sur les drops. Active « Limiter les flashs » si besoin.");
                  }
                  setSettings((s) => ({ ...applyLook(s, findLook(s, id)), strobeWarned: s.strobeWarned || !!look.fx.strobe }));
                }}
                onSaveLook={() => setSettings((s) => saveCurrentLook(s))}
                onDeleteLook={(id) =>
                  setSettings((s) => ({
                    ...s,
                    customLooks: s.customLooks.filter((l) => l.id !== id),
                    lookId: s.lookId === id ? "free" : s.lookId,
                  }))
                }
                onFx={(patch) => setSettings((s) => ({ ...s, fx: { ...s.fx, ...patch } }))}
                onResetFx={() => setSettings((s) => ({ ...s, fx: applyLook(s, findLook(s)).fx }))}
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
              <span ref={hudRef} className="music-info" />
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

      {source && debugOpen && <pre ref={debugRef} className="debug" />}
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
