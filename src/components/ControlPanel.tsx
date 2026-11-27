"use client";

import type { SourceKind } from "@/lib/audio/AudioEngine";
import { SCENES, type ParamValue, type ParamValues, type SceneDef } from "@/scenes";
import { ParamControl } from "./ParamControl";
import { BLEND_MODES, TRANSITIONS, type BlendModeId, type TransitionId } from "@/engine/transitions";
import { DIRECTOR_MODES } from "@/engine/Director";
import { FX_SLIDERS, MIRROR_OPTIONS, STROBE_OPTIONS, type FxSettings, type StrobeMode } from "@/engine/fx";
import {
  activeWorlds,
  allLooks,
  DRIFT_OPTIONS,
  findLook,
  rotationOrder,
  WORLD_RULES,
  type Quality,
  type Settings,
  type WorldRule,
} from "./settings";
import { lookBackgrounds, shownPlans, type Plan } from "@/looks";
import { brandOn, type Brand } from "@/brand/brand";
import { BrandSettings } from "./BrandSettings";

export const SOURCE_LABELS: Record<SourceKind, string> = {
  mic: "Micro / entrée",
  tab: "Son d'un onglet",
  file: "Fichier",
  demo: "Démo",
  youtube: "Set YouTube",
};

interface Props {
  scene: SceneDef;
  /** Name of what is on screen: « Olympe · Éclats » for a world plan, the scene's name otherwise. */
  planLabel: string;
  params: ParamValues;
  settings: Settings;
  source: SourceKind | null;
  busy: boolean;
  onScene: (id: string) => void;
  onParam: (key: string, value: ParamValue) => void;
  onResetParams: () => void;
  onSettings: (patch: Partial<Settings>) => void;
  onSource: (kind: SourceKind) => void;
  onTap: () => void;
  onDrop: () => void;
  onLook: (id: string) => void;
  /** Put a world in or out of the rotation. */
  onToggleWorld: (id: string) => void;
  onSaveLook: () => void;
  onDeleteLook: (id: string) => void;
  onFx: (patch: Partial<FxSettings>) => void;
  onResetFx: () => void;
  onBrand: (patch: Partial<Brand>) => void;
  onShowTitle: () => void;
  onError: (message: string) => void;
}

function SceneButton({
  s,
  active,
  hotkey,
  onScene,
}: {
  s: SceneDef;
  active: boolean;
  hotkey?: number;
  onScene: (id: string) => void;
}) {
  return (
    <button
      className={`scene-card ${active ? "scene-card-active" : ""}`}
      onClick={() => onScene(s.id)}
      title={hotkey ? `${s.description} (touche ${hotkey})` : s.description}
    >
      <span className="scene-name">{s.name}</span>
      <span className={`tag tag-${s.tag.toLowerCase()}`}>{s.tag}</span>
    </button>
  );
}

/** A plan of the current world: the scene with this world's settings. */
function PlanButton({ p, active, hotkey, onScene }: { p: Plan; active: boolean; hotkey?: number; onScene: (id: string) => void }) {
  return (
    <button
      className={`scene-card ${active ? "scene-card-active" : ""}`}
      onClick={() => onScene(p.key)}
      title={hotkey ? `${p.scene.description} (touche ${hotkey})` : p.scene.description}
    >
      <span className="scene-name">{p.label}</span>
      <span className={`tag tag-${p.scene.tag.toLowerCase()}`}>{p.scene.tag}</span>
    </button>
  );
}

