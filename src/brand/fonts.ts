import { Anton, JetBrains_Mono, Playfair_Display } from "next/font/google";

/*
 * The typefaces of the night's title: each world writes it in its own (part of its style). Served by the app itself
 * (next/font), nothing is asked of Google during the night; loaded only when a title is drawn (no preload).
 */
const playfair = Playfair_Display({ weight: "800", subsets: ["latin", "latin-ext"], preload: false });
const anton = Anton({ weight: "400", subsets: ["latin", "latin-ext"], preload: false });
const jetbrains = JetBrains_Mono({ weight: "800", subsets: ["latin", "latin-ext"], preload: false });

export interface TitleFont {
  /** CSS font-family, as next/font named it. */
  family: string;
  weight: string;
  /** Written in capitals. */
  upper?: boolean;
  /** Letter spacing, in em. */
  spacing?: number;
  /** Second line's size, relative to the first. */
  second?: number;
}

export const TITLE_FONTS = {
  /** Porcelaine: an elegant display serif. */
  didone: { family: playfair.style.fontFamily, weight: "800", second: 0.5 },
  /** Monolithe: a heavy, narrow grotesque, spaced like an inscription. */
  monument: { family: anton.style.fontFamily, weight: "400", upper: true, spacing: 0.06, second: 0.42 },
  /** Signal: monospaced, data. */
  mono: { family: jetbrains.style.fontFamily, weight: "800", upper: true, spacing: 0.02, second: 0.45 },
} satisfies Record<string, TitleFont>;

export type TitleFontId = keyof typeof TITLE_FONTS;

export const DEFAULT_TITLE_FONT: TitleFontId = "didone";

export const titleFont = (id: unknown): TitleFont =>
  TITLE_FONTS[(typeof id === "string" && id in TITLE_FONTS ? id : DEFAULT_TITLE_FONT) as TitleFontId];
