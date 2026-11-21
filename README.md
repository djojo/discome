# Discome

Visualiseur audio psychédélique dans le navigateur : une entrée audio est analysée en temps réel (FFT) et pilote une bibliothèque de scènes 2D, shader et 3D.

```bash
npm install
npm run dev   # http://localhost:3000
```

## Sources audio

| Source | Comment | Remarques |
| --- | --- | --- |
| Micro / entrée | `getUserMedia` | Carte son, line-in, micro. Pas renvoyé vers les enceintes (pas de larsen). |
| Son d'un onglet | `getDisplayMedia` | Chrome/Edge : cocher « Partager l'audio » dans la fenêtre de partage. |
| Fichier | `<audio>` + `MediaElementSource` | Bouton ou glisser-déposer. |
| Démo | Synthé Web Audio | Boucle techno générée en direct, pratique pour tester. |

Pour visualiser le son du système sur macOS (Spotify app, etc.), passer par un périphérique virtuel type BlackHole et le choisir comme entrée micro.

## Architecture

```
src/
  lib/audio/AudioEngine.ts   Analyse : spectre, 64 bandes log, basses/médiums/aigus,
                             volume, détection de beat (flux spectral), auto-gain
  lib/audio/demoSource.ts    Boucle de démo synthétisée
  scenes/
    types.ts                 Contrat d'une scène + paramètres déclaratifs
    index.ts                 Bibliothèque (ordre = touches 1..9)
    palettes.ts              Palettes cosinus partagées JS + GLSL
    2d/                      Scènes Canvas 2D (Halo, Nébuleuse, Échos)
    shader/                  Shaders plein écran (Tunnel, Kaléidoscope)
    3d/                      Scènes three.js + bloom (Orbe, Spectro-terrain)
  components/
    Visualizer.tsx           Boucle de rendu, sources, raccourcis, HUD
    ControlPanel.tsx         Panneau généré à partir des paramètres des scènes
```

Chaque frame, `AudioEngine.update(dt)` remplit un `AudioFrame` (valeurs 0..1 normalisées) que la scène active reçoit dans `render(frame, params, dt)`. Utiles pour animer :

- `bass`, `mid`, `treble`, `volume` : niveaux lissés
- `bands` : 64 bandes logarithmiques (barres, terrains…)
- `waveform` : signal temporel (oscilloscopes)
- `beat` (vrai sur la frame du beat), `beatPulse` (1 → 0 après chaque beat)
- `energy` : « temps musical » qui avance plus vite quand la musique est forte

## Ajouter une scène

1. Créer un fichier dans `src/scenes/2d`, `shader` ou `3d`.
2. Exporter un `SceneDef` : `id`, `name`, `description`, `tag`, `params` et `create()`.
3. L'ajouter à `SCENES` dans `src/scenes/index.ts`.

Les `params` (range, toggle, select) génèrent automatiquement les contrôles du panneau et sont sauvegardés dans le navigateur.

Le plus rapide est un shader plein écran :

```ts
export const myScene = defineShaderScene({
  id: "my-scene",
  name: "Ma scène",
  description: "…",
  params: [paletteParam("acid")],
  fragment: /* glsl */ `
    void main() {
      vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
      float d = length(p) - 0.2 - 0.15 * uBass;
      gl_FragColor = vec4(pal(uTime * 0.1) * (1.0 - smoothstep(0.0, 0.02, abs(d))), 1.0);
    }
  `,
});
```

## Raccourcis

`←` `→` scènes · `1`–`7` accès direct · `F` plein écran · `H` masquer l'interface
