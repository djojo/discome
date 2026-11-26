/**
 * The night's own mark ("la soirée"): its name (and the DJ's) or its logo, shown by every world in its own style.
 * One self-contained block, so that it can later come from an account without the scenes knowing.
 */
/** "world": each world shows its own name, with DISCOME under it (the default, and the free version's mark). */
export type BrandMode = "world" | "title" | "logo" | "none";

/** How often the director shows it: in every world, every other world, or also on some drops. */
export type BrandFrequency = "world" | "half" | "often";

export interface Brand {
  /** Version of the saved block (2: the world's name became the default). */
  v?: number;
  mode: BrandMode;
  /** First line: the night's name. */
  title: string;
  /** Optional second line, smaller: the DJ's name, a date… */
  subtitle: string;
  /** The logo's silhouette: a PNG, white shape on transparent, cropped (made by importLogo). */
  logo: string | null;
  /** The logo in its own colours, opaque, cropped like the silhouette: where two of them meet, the sculpted shape gets
   * a groove (null: a logo saved before they were kept: re-import it). */
  logoArt: string | null;
  /** Its leading colours, the most present first. */
  logoColors: string[];
  /** Mostly light or mostly dark (the halo under it is the other). */
  logoTone: "light" | "dark";
  /** Strokes so fine they may vanish at a distance. */
  logoThin: boolean;
  frequency: BrandFrequency;
  /** Small mark in a corner of every scene. */
  signature: boolean;
  /** Its size: small, medium, large (about 5, 7 and 10 % of the height). */
  signatureSize: SignatureSize;
  /** Its corner: bottom right, bottom left, top right, top left. */
  signatureCorner: SignatureCorner;
  /** Its opacity, 0.4 to 1. */
  signatureOpacity: number;
}

export type SignatureSize = "s" | "m" | "l";
export type SignatureCorner = "br" | "bl" | "tr" | "tl";
export const SIGNATURE_SIZES: { id: SignatureSize; label: string; h: number }[] = [
  { id: "s", label: "Petite", h: 0.05 },
  { id: "m", label: "Moyenne", h: 0.07 },
  { id: "l", label: "Grande", h: 0.1 },
];
export const SIGNATURE_CORNERS: { id: SignatureCorner; label: string }[] = [
  { id: "tl", label: "En haut à gauche" },
  { id: "tr", label: "En haut à droite" },
  { id: "bl", label: "En bas à gauche" },
  { id: "br", label: "En bas à droite" },
];

export const TITLE_MAX = 30;

/** The second line under a world's name. */
export const WORLD_SUBTITLE = "DISCOME";

export const DEFAULT_BRAND: Brand = {
  v: 2,
  mode: "world",
  title: "",
  subtitle: "",
  logo: null,
  logoArt: null,
  logoColors: [],
  logoTone: "light",
  logoThin: false,
  frequency: "world",
  signature: false,
  signatureSize: "m",
  signatureCorner: "br",
  signatureOpacity: 0.85,
};

export const BRAND_FREQUENCIES: { id: BrandFrequency; label: string }[] = [
  { id: "world", label: "Une fois par monde" },
  { id: "half", label: "Un monde sur deux" },
  { id: "often", label: "Souvent (aussi sur des drops)" },
];

/** There is something to show. */
export const brandOn = (b: Brand) =>
  b.mode === "world" || (b.mode === "title" && !!(b.title.trim() || b.subtitle.trim())) || (b.mode === "logo" && !!b.logo);

/** What the shapes depend on: they are rebuilt only when this changes. */
export const brandShapeKey = (b: Brand) =>
  !brandOn(b)
    ? ""
    : b.mode === "world"
      ? "world"
      : b.mode === "logo"
        ? `logo:${b.logo!.length}:${b.logo!.slice(-64)}:${b.logoArt?.length ?? 0}:${b.logoArt?.slice(-64) ?? ""}`
        : `title:${b.title.trim()}\n${b.subtitle.trim()}`;

/** A saved brand merged over the defaults (fields added later, bad values). */
export function loadBrand(saved: unknown): Brand {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<Brand>;
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, TITLE_MAX) : "");
  // Before v2 "none" was only the default, never a choice: such saves get the new default, the world's name
  const mode: BrandMode =
    s.mode === "title" || s.mode === "logo" || s.mode === "world" ? s.mode : s.mode === "none" && s.v === 2 ? "none" : "world";
  return {
    v: 2,
    mode,
    title: str(s.title),
    subtitle: str(s.subtitle),
    logo: typeof s.logo === "string" && s.logo.startsWith("data:image/png") ? s.logo : null,
    logoArt: typeof s.logo === "string" && typeof s.logoArt === "string" && s.logoArt.startsWith("data:image/png") ? s.logoArt : null,
    logoColors: Array.isArray(s.logoColors) ? s.logoColors.filter((c): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c)).slice(0, 4) : [],
    logoTone: s.logoTone === "dark" ? "dark" : "light",
    logoThin: s.logoThin === true,
    frequency: BRAND_FREQUENCIES.some((f) => f.id === s.frequency) ? s.frequency! : DEFAULT_BRAND.frequency,
    signature: s.signature === true,
    signatureSize: SIGNATURE_SIZES.some((z) => z.id === s.signatureSize) ? s.signatureSize! : DEFAULT_BRAND.signatureSize,
    signatureCorner: SIGNATURE_CORNERS.some((c) => c.id === s.signatureCorner) ? s.signatureCorner! : DEFAULT_BRAND.signatureCorner,
    signatureOpacity:
      typeof s.signatureOpacity === "number" && s.signatureOpacity >= 0.4 && s.signatureOpacity <= 1
        ? s.signatureOpacity
        : DEFAULT_BRAND.signatureOpacity,
  };
}
