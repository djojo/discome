"use client";

import { useEffect, useRef, useState } from "react";
import {
  BRAND_FREQUENCIES,
  BRAND_REMINDERS,
  brandOn,
  SIGNATURE_CORNERS,
  SIGNATURE_SIZES,
  TITLE_MAX,
  WORLD_SUBTITLE,
  type Brand,
  type BrandFrequency,
  type BrandMode,
} from "@/brand/brand";
import { analyzeLogo, importLogo, invertLogo, LogoError } from "@/brand/logo";
import { sculptedLogo } from "@/brand/shape";

const MODES: { id: BrandMode; label: string }[] = [
  { id: "world", label: "Monde" },
  { id: "title", label: "Titre" },
  { id: "logo", label: "Logo" },
  { id: "none", label: "Rien" },
];

interface Props {
  brand: Brand;
  onBrand: (patch: Partial<Brand>) => void;
  onError: (message: string) => void;
  /** Show the title now (not on the home screen: nothing plays yet). */
  onShowTitle?: () => void;
  /** Home screen: only what to show, not how often. */
  compact?: boolean;
}

/** « Ta soirée »: the night's name (and the DJ's) or its logo, that every world shows in its own style. */
export function BrandSettings({ brand, onBrand, onError, onShowTitle, compact }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const on = brandOn(brand);
  // the shape the worlds sculpt (its grooves included), for the preview
  const [sculpted, setSculpted] = useState<{ key: string; url: string | null } | null>(null);
  const shapeKey = brand.logo ? `${brand.logo.length}:${brand.logo.slice(-32)}:${brand.logoArt?.length ?? 0}` : "";
  useEffect(() => {
    if (!brand.logo) return;
    let alive = true;
    sculptedLogo(brand.logo, brand.logoArt)
      .catch(() => null)
      .then((url) => alive && setSculpted({ key: shapeKey, url }));
    return () => {
      alive = false;
    };
  }, [brand.logo, brand.logoArt, shapeKey]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const imp = await importLogo(file);
      onBrand({ logo: imp.logo, logoArt: imp.art, logoColors: imp.colors, logoTone: imp.tone, logoThin: imp.thin, mode: "logo" });
    } catch (e) {
      onError(e instanceof LogoError ? e.message : "Impossible de lire ce logo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="brand">
      <div className="mode-grid brand-modes">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`chip chip-center ${brand.mode === m.id ? "chip-active" : ""}`}
            onClick={() => (m.id === "logo" && !brand.logo ? fileRef.current?.click() : onBrand({ mode: m.id }))}
          >
            {m.label}
          </button>
        ))}
      </div>

      {brand.mode === "world" && (
        <p className="hint">
          Chaque monde affiche son nom, avec {WORLD_SUBTITLE} en dessous. Choisis « Titre » ou « Logo » pour ta soirée.
        </p>
      )}

      {brand.mode === "title" && (
        <div className="brand-fields">
          <input
            className="text-input"
            value={brand.title}
            maxLength={TITLE_MAX}
            placeholder="Nom de la soirée"
            aria-label="Nom de la soirée"
            onChange={(e) => onBrand({ title: e.target.value })}
          />
          <input
            className="text-input text-input-small"
            value={brand.subtitle}
            maxLength={TITLE_MAX}
            placeholder="Deuxième ligne (facultatif) : le DJ, la date…"
            aria-label="Deuxième ligne"
            onChange={(e) => onBrand({ subtitle: e.target.value })}
          />
        </div>
      )}

      {brand.mode === "logo" && (
        <div className="brand-logo">
          {brand.logo ? (
            <>
              <span className="brand-caption">La forme que sculptent les mondes</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing for next/image to optimise */}
              <img
                src={sculpted?.key === shapeKey && sculpted.url ? sculpted.url : brand.logo}
                alt="La forme que les mondes sculptent à partir de ton logo"
                className="brand-preview"
              />
              {!brand.logoArt && (
                <p className="hint brand-warn">
                  Ce logo a été enregistré avant que Discome sache garder les lettres posées sur une autre couleur :
                  réimporte-le (« Changer ») pour qu&apos;elles se lisent dans chaque monde.
                </p>
              )}
              {brand.logoThin && (
                <p className="hint brand-warn">
                  Certains traits sont très fins : de loin, ils risquent de disparaître. Une version plus épaisse de ton
                  logo passera mieux.
                </p>
              )}
            </>
          ) : (
            <p className="hint">Aucun logo pour l&apos;instant.</p>
          )}
          <div className="brand-logo-actions">
            <button className="chip" disabled={busy} onClick={() => fileRef.current?.click()}>
              {brand.logo ? "Changer" : "Importer"}
            </button>
            {brand.logo && (
              <button
                className="chip"
                disabled={busy}
                title="Si Discome a pris le fond pour la forme"
                onClick={async () => {
                  setBusy(true);
                  try {
                    const logo = await invertLogo(brand.logo!);
                    const seen = brand.logoArt ? await analyzeLogo(logo, brand.logoArt) : null;
                    onBrand({ logo, ...(seen ? { logoColors: seen.colors, logoTone: seen.tone, logoThin: seen.thin } : {}) });
                  } catch (e) {
                    onError(e instanceof LogoError ? e.message : "Impossible d'inverser ce logo.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Inverser
              </button>
            )}
          </div>
          <p className="hint">
            Discome garde sa silhouette, et ses couleurs pour tailler une rainure là où elles se touchent : chaque monde
            la sculpte dans sa matière. Idéal : un logo en aplat sur fond transparent (PNG ou SVG).
          </p>
        </div>
      )}

      {!compact && on && (
        <>
          <label className="field">
            <span className="field-head">
              <span>Fréquence</span>
            </span>
            <select value={brand.frequency} onChange={(e) => onBrand({ frequency: e.target.value as BrandFrequency })}>
              {BRAND_FREQUENCIES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-head">
              <span>Rappel</span>
            </span>
            <select value={brand.reminder} onChange={(e) => onBrand({ reminder: Number(e.target.value) })}>
              {BRAND_REMINDERS.map((r) => (
                <option key={r.minutes} value={r.minutes}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {brand.reminder > 0 && (
            <p className="hint">Le plan Titre du monde revient sur un moment calme, jamais pendant une montée ou un drop.</p>
          )}
          <label className="field field-toggle">
            <span>Signature dans un coin</span>
            <input
              type="checkbox"
              role="switch"
              checked={brand.signature}
              onChange={(e) => onBrand({ signature: e.target.checked })}
            />
          </label>
          {brand.signature && (
            <div className="brand-sig">
              <div className="mode-grid brand-sig-sizes" role="group" aria-label="Taille de la signature">
                {SIGNATURE_SIZES.map((z) => (
                  <button
                    key={z.id}
                    className={`chip chip-center ${brand.signatureSize === z.id ? "chip-active" : ""}`}
                    onClick={() => onBrand({ signatureSize: z.id })}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
              <div className="brand-sig-corners" role="group" aria-label="Coin de la signature">
                {SIGNATURE_CORNERS.map((c) => (
                  <button
                    key={c.id}
                    className={`chip brand-sig-corner brand-sig-${c.id} ${brand.signatureCorner === c.id ? "chip-active" : ""}`}
                    title={c.label}
                    aria-label={c.label}
                    onClick={() => onBrand({ signatureCorner: c.id })}
                  />
                ))}
              </div>
              <label className="field">
                <span className="field-head">
                  <span>Opacité</span>
                  <span>{Math.round(brand.signatureOpacity * 100)} %</span>
                </span>
                <input
                  type="range"
                  min={0.4}
                  max={1}
                  step={0.05}
                  value={brand.signatureOpacity}
                  onChange={(e) => onBrand({ signatureOpacity: Number(e.target.value) })}
                />
              </label>
            </div>
          )}
          {onShowTitle && (
            <button className="chip chip-center brand-now" onClick={onShowTitle}>
              Afficher maintenant <kbd>N</kbd>
            </button>
          )}
        </>
      )}
      {(brand.mode === "title" || brand.mode === "logo") && (
        <p className="hint">Tout reste dans ton navigateur : rien n&apos;est envoyé.</p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/svg+xml,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
