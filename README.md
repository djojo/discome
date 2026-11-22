# Discome

Visualiseur audio psychédélique dans le navigateur, pensé comme un VJ automatique. Une entrée audio est analysée en temps réel ; elle pilote une vingtaine de scènes (2D, shader, 3D, humanoïdes, raymarching), un réalisateur qui enchaîne les scènes en suivant la structure du morceau, et des esthétiques prêtes à l'emploi.

```bash
npm install
npm run dev   # http://localhost:3000
```

## Fonctionnalités

- **Sources** : micro / entrée, son d'un onglet, fichier (glisser-déposer), démo (un morceau de 32 mesures synthétisé en direct).
- **Horloge musicale** : BPM, temps, mesures et phrases de 8 mesures, avec tap tempo. Les sections (groove → breakdown → montée → drop) sont détectées automatiquement.
- **Mondes** : Porcelaine, Signal, Mercure, Cathédrale, Monolithe, Canyon, Arcanes, Chair, Bestiaire, et Classique (les premières scènes).
  - **Le propos, sans un mot** : chaque monde garde son thème et dénonce, par les images et le montage seulement, une dérive d'aujourd'hui : les écrans et l'attention (Cathédrale, Signal, Porcelaine), la surveillance (Monolithe, Signal), l'argent et la consommation (Mercure), le vivant (Canyon, Chair, Bestiaire).
  - **La dérive de la soirée** : réglable sur 30 min, 1 h ou 1 h 30 à partir du lancement de la source. Les mondes se dégradent lentement : l'eau monte dans l'avenue du Monolithe, les caméras et les écrans s'y multiplient, la rivière du Canyon s'assèche, la créature de Chair blanchit comme un corail, la nef de la Cathédrale devient une nef d'écrans, le Flux défile de plus en plus vite.
  - **Le récit** : chaque plan a un rôle (calme, montée, drop ou « après »). Les plans « après » (les ruines, le silence) sont réservés aux breakdowns. Quand les mondes s'enchaînent, la rotation alterne nature et machine.
  - Un monde est une direction artistique complète : une sélection de plans (une scène du catalogue et ses réglages pour ce monde), des palettes, des post-effets, des transitions et un rythme de réalisation.
  - **Les plans** : une même scène peut apparaître plusieurs fois, dans un monde ou d'un monde à l'autre, avec d'autres réglages (Porcelaine « Coquille » et « Éclats », Cathédrale « Rouge » et « Blanche », Profil chrome ou béton…). Chaque plan a sa propre instance, son rôle pour le réalisateur (calme, montée, drop) et ses limites de variation.
  - Tes retouches sont gardées par plan et par monde ; « Réinitialiser le plan » revient aux réglages du monde.
  - **Enchaîner les mondes** : ils se succèdent, au breakdown (et au moins toutes les 8 phrases) ou toutes les 4 ou 8 phrases. Le passage se fait par le noir, et les effets glissent vers ceux du nouveau monde.
- **Têtes** : les scènes de visage (Porcelaine, Topographie, Profil, Trame, Mercure, Métamorphose), l'Architecte et le Colosse du Monolithe ont un réglage « Tête » :
  - humain (la tête sculptée en code), tigre, loup, faucon, lion, hibou, bélier, Moai, Néfertiti ;
  - ce sont des bustes gratuits de Printables (crédits dans `public/heads/CREDITS.md`), convertis une fois en grilles de distances par `scripts/bake-heads.mjs`, donc tous les effets marchent avec toutes les têtes ;
  - un plan peut tirer une autre tête à chaque retour (`vary.choices`). Toutes les têtes se chargent en arrière-plan au démarrage.
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
- **Transitions** : cut, fondu, punch, glitch, volet lumineux, iris, flash blanc, passage au noir, plongée dans la fissure (on entre dans une fente de lumière et on ressort dans la scène suivante), plongée dans l'écran (un petit rectangle lumineux s'allume au milieu de l'image, on plonge dedans).
- **Calque** : une 2e scène superposée, avec mode de fusion, opacité et option « pulse au beat ». Un monde peut poser son propre calque (Arcanes pose le Grimoire), retiré en quittant le monde.
- **Post-FX** : aberration chromatique, traînées, flou de vitesse, pixel (tramage), scanlines, CRT, VHS, grain, étalonnage, miroir, postérisation, strobo (option « Limiter les flashs »).

