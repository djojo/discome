# Discome

Visualiseur audio psychédélique dans le navigateur, pensé comme un VJ automatique. Une entrée audio est analysée en temps réel ; elle pilote une vingtaine de scènes (2D, shader, 3D, humanoïdes, raymarching), un réalisateur qui enchaîne les scènes en suivant la structure du morceau, et des esthétiques prêtes à l'emploi.

```bash
npm install
npm run dev   # http://localhost:3000
```

## Fonctionnalités

- **Sources** : micro / entrée, son d'un onglet, fichier (glisser-déposer), démo (un morceau de 32 mesures synthétisé en direct).
- **Horloge musicale** : BPM, temps, mesures et phrases de 8 mesures, avec tap tempo. Les sections (groove → breakdown → montée → drop) sont détectées automatiquement.
- **Mondes** : Porcelaine, Signal, Mercure, Cathédrale, Monolithe, Canyon, Chair, et Classique (les premières scènes).
  - Un monde est une direction artistique complète : une sélection de plans (une scène du catalogue et ses réglages pour ce monde), des palettes, des post-effets, des transitions et un rythme de réalisation.
  - Une même scène est réutilisée d'un monde à l'autre avec d'autres réglages : Cathédrale en rouge ou en blanc, Profil en ivoire ou en argent…
  - **Enchaîner les mondes** : ils se succèdent, au breakdown (et au moins toutes les 8 phrases) ou toutes les 4 ou 8 phrases. Le passage se fait par le noir, et les effets glissent vers ceux du nouveau monde.
- **Vol** : Monolithe, Cathédrale et Canyon sont des travellings. Leur vitesse suit la structure du morceau, avec de l'inertie :

  | Moment | Vitesse |
  | --- | --- |
  | Groove | Croisière, une poussée à chaque kick |
  | Breakdown | On plane (×0,25), au ras du sol |
  | Montée | Accélération jusqu'à ×3, la caméra s'élève |
  | Drop | Boost ×6 et décollage, puis retour à ×1,8 en deux mesures |

  - À chaque phrase, une figure : croisière, slalom, piqué, remontée, tonneau.
  - Le champ de vision s'ouvre avec la vitesse, et le compositeur ajoute un flou de vitesse radial.
  - Réglages par scène : « Vitesse de croisière » et « Dynamique » (0 = vitesse constante).
- **Fonds** : les premières scènes (Nébuleuse, Halo, Échos, Tunnel, Orbe, Spectro-terrain, Kaléidoscope, Corps de particules) servent de fonds aux mondes.
  - Elles sont rendues en basse résolution, floutées et teintées dans la palette du monde.
  - Elles n'apparaissent que dans les zones sombres de la scène principale, jamais à l'intérieur de son sujet : les scènes de visages et d'architecture transmettent leur silhouette au compositeur.
  - Le réalisateur change de fond toutes les 3 phrases, ou au drop. Il le rend plus présent en breakdown et le fait pulser pendant les rafales.
  - On peut aussi choisir le fond à la main dans la section « Fond ».
  - Le monde Classique garde ces scènes en plein écran, avec leurs couleurs d'origine.
- **Palettes** : 2 à 4 couleurs par palette, avec des rôles fixes (fond, encre, accent) au lieu d'arcs-en-ciel. Les scènes s'en servent pour se recolorer selon le monde.
- **Réalisateur** (Manuel / Chill / Club / Rave) : fondu au breakdown, tension pendant la montée, impact et rafale de coupes au drop, variation des réglages à chaque coupe.
- **Transitions** : cut, fondu, punch, glitch, volet lumineux, iris, flash blanc, passage au noir.
- **Calque** : une 2e scène superposée, avec mode de fusion, opacité et option « pulse au beat ».
- **Post-FX** : aberration chromatique, traînées, flou de vitesse, scanlines, CRT, VHS, grain, étalonnage, miroir, postérisation, strobo (option « Limiter les flashs »).

## Scènes

**Direction artistique** (`src/scenes/art/`, shaders en raymarching) :

| Scène | Ce qu'on voit | Au drop |
| --- | --- | --- |
| Porcelaine | Visage de céramique fendu par une lumière intérieure, format 2.39 | Le masque s'ouvre |
| Topographie | Le visage dessiné uniquement par des lignes de niveau | Les lignes basculent en profondeur |
| Profil | Seul le contour du profil, éclairé à contre-jour | Un contour d'accent s'allume |
| Trame | Visage en demi-teinte de sérigraphie | Inversion |
| Mercure | Masque chromé qui émerge d'un bain de métal liquide | Le bain se soulève |
| Cathédrale | Nef d'arches lumineuses, sol miroir, brume ; la forme des arches change à chaque phrase | Vitesse lumière : les arches s'étirent en traînées |
| Monolithe | Avenue brutaliste en béton banché, soleil rasant, poussière, monolithe à l'horizon | Décollage au-dessus des toits, le soleil change de côté |
| Gorge | Vol dans une gorge étroite aux parois ondulées, strates colorées, rais de lumière | On sort de la fente, les couleurs des strates basculent |
| Mesas | Vol au ras d'une rivière miroir entre des falaises en gradins, soleil en anneau | On monte au-dessus des mesas |
| Chair | Matière organique translucide et nacrée | Contraction |
| Signal | Données en deux couleurs : codes-barres, balayage, onde | Inversion |

**Classiques**, recolorées par les palettes des mondes : Halo, Kaléidoscope, Orbe, Tunnel, Nébuleuse, Spectro-terrain, Échos, Danseuse, Androïde, Corps de particules.

## Raccourcis

| Touche | Action |
| --- | --- |
| `←` `→`, `1`–`9` | Changer de plan dans le monde courant |
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
  looks/index.ts         Mondes (plans = scène + réglages, palettes, effets, rythme)
  scenes/
    types.ts             Contrat d'une scène + paramètres déclaratifs
    art/                 Scènes de direction artistique (visages, Mercure, Cathédrale…)
    art/flight.ts        Vol partagé des travellings (vitesse selon la structure, figures, roulis)
    2d/  shader/  3d/    Scènes classiques ; 3d/humanoid/ : danseuse, androïde, particules
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
