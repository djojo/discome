import {
  Anton,
  Caveat_Brush,
  Cinzel,
  Fraunces,
  IM_Fell_English,
  JetBrains_Mono,
  Orbitron,
  Pirata_One,
  Playfair_Display,
  Press_Start_2P,
  Unbounded,
} from "next/font/google";

/*
 * The typefaces of the night's title: each world writes it in its own (part of its style). Served by the app itself
 * (next/font), nothing is asked of Google during the night; loaded only when a title is drawn (no preload).
 */
const playfair = Playfair_Display({ weight: "800", subsets: ["latin", "latin-ext"], preload: false });
const anton = Anton({ weight: "400", subsets: ["latin", "latin-ext"], preload: false });
const jetbrains = JetBrains_Mono({ weight: "800", subsets: ["latin", "latin-ext"], preload: false });
const cinzel = Cinzel({ weight: "800", subsets: ["latin", "latin-ext"], preload: false });
const unbounded = Unbounded({ weight: "800", subsets: ["latin", "latin-ext"], preload: false });
const caveat = Caveat_Brush({ weight: "400", subsets: ["latin", "latin-ext"], preload: false });
const pressStart = Press_Start_2P({ weight: "400", subsets: ["latin", "latin-ext"], preload: false });
const pirata = Pirata_One({ weight: "400", subsets: ["latin", "latin-ext"], preload: false });
const fraunces = Fraunces({ weight: "800", subsets: ["latin", "latin-ext"], preload: false });
const fell = IM_Fell_English({ weight: "400", subsets: ["latin"], preload: false });
const orbitron = Orbitron({ weight: "900", subsets: ["latin"], preload: false });

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
  /** An elegant display serif (the old Porcelaine world). */
  didone: { family: playfair.style.fontFamily, weight: "800", second: 0.5 },
  /** Monolithe: a heavy, narrow grotesque, spaced like an inscription. */
  monument: { family: anton.style.fontFamily, weight: "400", upper: true, spacing: 0.06, second: 0.42 },
  /** Signal: monospaced, data. */
  mono: { family: jetbrains.style.fontFamily, weight: "800", upper: true, spacing: 0.02, second: 0.45 },
  /** Bestiaire: Roman capitals, cut in stone like a museum's inscription. */
  roman: { family: cinzel.style.fontFamily, weight: "800", upper: true, spacing: 0.06, second: 0.45 },
  /** Mercure: wide and round, a shape liquid metal can hold. */
  liquid: { family: unbounded.style.fontFamily, weight: "800", spacing: 0.01, second: 0.45 },
  /** Canyon: a brush line, drawn by hand. */
  brush: { family: caveat.style.fontFamily, weight: "400", second: 0.55 },
  /** Arcanes: the pixels of an old game's title screen. */
  pixel: { family: pressStart.style.fontFamily, weight: "400", upper: true, spacing: 0.04, second: 0.5 },
  /** Cathédrale: gothic letters. */
  gothic: { family: pirata.style.fontFamily, weight: "400", spacing: 0.02, second: 0.5 },
  /** Chair: a soft, fleshy serif. */
  soft: { family: fraunces.style.fontFamily, weight: "800", second: 0.5 },
  /** Mycélium: the type of the old printed books, the first editions of the tales. */
  tale: { family: fell.style.fontFamily, weight: "400", spacing: 0.01, second: 0.5 },
  /** Circuit: wide, geometric capitals, the lettering of a race of the future. */
  race: { family: orbitron.style.fontFamily, weight: "900", upper: true, spacing: 0.08, second: 0.42 },
} satisfies Record<string, TitleFont>;

export type TitleFontId = keyof typeof TITLE_FONTS;

export const DEFAULT_TITLE_FONT: TitleFontId = "didone";

export const titleFont = (id: unknown): TitleFont =>
  TITLE_FONTS[(typeof id === "string" && id in TITLE_FONTS ? id : DEFAULT_TITLE_FONT) as TitleFontId];
