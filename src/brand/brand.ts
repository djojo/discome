/**
 * The night's own mark ("la soirée"): its name (and the DJ's) or its logo, shown by every world in its own style.
 * One self-contained block, so that it can later come from an account without the scenes knowing.
 */
export type BrandMode = "none" | "title" | "logo";

/** How often the director shows it: in every world, every other world, or also on some drops. */
export type BrandFrequency = "world" | "half" | "often";

export interface Brand {
  mode: BrandMode;
  /** First line: the night's name. */
  title: string;
  /** Optional second line, smaller: the DJ's name, a date… */
  subtitle: string;
  /** The logo's silhouette: a PNG, white shape on transparent, cropped (made by importLogo). */
  logo: string | null;
  frequency: BrandFrequency;
  /** Small mark in a corner of every scene. */
  signature: boolean;
}

export const TITLE_MAX = 30;

export const DEFAULT_BRAND: Brand = { mode: "none", title: "", subtitle: "", logo: null, frequency: "world", signature: false };

export const BRAND_FREQUENCIES: { id: BrandFrequency; label: string }[] = [
  { id: "world", label: "Une fois par monde" },
  { id: "half", label: "Un monde sur deux" },
  { id: "often", label: "Souvent (aussi sur des drops)" },
];

/** There is something to show. */
export const brandOn = (b: Brand) =>
  (b.mode === "title" && !!(b.title.trim() || b.subtitle.trim())) || (b.mode === "logo" && !!b.logo);

/** What the shapes depend on: they are rebuilt only when this changes. */
export const brandShapeKey = (b: Brand) =>
  !brandOn(b) ? "" : b.mode === "logo" ? `logo:${b.logo!.length}:${b.logo!.slice(-64)}` : `title:${b.title.trim()}\n${b.subtitle.trim()}`;

/** A saved brand merged over the defaults (fields added later, bad values). */
export function loadBrand(saved: unknown): Brand {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<Brand>;
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, TITLE_MAX) : "");
  return {
    mode: s.mode === "title" || s.mode === "logo" ? s.mode : "none",
    title: str(s.title),
    subtitle: str(s.subtitle),
    logo: typeof s.logo === "string" && s.logo.startsWith("data:image/png") ? s.logo : null,
    frequency: BRAND_FREQUENCIES.some((f) => f.id === s.frequency) ? s.frequency! : DEFAULT_BRAND.frequency,
    signature: s.signature === true,
  };
}