## Scènes

**Direction artistique** (`src/scenes/art/`, shaders en raymarching) :

| Scène | Ce qu'on voit | Au drop |
| --- | --- | --- |
| Porcelaine | Visage de céramique immobile, fissures d'or kintsugi qui se propagent sur plusieurs minutes ; option viseur de téléphone (Selfie) | La tête s'ouvre en coquille ou se brise en éclats flottants (en alternance) sur une agate, une géode et un cœur fractal ; elle se referme au breakdown |
| Métamorphose | Buste de musée en marbre ou en obsidienne qui se transforme lentement d'une tête en une autre, du cou vers le sommet ; la couture d'or du front flashe au kick ; cycle Extinction (chaque drop pétrifie un animal qui ne revient pas, jusqu'à la tête humaine seule) | La transformation démarre ou s'accélère, la couture s'embrase et lâche des étincelles |
| Topographie | Le visage dessiné par des lignes de niveau qui changent lentement d'orientation ; une ligne de lumière le traverse à chaque kick ; option Reconnaissance faciale (points, maillage, cadre, balayage) | Les lignes basculent en profondeur |
| Profil | Le profil en contre-jour, brume et rais de lumière ; le contour s'allume en vague à chaque kick | Un contour d'accent s'allume |
| Trame | Trois trames de couleur, chacune éclairée d'un côté, qui tournent lentement | Inversion |
| Mercure | Masque chromé dans un bain de métal liquide, une courbe de cotations à l'horizon ; le masque s'enfonce à mesure qu'elle monte ; chaque kick lance un anneau | La courbe s'effondre, une lame de lumière balaie le chrome |
| Billes | Gouttes de mercure en apesanteur qui se frôlent, fusionnent et se séparent, et se reflètent entre elles ; elles gonflent sur les basses | Elles fusionnent en une sphère qui éclate en centaines de billes |
| Onde | Bain de mercure en ondes stationnaires, comme la cymatique : chaque partie du spectre dessine ses anneaux et ses pétales ; une goutte tombe au kick ; variante Pics (ferrofluide noir dont les pointes suivent les basses) | La figure passe à un motif plus complexe ; les pics jaillissent |
| Mélange | Sphère de métal liquide où le mercure et l'or (ou le cobalt) se marbrent en volutes ; les coutures s'allument au kick ; l'or gagne au fil de la soirée | Un remous brasse les deux métaux |
| Entrepôt | Vol dans les allées infinies d'un entrepôt : cartons identiques, tapis roulant, néons au kick ; variante Serveurs | Pluie de colis dans l'allée |
| Cathédrale | Nef d'arches lumineuses, sol miroir, brume ; la forme des arches change à chaque phrase, et devient de plus en plus souvent un écran. Une silhouette encapuchonnée, éclairée par son téléphone, ne s'approche que pendant les montées | Vitesse lumière : les arches s'étirent en traînées, la silhouette disparaît |
| Les Fidèles | Une foule tête baissée, chacun éclairé par son écran ; une seule silhouette sans téléphone danse lentement | Les écrans s'éteignent, les têtes se relèvent vers les étoiles |
| Monolithe | Avenue brutaliste en béton banché, soleil rasant, poussière, monolithe ou tête colossale à l'horizon ; caméras de surveillance qui suivent la nôtre, écrans muets, l'eau qui monte | Décollage au-dessus des toits, le monolithe s'allume comme un écran |
| Panoptique | Anneau de cellules autour d'une tour de guet, une silhouette devant un écran dans chacune ; le projecteur s'arrête sur une cellule à chaque kick | Toutes les cellules s'allument |
| Gorge | Vol dans une gorge étroite aux parois ondulées, strates colorées, rais de lumière ; de nuit (monde Canyon), ciel en spirale, strates en fils lumineux et pétroglyphes qui s'allument au passage | On sort de la fente, les couleurs des strates basculent |
| Mesas | Vol au ras d'une rivière miroir entre des falaises en gradins, soleil en anneau (ou nuit chamanique) ; au fil de la soirée la rivière s'assèche, le soleil grossit, une strate de plastique traverse les falaises | On monte au-dessus des mesas |
| Le Cactus | Le cactus sacré dans la nuit du désert, dessiné en lignes de fil : la lumière monte dans ses côtes, le sol respire en cercles, le ciel tourne en spirale pendant la montée ; variante Bouton (cactus rond vu de dessus) | Des fleurs de lumière éclosent au bout de ses bras, le sol devient un mandala |
| L'Esprit | Un feu dans la nuit ; de sa fumée naît un esprit animal (loup, aigle, bélier, hibou) en lignes de fil ; braises au kick | L'esprit change d'animal dans une gerbe d'étincelles |
| La Vision | Scène des breakdowns : plongée sans fin dans un mandala de fils, de côtes de cactus, de pétales et d'yeux qui clignent | — |
| L'Architecte | Mage à tête de pyramide (ou de faucon, Horus), robe de lignes et d'étoiles, cristal rouge, lac d'anneaux arc-en-ciel | La pyramide devient un prisme (rayon blanc entrant, arc-en-ciel sortant) et la robe s'ouvre sur le cosmos |
| Le Nomade | Chapeau conique, orbe dans la main, désert martien, longue ombre, contour néon | L'orbe éclate et embrase le désert, le soleil tourne |
| Les Trois | Moines rouge, bleu et or traversés par un rayon prismatique (une bande de couleur = une bande de fréquences) | Le rayon s'élargit, les robes s'embrasent |
| Le Portail | Lac d'anneaux arc-en-ciel, colonne de lumière, minuscule silhouette | Le portail s'ouvre en vortex |
| La Voie | Vol rapide sur une route de lumière prismatique vers la pyramide sacrée, qui grossit et s'élève sans jamais être atteinte ; obélisques, vague de lumière au kick ; ambiances Cosmos ou Désert | La pyramide bondit vers nous et devient un prisme (rayon blanc qui entre, éventail arc-en-ciel) |
| Grimoire | HUD de jeu ésotérique (2D) : chapitre, glyphes, orbites, texte japonais, vraies données du morceau | Le chapitre change, l'avertissement clignote |
| Chair | Créature entre l'anémone et le corail, tentacules lents, veines bioluminescentes où une impulsion monte à chaque kick, qui blanchit au fil de la soirée ; variante Abysses (fragments de plastique, un sac qui dérive) | Spores lumineuses |
| Morphose | Le Halo en 3D : une forme de chair translucide en deux couronnes rayonnantes, dont chaque branche suit une bande du spectre ; elle passe lentement d'une famille à l'autre (oursin, fleur, étoile, anneau) ; une vague de lumière part du cœur au kick | Elle s'ouvre en corolle et se referme en une nouvelle famille |
| Radiolaire | Squelette de verre d'un micro-organisme : sphère en dentelle hérissée d'épines dont le maillage se transforme, une coque dans la coque, une lueur rouge au cœur sur les basses ; les épines s'allument au kick | La coque s'ouvre en deux sur la coque intérieure |
| Méduse | Méduse bioluminescente dont l'ombrelle bat à son rythme, filaments ondulants, neige marine ; ses canaux s'allument au kick | Un essaim de petites méduses s'élève |
| Signal | Données sur une grille suisse : spectrogramme qui défile, grands chiffres, code-barres, onde ; la mise en page change à chaque phrase | Inversion |
| Flux | Fil infini de cartes sans un mot, qui défile par coups de pouce, de plus en plus vite ; stories, cœurs au kick | Le fil se fige et se déchire en pixels ; au breakdown, il ralentit et s'assombrit |
| La Course | Silhouettes qui courent sur une piste sans fin vers un grand cœur lumineux qui ne se rapproche jamais, chacune suivie d'une file de petites silhouettes (ses followers) ; le cœur bat en double coup au kick, les foulées accélèrent pendant la montée ; au fil de la soirée, plus de coureurs, et certains s'épuisent | Le cœur éclate en pluie de petits cœurs, un coureur tombe et sa file passe à ses voisins |
| Averse | Une silhouette immobile sur une eau noire sous une pluie de gouttes de lumière : chaque goutte trace un anneau d'un pixel sur l'eau et laisse un point sur elle ; les charleys amènent de grosses gouttes, le kick allume les anneaux | Scène des breakdowns de Signal : la pluie s'épaissit jusqu'à recouvrir la silhouette |

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
    art/camera.ts        Cadrages : un plan par phrase, la caméra y glisse en orbite autour du sujet
    art/arcane.glsl.ts   Figure sans visage et robe cosmique du monde Arcanes
    art/heads.ts         Bibliothèque de têtes : chargement des grilles, headD() en GLSL
    2d/  shader/  3d/    Scènes classiques ; 3d/humanoid/ : danseuse, androïde, particules
  components/            Visualizer (boucle, sources, HUD), ControlPanel, settings
public/models/           Michelle.glb (personnage Mixamo des exemples three.js)
public/heads/            Têtes converties (grilles de distances), crédits
scripts/bake-heads.mjs   Conversion des bustes (STL/3MF de assets/heads-src/, calés par assets/heads.config.json)
```

À chaque frame, `AudioEngine.update(dt)` remplit un `AudioFrame` que les scènes reçoivent dans `render(frame, params, dt)`. Ce frame contient :
- les niveaux 0..1 (`bass`, `mid`, `treble`, `volume`), `bands` et `waveform` ;
- les événements `beat` et `beatPulse` ;
- l'horloge (`bpm`, `beatPhase`, `tick`, `downbeat`, `bar`, `phraseBar`) ;
- la structure (`section`, `drop`, `buildProgress`) ;
- `energy`, un « temps musical » qui avance plus vite quand la musique est forte.

## Principes de réalisation

- **Le sujet vit à son tempo** : visage, figure, architecture ou paysage bougent lentement et en continu. Ils ne changent d'état que sur les grands moments du morceau (montée, drop, breakdown), avec des transitions de plusieurs mesures.
- **Les effets portent le rythme** : lumière, couleur, particules, ondes, reflets et post-effets réagissent au kick, aux attaques et aux bandes de fréquences.
- **On peut regarder une scène longtemps** :
  - les **cadrages** changent à chaque phrase, ou toutes les 16 s quand aucun tempo n'est détecté, et la caméra orbite lentement entre deux (`src/scenes/art/camera.ts`) ;
  - une graine `uSeed` varie les motifs à chaque retour de la scène ;
  - quelque chose évolue sur plusieurs minutes.

## Ajouter une scène

1. Créer un fichier dans `src/scenes/2d`, `shader` ou `3d`.
2. Exporter un `SceneDef` avec `id`, `name`, `description`, `tag`, `energy`, `params` et `create()`. Les scènes WebGL rendent dans la `target` fournie (ou exposent `output()`).
3. L'ajouter à `SCENES` dans `src/scenes/index.ts`, et éventuellement à des looks dans `src/looks/index.ts`.

Les `params` (range, toggle, select) génèrent automatiquement les contrôles du panneau et sont sauvegardés dans le navigateur.

Les scènes shader reçoivent aussi `uBands[8]`, 8 bandes de fréquences de la basse (0) à l'aigu (7).

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
