"use client";

import { useRef, useState } from "react";
import { BRAND_FREQUENCIES, brandOn, TITLE_MAX, type Brand, type BrandFrequency, type BrandMode } from "@/brand/brand";
import { importLogo, invertLogo, LogoError } from "@/brand/logo";

const MODES: { id: BrandMode; label: string }[] = [
  { id: "none", label: "Rien" },
  { id: "title", label: "Un titre" },
  { id: "logo", label: "Un logo" },
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

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onBrand({ logo: await importLogo(file), mode: "logo" });
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
            // eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing for next/image to optimise
            <img src={brand.logo} alt="La silhouette retenue pour ton logo" className="brand-preview" />
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
                    onBrand({ logo: await invertLogo(brand.logo!) });
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
            Discome garde la silhouette, chaque monde lui donne sa matière. Idéal : un logo en aplat sur fond transparent
            (PNG ou SVG).
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
          <label className="field field-toggle">
            <span>Signature dans un coin</span>
            <input
              type="checkbox"
              role="switch"
              checked={brand.signature}
              onChange={(e) => onBrand({ signature: e.target.checked })}
            />
          </label>
          {onShowTitle && (
            <button className="chip chip-center brand-now" onClick={onShowTitle}>
              Afficher maintenant <kbd>N</kbd>
            </button>
          )}
        </>
      )}
      {brand.mode !== "none" && <p className="hint">Tout reste dans ton navigateur : rien n&apos;est envoyé.</p>}

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