export function ControlPanel({
  scene,
  planLabel,
  params,
  settings,
  source,
  busy,
  onScene,
  onParam,
  onResetParams,
  onSettings,
  onSource,
  onTap,
  onDrop,
  onLook,
  onToggleWorld,
  onSaveLook,
  onDeleteLook,
  onFx,
  onResetFx,
  onBrand,
  onShowTitle,
  onError,
}: Props) {
  const mode = DIRECTOR_MODES.find((m) => m.id === settings.director) ?? DIRECTOR_MODES[0];
  const plans = shownPlans(findLook(settings), brandOn(settings.brand));
  const otherScenes = SCENES.filter((x) => !plans.some((p) => p.scene.id === x.id));
  const worldBackgrounds = lookBackgrounds(findLook(settings))
    .map((e) => SCENES.find((x) => x.id === e.id)!)
    .filter(Boolean);
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
        <div className="section-head">
          <h2>Mondes</h2>
          <button className="link" onClick={onSaveLook} title="Garde les post-effets actuels dans un nouveau monde">
            Enregistrer mon monde
          </button>
        </div>
        <div className="look-grid">
          {allLooks(settings).map((l) => {
            const inRotation = rotationOrder(settings).includes(l.id);
            const on = !settings.offWorlds.includes(l.id);
            const last = on && activeWorlds(settings).length <= 1;
            return (
            <div key={l.id} className="look-wrap">
              <button
                className={`look-card ${settings.lookId === l.id ? "look-card-active" : ""} ${inRotation && !on ? "look-card-off" : ""}`}
                onClick={() => onLook(l.id)}
                title={l.description}
              >
                <span className="look-swatch" style={{ background: `linear-gradient(120deg, ${l.swatch.join(", ")})` }} />
                <span className="look-name">{l.name}</span>
              </button>
              {inRotation && (
                <input
                  type="checkbox"
                  role="switch"
                  className="look-toggle"
                  checked={on}
                  disabled={last}
                  onChange={() => onToggleWorld(l.id)}
                  aria-label={`${l.name} dans la rotation`}
                  title={last ? "Il faut au moins un monde dans la rotation" : on ? "Dans la rotation" : "Hors rotation"}
                />
              )}
              {l.custom && (
                <button className="look-delete" onClick={() => onDeleteLook(l.id)} aria-label={`Supprimer ${l.name}`}>
                  ×
                </button>
              )}
            </div>
            );
          })}
        </div>
        <p className="hint">{findLook(settings).description}</p>
        <label className="field field-toggle">
          <span>Enchaîner les mondes</span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.worldCycle.enabled}
            onChange={(e) => onSettings({ worldCycle: { ...settings.worldCycle, enabled: e.target.checked } })}
          />
        </label>
        <label className="field">
          <span className="field-head">
            <span>Dérive de la soirée</span>
          </span>
          <select value={settings.drift} onChange={(e) => onSettings({ drift: Number(e.target.value) })}>
            {DRIFT_OPTIONS.map((o) => (
              <option key={o.minutes} value={o.minutes}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {settings.worldCycle.enabled && (
          <label className="field">
            <span className="field-head">
              <span>Changer de monde</span>
            </span>
            <select
              value={settings.worldCycle.rule}
              onChange={(e) =>
                onSettings({ worldCycle: { ...settings.worldCycle, rule: e.target.value as WorldRule } })
              }
            >
              {WORLD_RULES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section>
        <h2>Ta soirée</h2>
        <p className="hint">Le nom de la soirée, celui du DJ ou ton logo : chaque monde l&apos;affiche dans son style.</p>
        <BrandSettings brand={settings.brand} onBrand={onBrand} onError={onError} onShowTitle={onShowTitle} />
      </section>

      <section>
        <h2>Réalisateur</h2>
        <div className="mode-grid">
          {DIRECTOR_MODES.map((m) => (
            <button
              key={m.id}
              className={`chip chip-center ${settings.director === m.id ? "chip-active" : ""}`}
              onClick={() => onSettings({ director: m.id })}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="hint">{mode.hint}</p>
        <div className="action-row">
          <button className="chip chip-center" onClick={onTap} title="Tape en rythme (touche T)">
            Tap tempo
          </button>
          <button className="chip chip-center chip-hot" onClick={onDrop} title="Déclenche un drop (Espace)">
            Drop !
          </button>
        </div>
        <label className="field field-toggle">
          <span>Varier couleurs et réglages</span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.vary}
            onChange={(e) => onSettings({ vary: e.target.checked })}
          />
        </label>
        <label className="field field-toggle">
          <span>Verrouiller la scène</span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.locked}
            onChange={(e) => onSettings({ locked: e.target.checked })}
          />
        </label>
      </section>

      <section>
        <h2>Plans de ce monde</h2>
        <div className="scene-grid">
          {plans.map((p, i) => (
            <PlanButton key={p.key} p={p} active={p.key === settings.sceneId} hotkey={i < 9 ? i + 1 : undefined} onScene={onScene} />
          ))}
        </div>
        <p className="hint">{scene.description}</p>
        <details className="catalogue">
          <summary className="link">Tout le catalogue ({SCENES.length} scènes)</summary>
          <div className="scene-grid">
            {otherScenes.map((s) => (
              <SceneButton key={s.id} s={s} active={s.id === settings.sceneId} onScene={onScene} />
            ))}
          </div>
        </details>
      </section>

      <section>
        <div className="section-head">
          <h2>Réglages · {planLabel}</h2>
          <button className="link" onClick={onResetParams} title="Revenir aux réglages de ce plan dans ce monde">
            Réinitialiser le plan
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
        <h2>Fond</h2>
        <label className="field field-toggle">
          <span>Choisi par le réalisateur</span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.background.auto}
            onChange={(e) => onSettings({ background: { ...settings.background, auto: e.target.checked } })}
          />
        </label>
        <label className="field">
          <span className="field-head">
            <span>Scène de fond</span>
          </span>
          <select
            value={settings.background.sceneId ?? ""}
            onChange={(e) =>
              onSettings({ background: { ...settings.background, auto: false, sceneId: e.target.value || null } })
            }
          >
            <option value="">Aucune</option>
            <optgroup label="Fonds de ce monde">
              {worldBackgrounds.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Tout le catalogue">
              {SCENES.filter((x) => !worldBackgrounds.includes(x)).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {settings.background.sceneId && (
          <>
            <label className="field">
              <span className="field-head">
                <span>Présence</span>
                <span className="field-value">{settings.background.opacity.toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.background.opacity}
                onChange={(e) =>
                  onSettings({ background: { ...settings.background, opacity: Number(e.target.value) } })
                }
              />
            </label>
            <label className="field">
              <span className="field-head">
                <span>Flou</span>
                <span className="field-value">{settings.background.blur.toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.background.blur}
                onChange={(e) => onSettings({ background: { ...settings.background, blur: Number(e.target.value) } })}
              />
            </label>
            <label className="field field-toggle">
              <span>Teinte du monde</span>
              <input
                type="checkbox"
                role="switch"
                checked={settings.background.tint}
                onChange={(e) => onSettings({ background: { ...settings.background, tint: e.target.checked } })}
              />
            </label>
          </>
        )}
        <p className="hint">Le fond n&apos;apparaît que dans les zones sombres de la scène principale.</p>
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
        <details className="fx-details">
          <summary>
            <h2>Post-FX</h2>
          </summary>
          <div className="section-head fx-head">
            <span className="hint">Effets globaux, par-dessus toutes les scènes.</span>
            <button className="link" onClick={onResetFx}>
              Réinitialiser
            </button>
          </div>
          {FX_SLIDERS.map((d) => (
            <label key={d.key} className="field">
              <span className="field-head">
                <span>{d.label}</span>
                <span className="field-value">{settings.fx[d.key].toFixed(d.step >= 1 ? 0 : 2)}</span>
              </span>
              <input
                type="range"
                min={d.min}
                max={d.max}
                step={d.step}
                value={settings.fx[d.key]}
                onChange={(e) => onFx({ [d.key]: Number(e.target.value) })}
              />
            </label>
          ))}
          <label className="field field-toggle">
            <span>Pixel et VHS seulement sur les temps forts</span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.fx.retroOnHits}
              onChange={(e) => onFx({ retroOnHits: e.target.checked })}
            />
          </label>
          <label className="field">
            <span className="field-head">
              <span>Miroir global</span>
            </span>
            <select value={settings.fx.mirror} onChange={(e) => onFx({ mirror: Number(e.target.value) })}>
              {MIRROR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-head">
              <span>Stroboscope au drop</span>
            </span>
            <select value={settings.fx.strobe} onChange={(e) => onFx({ strobe: e.target.value as StrobeMode })}>
              {STROBE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </details>
      </section>

      <section>
        <h2>Général</h2>
        <label className="field field-toggle">
          <span>Limiter les flashs (photosensibilité)</span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.safeFlash}
            onChange={(e) => onSettings({ safeFlash: e.target.checked })}
          />
        </label>
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
        <label className="field">
          <span className="field-head">
            <span>Qualité</span>
          </span>
          <select value={settings.quality} onChange={(e) => onSettings({ quality: e.target.value as Quality })}>
            <option value="auto">Auto (s&apos;adapte à la fluidité)</option>
            <option value="low">Basse (fluide)</option>
            <option value="normal">Normale</option>
            <option value="high">Haute (Retina)</option>
            <option value="ultra">Ultra (pleine résolution)</option>
          </select>
        </label>
      </section>

      <section className="shortcuts">
        <h2>Raccourcis</h2>
        <p>
          <kbd>←</kbd> <kbd>→</kbd> scènes · <kbd>1</kbd>–<kbd>9</kbd> plans du monde ·{" "}
          <kbd>Espace</kbd> drop · <kbd>T</kbd> tap tempo · <kbd>L</kbd> verrouiller · <kbd>F</kbd> plein écran ·{" "}
          <kbd>H</kbd> masquer l&apos;interface · <kbd>D</kbd> debug
        </p>
      </section>
    </div>
  );
}
