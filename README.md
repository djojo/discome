# Discome

Visualiseur audio psychédélique dans le navigateur, pensé comme un VJ automatique. Une entrée audio est analysée en temps réel ; elle pilote une quarantaine de scènes (2D, shader, 3D, humanoïdes, raymarching), un réalisateur qui enchaîne les scènes en suivant la structure du morceau, et des esthétiques prêtes à l'emploi.

```bash
npm install
npm run dev   # http://localhost:3000
```

## Fonctionnalités

- **Sources** : micro / entrée, son d'un onglet, fichier (glisser-déposer), démo (un morceau de 32 mesures synthétisé en direct), et un set YouTube qu'un bouton play lance depuis l'accueil.
  - Un set YouTube ou un fichier démarre sur un drop au premier kick entendu (impact, rafale de coupes), sans attendre le premier vrai drop du morceau : une seule fois, pas à chaque reprise d'une boucle.
- **Horloge musicale** : BPM, temps, mesures et phrases de 8 mesures, avec tap tempo. Les sections (groove → breakdown → montée → drop) sont détectées automatiquement.
- **Mondes** : Porcelaine, Signal, Mercure, Cathédrale, Monolithe, Canyon, Arcanes, Chair, Bestiaire, et Classique (les premières scènes).
  - **Le propos, sans un mot** : chaque monde garde son thème et dénonce, par les images et le montage seulement, une dérive d'aujourd'hui : les écrans et l'attention (Cathédrale, Signal, Porcelaine), la surveillance, le culte du chef et du collectif (Monolithe, Signal), l'argent et la consommation (Mercure), le vivant (Canyon, Chair, Bestiaire).
  - **La couleur directrice** : un monde peut déclarer une suite de teintes (Mercure : cobalt, or, cuivre, titane). La teinte du moment glisse vers la suivante à chaque drop, et d'elle-même toutes les quatre minutes ; toutes les scènes du monde la suivent, sans saut d'une coupe à l'autre.
  - **La dérive de la soirée** : réglable sur 30 min, 1 h ou 1 h 30 à partir du lancement de la source. Les mondes se dégradent lentement : l'eau monte dans l'avenue du Monolithe, les caméras et les écrans s'y multiplient, la rivière du Canyon s'assèche, la créature de Chair blanchit comme un corail, la nef de la Cathédrale devient une nef d'écrans, le Flux défile de plus en plus vite.
  - **Le récit** : chaque plan a un rôle (calme, montée, drop ou « après »). Les plans « après » (les ruines, le silence) sont réservés aux breakdowns. Quand les mondes s'enchaînent, la rotation alterne nature et machine.
  - Un monde est une direction artistique complète : une sélection de plans (une scène du catalogue et ses réglages pour ce monde), des palettes, des post-effets, des transitions et un rythme de réalisation.
  - **Les plans** : une même scène peut apparaître plusieurs fois, dans un monde ou d'un monde à l'autre, avec d'autres réglages (Porcelaine « Coquille » et « Éclats », Cathédrale « Rouge » et « Blanche », Profil chrome ou béton…). Chaque plan a sa propre instance, son rôle pour le réalisateur (calme, montée, drop) et ses limites de variation.
  - Tes retouches sont gardées par plan et par monde ; « Réinitialiser le plan » revient aux réglages du monde.
  - **Enchaîner les mondes** : ils se succèdent, au breakdown (et au moins toutes les 8 phrases) ou toutes les 4 ou 8 phrases. Le passage se fait par le noir, et les effets glissent vers ceux du nouveau monde.
  - **Mondes actifs** : un interrupteur sur chaque carte met le monde dans la rotation ou l'en sort (tous y sont par défaut). Le dernier monde actif ne peut pas être éteint ; éteindre le monde à l'écran passe tout de suite au suivant.
