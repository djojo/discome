# Discome

Visualiseur audio psychédélique dans le navigateur, pensé comme un VJ automatique. Une entrée audio est analysée en temps réel ; elle pilote 10 scènes (2D, shader, 3D, humanoïdes), un réalisateur qui enchaîne les scènes en suivant la structure du morceau, et des esthétiques prêtes à l'emploi.

```bash
npm install
npm run dev   # http://localhost:3000
```

## Fonctionnalités

- **Sources** : micro / entrée, son d'un onglet, fichier (glisser-déposer), démo (un vrai morceau de 32 mesures, synthétisé en direct).
- **Horloge musicale** : BPM, temps, mesures et phrases de 8 mesures, plus un tap tempo.
- **Sections du morceau** : groove → breakdown → montée → drop, détectées automatiquement.
- **Réalisateur** (Manuel / Chill / Club / Rave) :
  - au breakdown, fondu long vers une scène calme ;
  - pendant la montée, de la tension (zoom pulsé, montée vers le blanc) ;
  - au drop, une transition d'impact, puis une rafale de coupes calées sur les temps ;
  - à chaque coupe, la palette et les réglages varient.
- **Transitions** : cut, fondu, punch, glitch, volet lumineux, iris, flash blanc.
- **Calque** : une 2e scène superposée, avec un mode de fusion, une opacité et une option « pulse au beat ».
- **Esthétiques** : Libre, Synthwave 84, Acid Rave, Techno Noir, Chrome Future, Cosmos, VHS Glitch. Tu peux aussi enregistrer tes propres looks.
- **Post-FX globaux** :
  - aberration chromatique, traînées, scanlines, CRT, VHS, grain ;
  - étalonnage, miroir / kaléidoscope, postérisation ;
  - strobo au drop, avec l'option « Limiter les flashs » pour la photosensibilité.

## Scènes

| # | Scène | Type | Énergie |
| --- | --- | --- | --- |
| 1 | Halo : spectre radial en mandala | 2D | medium |
| 2 | Kaléidoscope : fractale repliée | Shader | intense |
| 3 | Orbe : sphère de bruit, anneaux spectraux | 3D | medium |
| 4 | Tunnel : grille néon infinie | Shader | intense |
| 5 | Nébuleuse : particules en spirale | 2D | calm |
| 6 | Spectro-terrain : paysage synthwave | 3D | calm |
| 7 | Échos : oscilloscope en feedback | 2D | medium |
| 8 | Danseuse : hologramme / chrome / peau psychédélique, clones échos, solo / duo / cercle | 3D | medium |
| 9 | Androïde : casque chrome, visière LED (spectre, onde, texte) | 3D | medium |
| 0 | Corps de particules : la danseuse en nuage de points, explose au drop | 3D | intense |

## Raccourcis

| Touche | Action |
| --- | --- |
| `←` `→`, `1`–`9`, `0` | Changer de scène |
| `Espace` | Drop manuel (impact + rafale, recale la mesure) |
| `T` | Tap tempo |
| `L` | Verrouiller la scène |
| `D` | Panneau de debug (BPM, mesure, section, tension) |
| `F` | Plein écran |
| `H` | Masquer l'interface |

## Architecture

```
src/
  lib/audio/
    AudioEngine.ts       Analyse FFT : bandes, niveaux, beats (kick), attaques, auto-gain
    MusicAnalyzer.ts     BPM, horloge calée en phase, sections (breakdown/montée/drop)
    demoSource.ts        Morceau de démo synthétisé
  engine/
    Compositor.ts        Rend chaque scène hors écran puis les mélange (transitions, calque, post-FX)
    compositorShader.ts  Passe finale GLSL
    Director.ts          Réalisateur automatique
    transitions.ts, fx.ts
  looks/index.ts         Esthétiques (scènes pondérées, palettes, effets, rythme)
  scenes/
    types.ts             Contrat d'une scène + paramètres déclaratifs
    2d/  shader/  3d/    Scènes ; 3d/humanoid/ : danseuse, androïde, particules
  components/            Visualizer (boucle, sources, HUD), ControlPanel, settings
public/models/           Michelle.glb (personnage Mixamo des exemples three.js)
```

À chaque frame, `AudioEngine.update(dt)` remplit un `AudioFrame` que les scènes reçoivent dans `render(frame, params, dt)`. Ce frame contient :
- les niveaux 0..1 (`bass`, `mid`, `treble`, `volume`), `bands` et `waveform` ;
- les événements `beat` et `beatPulse` ;
- l'horloge (`bpm`, `beatPhase`, `tick`, `downbeat`, `bar`, `phraseBar`) ;
- la structure (`section`, `drop`, `buildProgress`) ;
- `energy`, un « temps musical » qui avance plus vite quand la musique est forte.

## Ajouter une scène

1. Créer un fichier dans `src/scenes/2d`, `shader` ou `3d`.
2. Exporter un `SceneDef` avec `id`, `name`, `description`, `tag`, `energy`, `params` et `create()`. Les scènes WebGL rendent dans la `target` fournie (ou exposent `output()`).
3. L'ajouter à `SCENES` dans `src/scenes/index.ts`, et éventuellement à des looks dans `src/looks/index.ts`.

Les `params` (range, toggle, select) génèrent automatiquement les contrôles du panneau et sont sauvegardés dans le navigateur.

Le plus rapide est un shader plein écran :

```ts
export const myScene = defineShaderScene({
  id: "my-scene",
  name: "Ma scène",
  description: "…",
  energy: "medium",
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

## Sources audio

| Source | Comment | Remarques |
| --- | --- | --- |
| Micro / entrée | `getUserMedia` | Carte son, line-in, micro. Pas renvoyé vers les enceintes (pas de larsen). |
| Son d'un onglet | `getDisplayMedia` | Chrome/Edge : cocher « Partager l'audio » dans la fenêtre de partage. |
| Fichier | `<audio>` + `MediaElementSource` | Bouton ou glisser-déposer. |
| Démo | Synthé Web Audio | Morceau structuré (groove, breakdown, montée, drop) pour tester le réalisateur. |

Pour visualiser le son du système sur macOS (Spotify app, etc.), passer par un périphérique virtuel type BlackHole et le choisir comme entrée micro.
