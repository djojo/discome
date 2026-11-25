// Lets Node run the app's TypeScript outside Next (scripts/rehearse.ts): "@/…" → src/…, and extensionless
// relative imports → .ts (or /index.ts). Use: node --experimental-transform-types --import ./scripts/ts-register.mjs …
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

function withTs(p) {
  for (const c of [p, `${p}.ts`, `${p}.tsx`, path.join(p, "index.ts")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const FONT_STUB = "discome-stub:next-font-google";

export async function resolve(specifier, context, next) {
  // next/font only works inside Next: a stub with the same names (the fonts are never drawn here)
  if (specifier === "next/font/google") return { url: FONT_STUB, shortCircuit: true };
  let target = null;
  if (specifier.startsWith("@/")) target = withTs(path.join(SRC, specifier.slice(2)));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const base = path.dirname(fileURLToPath(context.parentURL));
    // (an extensionless import, or one like "./lib.glsl" for lib.glsl.ts)
    const full = path.resolve(base, specifier);
    if (!(existsSync(full) && statSync(full).isFile())) target = withTs(full);
  }
  if (target) return next(pathToFileURL(target).href, context);
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url !== FONT_STUB) return next(url, context);
  const src = readFileSync(path.join(SRC, "brand/fonts.ts"), "utf8");
  const names = (src.match(/import\s*\{([^}]*)\}\s*from\s*"next\/font\/google"/)?.[1] ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  const body = ['const font = () => ({ className: "", variable: "", style: { fontFamily: "sans-serif" } });']
    .concat(names.map((n) => `export const ${n} = font;`))
    .join("\n");
  return { format: "module", source: body, shortCircuit: true };
}