- **Ta soirée** (Réglages, ou sur l'accueil) : par défaut, chaque monde s'annonce par son nom, avec DISCOME en dessous, comme un carton de chapitre. On peut le remplacer par le nom de la soirée (et une deuxième ligne pour le DJ ou la date), par un logo, ou ne rien afficher. Chaque monde le montre dans son style, sur un plan « Titre » :
    - Porcelaine : en céramique fendue de vermillon, qui se brise en bandes au drop ;
    - Monolithe : en inscription de béton au-dessus de l'avenue ;
    - Signal : en lignes de niveau sous un cadre de reconnaissance ;
    - Bestiaire : en capitales de marbre ou d'obsidienne, qui se changent lentement en bustes et reviennent ;
    - Mercure : en lettres de chrome dressées dans le bain de métal ;
    - Canyon : en fumée et en fils de laine lumineuse au-dessus du feu ;
    - Arcanes : en relique de verre et de pixels, pleine de cosmos, au-dessus du mage ;
    - Cathédrale : en lettres de lumière au bout de la nef, reflétées par le sol ;
    - Chair : sous la peau de la Membrane, qui respire et le laisse transparaître.
  - Le réalisateur le montre à un moment fort : à l'entrée dans un monde ou au premier drop de la musique, une fois par monde, un monde sur deux, ou souvent. Il reste à l'écran le temps d'un plan, au moins 8 mesures. Un drop à la main (`Espace`) reste toujours un vrai drop : il ne montre pas le titre et passe même pendant le titre. `N` ou « Afficher maintenant » le montre tout de suite.
  - Un logo est réduit à sa silhouette (sa transparence, ou ce qui se détache de la couleur de ses bords) ; chaque monde lui donne sa matière. Un aperçu montre la forme retenue, « Inverser » corrige un logo lu à l'envers.
  - Le titre est écrit dans la police du monde, servie par l'application (aucun appel externe pendant la soirée). Il devient un champ de distance en relief, bombé ou taillé, que les scènes à têtes sculptent comme une tête (`src/brand/`).
  - « Signature dans un coin » : le titre ou le logo en petit sur toutes les scènes, effacé pendant le plan Titre. Tout reste dans le navigateur.
- **Têtes** : les scènes de visage (Porcelaine, Topographie, Profil, Trame, Mercure, Métamorphose), l'Architecte et le Colosse du Monolithe ont un réglage « Tête » :
  - humain et le Patron (les têtes sculptées en code), tigre, loup, faucon, lion, hibou, bélier, Moai, Néfertiti ;
  - le Patron est un archétype du culte de la personnalité, pas un portrait : mâchoire carrée, sourcils épais, moustache, cheveux plaqués en arrière, col de vareuse ;
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
- **Post-FX** : aberration chromatique, traînées, halo lumineux (bloom, dosé par monde, aucun pour Signal), flou de vitesse, pixel (tramage), scanlines, CRT, VHS, grain, étalonnage, miroir, postérisation, strobo (option « Limiter les flashs »). L'option « Pixel et VHS seulement sur les temps forts » les réserve au drop (l'image éclate en gros blocs qui se résolvent palier par palier en une seconde) et aux kicks forts du drop ; Arcanes l'active, pour garder son esthétique de jeu rétro sans sauts de pixels au repos.
- **Rendu** : un étalonnage unique en fin de chaîne. Les scènes photographiques (Porcelaine, Mercure, Cathédrale, Canyon, Arcanes, Chair…) livrent leur lumière brute ; le compositeur leur applique à toutes la même courbe de tons, puis une seule vignette, celle du monde, à toutes les scènes, graphiques comprises. Le bloom lit cette lumière : les vraies hautes lumières d'un drop (étincelles, éclats, flash) rayonnent davantage, dans leur couleur. Chaque scène shader passe par un anticrénelage (FXAA) et s'agrandit en bicubique ; les images intermédiaires sont en 16 bits, avec un tramage final (pas de paliers dans les noirs). La qualité Auto apprend la résolution que chaque scène tient en restant fluide, Ultra force la pleine résolution. Les scènes phares gagnent un relief fin qui n'apparaît que lorsqu'il est assez grand à l'écran : craquelé et piqûres de la glaçure (Porcelaine), grain et voiles du marbre, fils d'or de l'obsidienne (Métamorphose), rides du mercure (Billes), capillaires et peau mouillée (Morphose).

## Scènes

**Direction artistique** (`src/scenes/art/`, shaders en raymarching) :

