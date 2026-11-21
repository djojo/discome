"use client";

import type { SourceKind } from "@/lib/audio/AudioEngine";
import { SCENES, type ParamValue, type ParamValues, type SceneDef } from "@/scenes";
import { ParamControl } from "./ParamControl";
import { BLEND_MODES, TRANSITIONS, type BlendModeId, type TransitionId } from "@/engine/transitions";
import type { Quality, Settings } from "./settings";

export const SOURCE_LABELS: Record<SourceKind, string> = {
  mic: "Micro / entrée",
  tab: "Son d'un onglet",
  file: "Fichier",
  demo: "Démo",
};

interface Props {
  scene: SceneDef;
  params: ParamValues;
  settings: Settings;
  source: SourceKind | null;
  busy: boolean;
  onScene: (id: string) => void;
  onParam: (key: string, value: ParamValue) => void;
  onResetParams: () => void;
  onSettings: (patch: Partial<Settings>) => void;
  onSource: (kind: SourceKind) => void;
}

export function ControlPanel({
  scene,
  params,
  settings,
  source,
  busy,
  onScene,
  onParam,
  onResetParams,
  onSettings,
  onSource,
}: Props) {
  return (
    <div className="panel-inner">
      <section>
        <h2>Source audio</h2>
        <div className="source-grid">
          {(Object.keys(SOURCE_LABELS) as SourceKind[]).map((k) => (
            <button
              key={k}
              className={`chip ${source === k ? "chip-active" : ""}`}
              disabled={busy}
              onClick={() => onSource(k)}
            >
              {SOURCE_LABELS[k]}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Scènes</h2>
        <div className="scene-grid">
          {SCENES.map((s, i) => (
            <button
              key={s.id}
              className={`scene-card ${s.id === scene.id ? "scene-card-active" : ""}`}
              onClick={() => onScene(s.id)}
              title={`${s.description} (touche ${i + 1})`}
            >
              <span className="scene-name">{s.name}</span>
              <span className={`tag tag-${s.tag.toLowerCase()}`}>{s.tag}</span>
            </button>
          ))}
        </div>
        <p className="hint">{scene.description}</p>
      </section>

      <section>
        <div className="section-head">
          <h2>Réglages · {scene.name}</h2>
          <button className="link" onClick={onResetParams}>
            Réinitialiser
          </button>
        </div>
        {scene.params.map((def) => (
          <ParamControl key={def.key} def={def} value={params[def.key]} onChange={(v) => onParam(def.key, v)} />
        ))}
      </section>

      <section>
        <h2>Transitions</h2>
        <label className="field">
          <span className="field-head">
            <span>Style</span>
          </span>
          <select
            value={settings.transition}
            onChange={(e) => onSettings({ transition: e.target.value as TransitionId })}
          >
            {TRANSITIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {settings.transition !== "cut" && (
          <label className="field">
            <span className="field-head">
              <span>Durée</span>
              <span className="field-value">{settings.transitionTime.toFixed(1)} s</span>
            </span>
            <input
              type="range"
              min={0.2}
              max={4}
              step={0.1}
              value={settings.transitionTime}
              onChange={(e) => onSettings({ transitionTime: Number(e.target.value) })}
            />
          </label>
        )}
      </section>

      <section>
        <h2>Calque</h2>
        <label className="field">
          <span className="field-head">
            <span>Scène superposée</span>
          </span>
          <select
            value={settings.layer.sceneId ?? ""}
            onChange={(e) => onSettings({ layer: { ...settings.layer, sceneId: e.target.value || null } })}
          >
            <option value="">Aucune</option>
            {SCENES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {settings.layer.sceneId && (
          <>
            <label className="field">
              <span className="field-head">
                <span>Fusion</span>
              </span>
              <select
                value={settings.layer.mode}
                onChange={(e) => onSettings({ layer: { ...settings.layer, mode: e.target.value as BlendModeId } })}
              >
                {BLEND_MODES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-head">
                <span>Opacité</span>
                <span className="field-value">{settings.layer.opacity.toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.layer.opacity}
                onChange={(e) => onSettings({ layer: { ...settings.layer, opacity: Number(e.target.value) } })}
              />
            </label>
            <label className="field field-toggle">
              <span>Pulse au beat</span>
              <input
                type="checkbox"
                role="switch"
                checked={settings.layer.pulse}
                onChange={(e) => onSettings({ layer: { ...settings.layer, pulse: e.target.checked } })}
              />
            </label>
            <p className="hint">Ses réglages sont ceux de la scène : sélectionne-la pour les modifier.</p>
          </>
        )}
      </section>

      <section>
        <h2>Général</h2>
        <label className="field">
          <span className="field-head">
            <span>Sensibilité</span>
            <span className="field-value">{settings.sensitivity.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0.3}
            max={3}
            step={0.05}
            value={settings.sensitivity}
            onChange={(e) => onSettings({ sensitivity: Number(e.target.value) })}
          />
        </label>
        <label className="field field-toggle">
          <span>Enchaîner les scènes</span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.autoCycle}
            onChange={(e) => onSettings({ autoCycle: e.target.checked })}
          />
        </label>
        {settings.autoCycle && (
          <label className="field">
            <span className="field-head">
              <span>Toutes les</span>
              <span className="field-value">{settings.cycleSeconds} s</span>
            </span>
            <input
              type="range"
              min={5}
              max={120}
              step={5}
              value={settings.cycleSeconds}
              onChange={(e) => onSettings({ cycleSeconds: Number(e.target.value) })}
            />
          </label>
        )}
        <label className="field">
          <span className="field-head">
            <span>Qualité</span>
          </span>
          <select value={settings.quality} onChange={(e) => onSettings({ quality: e.target.value as Quality })}>
            <option value="auto">Auto (s&apos;adapte à la fluidité)</option>
            <option value="low">Basse (fluide)</option>
            <option value="normal">Normale</option>
            <option value="high">Haute (Retina)</option>
          </select>
        </label>
      </section>

      <section className="shortcuts">
        <h2>Raccourcis</h2>
        <p>
          <kbd>←</kbd> <kbd>→</kbd> scènes · <kbd>1</kbd>–<kbd>{SCENES.length}</kbd> accès direct · <kbd>F</kbd>{" "}
          plein écran · <kbd>H</kbd> masquer l&apos;interface
        </p>
      </section>
    </div>
  );
}