| Scène | Ce qu'on voit | Au drop |
| --- | --- | --- |
| Porcelaine | Visage de céramique immobile, fissures d'or kintsugi qui se propagent sur plusieurs minutes ; option viseur de téléphone (Selfie) | La tête s'ouvre en coquille ou se brise en éclats flottants (en alternance) sur une agate, une géode et un cœur fractal ; elle se referme au breakdown |
| Métamorphose | Buste de musée en marbre ou en obsidienne qui se transforme lentement d'une tête en une autre, du cou vers le sommet ; la couture d'or du front flashe au kick ; cycle Extinction (chaque drop pétrifie un animal qui ne revient pas, jusqu'à la tête humaine seule) | La transformation démarre ou s'accélère, la couture s'embrase et lâche des étincelles |
| Topographie | Le visage dessiné par des lignes de niveau qui changent lentement d'orientation ; une ligne de lumière le traverse à chaque kick ; option Reconnaissance faciale (points, maillage, cadre, balayage) | Les lignes basculent en profondeur |
| Profil | Le profil en contre-jour, brume et rais de lumière ; le contour s'allume en vague à chaque kick | Un contour d'accent s'allume |
| Trame | Trois trames de couleur, chacune éclairée d'un côté, qui tournent lentement | Inversion |
| Mercure (Houle) | Masque chromé dans un bain de métal liquide, une courbe de cotations à l'horizon ; le masque s'enfonce à mesure qu'elle monte ; la houle suit le morceau (miroir au breakdown, forte au drop) ; chaque kick lance un anneau | La courbe s'effondre, une lame de lumière balaie le chrome |
| Billes | Gouttes de mercure en apesanteur qui se frôlent, fusionnent et se séparent, et se reflètent entre elles ; elles gonflent sur les basses | Elles fusionnent en une sphère qui éclate en centaines de billes |
| Onde | Bain de mercure en ondes stationnaires, comme la cymatique : chaque partie du spectre dessine ses anneaux et ses pétales ; une goutte tombe au kick ; variante Pics (un dôme de ferrofluide noir hérissé de pointes qui suivent les basses, vu en entier, découpé par les reflets du studio) | La figure passe à un motif plus complexe ; les pics jaillissent et la caméra se rapproche |
| Mélange | Sphère de métal liquide où le mercure et un second métal (la couleur directrice du monde) se marbrent en volutes ; les coutures s'allument au kick ; le métal coloré gagne au fil de la soirée | Un remous brasse les deux métaux |
| Coulée | Un mur de métal liquide vu de face : le mercure et un second métal (la couleur directrice) y coulent très lentement et se mélangent en descendant, de lourdes gouttes glissent ; les crêtes s'allument au kick | Une coulée d'or en fusion, au front brûlant, descend du haut par-dessus le mercure puis s'y fond ; le mur coule plus vite quelques mesures |
| Entrepôt | Vol dans les allées infinies d'un entrepôt : rayonnages (montants bleus, lisses orange) chargés de cartons étiquetés, tapis roulant, rampes de néons blancs au plafond dont la lumière froide bat au kick, dans un voile de poussière ; pendant la montée le hall s'assombrit et des tubes crépitent sur les charleys ; au fil de la soirée les rayonnages se remplissent et des tubes meurent. Variante Serveurs : couloir de baies sous une lumière froide bleutée, chemins de câbles et de fibre au plafond, sol à dalles perforées ; à chaque kick une vague de LED court le long des baies | Les néons flambent, de gros cartons dégringolent en tournoyant dans l'allée et s'empilent ; Serveurs : toutes les LED passent au rouge, comme une alerte, puis reviennent |
| Cathédrale | Nef d'arches lumineuses, sol miroir, brume ; la forme des arches change à chaque phrase, et devient de plus en plus souvent un écran. Une silhouette encapuchonnée, éclairée par son téléphone, ne s'approche que pendant les montées | Vitesse lumière : les arches s'étirent en traînées, la silhouette disparaît |
| Les Fidèles | Une foule tête baissée, chacun éclairé par son écran ; une seule silhouette sans téléphone danse lentement | Les écrans s'éteignent, les têtes se relèvent vers les étoiles |
| Monolithe | Avenue brutaliste en béton banché, un soleil bas juste à droite de l'axe : les tours en contre-jour, leurs ombres qui traversent l'avenue, les rais dans la poussière ; pendant la montée le soleil descend et rougit ; monolithe ou tête colossale à l'horizon, caméras de surveillance qui suivent la nôtre, écrans muets, l'eau qui monte ; variante Nuit sodium : lampadaires orange le long de l'avenue, flaques de lumière sur la chaussée mouillée | Décollage au-dessus des toits, le soleil remonte d'un coup : la ville devient un cadran solaire, l'ombre du monolithe la traverse, et il s'allume comme un écran ; la nuit, les lampadaires s'éteignent et se rallument en cascade |
| Panoptique | La nuit, un anneau de cellules en béton autour d'une tour de guet ; dans chacune une silhouette éclairée en bleu froid par l'écran qu'elle tient (une cellule vide n'a qu'un écran au mur). Le projecteur de la tour balaie l'anneau, cône de lumière dans la poussière, et s'arrête sur une cellule à chaque kick (sans kick, il balaie sans s'arrêter) ; la montée allume des écrans et le fait sauter plus loin | Tous les écrans s'allument d'un coup, une mer de lueurs bleues, et l'œil de la tour flashe ; puis les écrans s'éteignent un à un |
| La Collectivité | Une place d'armes : des rangs de silhouettes identiques alignées au cordeau, chacune un écran à la main, face au visage géant du Patron en bas-relief, aux yeux qui luisent ; au kick toute la foule fait le même geste, pendant la montée les écrans s'allument rang par rang | La caméra monte : les écrans, levés comme les cartons des jeux de masse, dessinent ensemble le portrait du Patron, puis la mosaïque se défait rang par rang |
| Gorge | Vol dans une gorge étroite aux parois ondulées, strates colorées, rais de lumière ; de nuit (monde Canyon), une lune en croissant éclaire les parois, ciel en spirale, strates en fils lumineux où court la lumière, grands pétroglyphes magenta et or (spirales, soleils, serpents, mains, éclairs) qui s'allument au passage | On sort de la fente, une vague de couleur court le long des strates, les pétroglyphes flashent |
| Mesas | Vol au ras d'une rivière miroir entre des falaises en gradins, soleil en anneau (ou nuit chamanique, comme la Gorge) ; au fil de la soirée la rivière s'assèche, le soleil grossit, une strate de plastique traverse les falaises | On monte au-dessus des mesas |
| Le Cactus | Le cactus sacré dans la nuit du désert, chaque côte un faisceau de fils de couleur cerné d'un fil sombre, d'autres cactus en silhouettes à l'horizon sous une lune en croissant ; le sol respire en cercles, le ciel tourne en spirale pendant la montée ; variante Bouton : un peyotl en relief (côtes rondes, touffes de laine) sur un mandala de fils, qui gonfle pendant la montée | Des fleurs magenta et or s'ouvrent au bout de ses bras, le pollen monte, la caméra s'élève sur le sol devenu mandala ; le Bouton ouvre sa fleur rose |
| L'Esprit | Un feu en langues de fils ; sa fumée monte en tournant et devient un esprit animal (loup, aigle, bélier, hibou), toujours de face ou de trois-quarts, enroulé de fils, éclairé par le feu, sa silhouette tracée d'un fil lumineux, des braises dans les yeux ; braises au kick | L'esprit se défait dans sa fumée et renaît en un autre animal, dans une gerbe d'étincelles |
| La Vision | Scène des breakdowns, en couleurs huichol : plongée sans fin dans un mandala de fils (côtes de cactus, pétales, yeux qui clignent, serpents, soleils, fleurs de peyotl), un œil qui s'ouvre au cœur ; au kick, les anneaux respirent et les couronnes tournent en sens alternés | — |
| L'Architecte | Mage à tête de pyramide (ou de faucon, Horus), robe de lignes et d'étoiles, cristal rouge, lac d'anneaux arc-en-ciel | La pyramide devient un prisme (rayon blanc entrant, arc-en-ciel sortant) et la robe s'ouvre sur le cosmos |
| Le Nomade | Chapeau conique, orbe dans la main, désert martien, longue ombre, contour néon | L'orbe éclate en rayons et en un anneau de lumière qui balaie le désert, le soleil tourne |
| Les Trois | Moines rouge, bleu et or traversés par un rayon prismatique (une bande de couleur = une bande de fréquences) | Le rayon s'élargit, les robes s'embrasent |
| Le Portail | Lac d'anneaux arc-en-ciel, minuscule silhouette debout sur l'eau, fil de lumière ; pendant la montée, l'orage se forme (nuages éclairés de l'intérieur, fil qui grésille) | La foudre frappe la silhouette en saccades, puis une colonne de lumière s'installe dans le portail, onde de choc sur le lac, vortex ; les kicks re-frappent quelques mesures (un seul coup avec « Limiter les flashs ») |
| La Voie | Vol rapide sur une route de lumière prismatique, entre deux files de grands obélisques gravés posés sur une chaussée, jusqu'à la pyramide sacrée qui grossit et s'élève sans jamais être atteinte ; la vague du kick allume leurs pyramidions, qui s'allument un à un pendant la montée ; ambiances Cosmos ou Désert | La pyramide bondit vers nous et devient un prisme (rayon blanc qui entre, éventail arc-en-ciel), tous les pyramidions flambent |
| Grimoire | HUD de jeu ésotérique (2D) : glyphes, orbites, texte japonais, vraies données du morceau ; le chapitre est celui du plan à l'écran (« The Rainbow Gate » sur le Portail…) | Le titre du chapitre se brouille, l'avertissement clignote |
| Chair | Créature entre l'anémone et le corail, tentacules lents, veines bioluminescentes où une impulsion monte à chaque kick, qui blanchit au fil de la soirée ; variante Abysses (fragments de plastique, un sac qui dérive) | Spores lumineuses |
| Morphose | Le Halo en 3D : une forme de chair translucide en deux couronnes rayonnantes, dont chaque branche suit une bande du spectre ; elle passe lentement d'une famille à l'autre (oursin, fleur, étoile, anneau) ; une vague de lumière part du cœur au kick | Elle s'ouvre en corolle et se referme en une nouvelle famille |
| Radiolaire | Squelette de verre d'un micro-organisme : sphère en dentelle hérissée d'épines dont le maillage se transforme, une coque dans la coque, une lueur rouge au cœur sur les basses ; les épines s'allument au kick | La coque s'ouvre en deux sur la coque intérieure |
| Méduse | Méduse bioluminescente dont l'ombrelle bat à son rythme, filaments ondulants, neige marine ; ses canaux s'allument au kick | Un essaim de petites méduses s'élève |
| Membrane | Une peau de nacre qui respire, filmée de près ; quelque chose pousse dessous (un visage, ou le titre de la soirée) et la tend jusqu'à laisser passer la lumière ; une impulsion court dans les veines au kick | La lumière inonde la peau |
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
| `N` | Montrer le titre de la soirée |
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
    youtube.ts           Le set YouTube du bouton play (vidéo, API du lecteur)
  engine/
    Compositor.ts        Rend chaque scène hors écran puis les mélange (transitions, calque, post-FX)
    compositorShader.ts  Passe finale GLSL
    Director.ts          Réalisateur automatique
    transitions.ts, fx.ts
  looks/index.ts         Mondes (plans = scène + réglages, palettes, effets, rythme, plan Titre)
  brand/
    brand.ts             Ta soirée : nom du monde (par défaut), titre ou logo, fréquence, signature
    shape.ts             Titre ou logo → champ de distance 2D (une texture par police), signature
    logo.ts              Import d'un logo : silhouette (transparence, ou contraste avec le bord)
    fonts.ts             La police du titre dans chaque monde (next/font, servie par l'application)
  scenes/
    types.ts             Contrat d'une scène + paramètres déclaratifs
    art/                 Scènes de direction artistique (visages, Mercure, Cathédrale…)
    art/flight.ts        Vol partagé des travellings (vitesse selon la structure, figures, roulis)
    art/camera.ts        Cadrages : un plan par phrase, la caméra y glisse en orbite autour du sujet
    art/arcane.glsl.ts   Figure sans visage et robe cosmique du monde Arcanes
    art/heads.ts         Bibliothèque de têtes : chargement des grilles, headD() en GLSL ; la tête « titre » sculpte le titre
    2d/  shader/  3d/    Scènes classiques ; 3d/humanoid/ : danseuse, androïde, particules
  components/            Visualizer (boucle, sources, HUD), ControlPanel, BrandSettings, YouTubePlayer, settings
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

- **Pas de texte à l'écran**, à une exception près : le titre de ta soirée, sur son plan. Il suit les mêmes règles (il bouge à peine, il reste lisible, les effets portent le rythme).
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

Pour qu'une scène à tête sculpte le titre de la soirée : `setHead(u, p.head, "", p)` (la tête `"titre"` lit `titleFont`, `titleRelief` et `titleWorld` dans les réglages du plan), des cadrages de face marqués `tag: "title"`, et une limite de rendu assez large pour le titre. Un monde la déclare dans `Look.title`.

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
| Set YouTube | Mini-lecteur YouTube intégré + `getDisplayMedia` (`preferCurrentTab`) | Le son d'une iframe YouTube n'entre pas dans la Web Audio API : Discome capture le son de son propre onglet. Chrome ou Edge sur ordinateur, qui demandent « Partager cet onglet ? » à chaque lancement. Le lecteur reste visible dans un coin, comme le demande YouTube. |

Pour visualiser le son du système sur macOS (Spotify app, etc.), passer par un périphérique virtuel type BlackHole et le choisir comme entrée micro.
