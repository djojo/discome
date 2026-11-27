# Discome

Visualiseur audio psychédélique dans le navigateur, pensé comme un VJ automatique. Une entrée audio est analysée en temps réel ; elle pilote une quarantaine de scènes (2D, shader, 3D, humanoïdes, raymarching), un réalisateur qui enchaîne les scènes en suivant la structure du morceau, et des esthétiques prêtes à l'emploi.

```bash
npm install
npm run dev   # http://localhost:3000
```

## Fonctionnalités

- **Sources** : micro / entrée, son d'un onglet, fichier (glisser-déposer), démo (un morceau de 32 mesures synthétisé en direct), et un set YouTube qu'un bouton play lance depuis l'accueil.
  - Un set YouTube ou un fichier démarre sur un drop au premier kick entendu (impact, montage de caméra), sans attendre le premier vrai drop du morceau : une seule fois, pas à chaque reprise d'une boucle.
- **Horloge musicale** : BPM, temps, mesures et phrases de 8 mesures, avec tap tempo. Les sections (groove → breakdown → montée → drop) sont détectées automatiquement.
- **Mondes** : Olympe, Signal, Mercure, Cathédrale, Monolithe, Canyon, Arcanes, Chair, Bestiaire, Mycélium, Circuit, et Classique (les premières scènes).
  - **Le propos, sans un mot** : chaque monde garde son thème et dénonce, par les images et le montage seulement, une dérive d'aujourd'hui : les écrans et l'attention (Cathédrale, Signal), la surveillance, le culte du chef et du collectif (Monolithe, Signal), l'argent et la consommation (Mercure), le vivant (Canyon, Chair, Bestiaire), l'accélération et la compétition (Circuit : la course sans fin, le même tour qui revient, le départ toujours recommencé, la même course depuis quarante ans de jeux vidéo). Olympe, le paradis blanc, en montre l'envers : la lenteur et la contemplation perdues, les dieux et les œuvres qu'on ne regarde plus. Mycélium, le monde du rêve (Alice, la forêt hantée, la grotte, le terrier, les champignons géants), n'en a pas : la nuit sous la lune en volume, que le mycélium relie et où chaque kick court comme un signal.
  - **Le trip** (Mycélium) : un niveau de trip suit le morceau (léger en groove, il monte avec la montée, frappe au drop, profond et lent au breakdown) et le réglage « Trip » le dose par monde. La nuit devient enchantée (lune, brume et aurores aux teintes qui glissent : violet, turquoise, or, magenta), les surfaces respirent et se couvrent de motifs vivants qui coulent, les lumières se colorent et laissent des traînées irisées, l'image entière respire, et le calque Visions (membranes de cellules, filaments en fougère, pavage qui se déforme, en zoom infini) apparaît dans l'ombre, devant tout au breakdown.
  - **La couleur directrice** : un monde peut déclarer une suite de teintes (Mercure : cobalt, or, cuivre, titane). La teinte du moment glisse vers la suivante à chaque drop, et d'elle-même toutes les quatre minutes ; toutes les scènes du monde la suivent, sans saut d'une coupe à l'autre.
  - **La dérive de la soirée** : réglable sur 30 min, 1 h ou 1 h 30 à partir du lancement de la source. Les mondes se dégradent lentement : l'eau monte dans l'avenue du Monolithe, les caméras et les écrans s'y multiplient, la rivière du Canyon s'assèche, la créature de Chair blanchit comme un corail, la nef de la Cathédrale devient une nef d'écrans, le Torrent coule de plus en plus vite et de plus en plus dense, la course du Circuit consume la ville (la mégapole s'éteint quartier par quartier, la meute grossit, la plaine des Traînées se remplit de murs de lumière, les gradins de L'Arène se vident rang par rang et les arrêts aux Stands deviennent frénétiques).
  - **Le récit** : chaque plan a un rôle (calme, montée, drop ou « après »). Les plans « après » (les ruines, le silence) sont réservés aux breakdowns. Quand les mondes s'enchaînent, la rotation alterne nature et machine.
  - Un monde est une direction artistique complète : une sélection de plans (une scène du catalogue et ses réglages pour ce monde), des palettes, des post-effets, des transitions et un rythme de réalisation.
  - **Les plans** : une même scène peut apparaître plusieurs fois, dans un monde ou d'un monde à l'autre, avec d'autres réglages (Olympe « Ciel intérieur » et « Éclats », Cathédrale « Rouge » et « Blanche », Profil chrome ou béton…). Chaque plan a sa propre instance, son rôle pour le réalisateur (calme, montée, drop) et ses limites de variation.
  - Tes retouches sont gardées par plan et par monde ; « Réinitialiser le plan » revient aux réglages du monde.
  - **Enchaîner les mondes** : ils se succèdent, au breakdown (et au moins toutes les 8 phrases) ou toutes les 4 ou 8 phrases. Le passage se fait par le noir, et les effets glissent vers ceux du nouveau monde.
  - **Mondes actifs** : un interrupteur sur chaque carte met le monde dans la rotation ou l'en sort (tous y sont par défaut). Le dernier monde actif ne peut pas être éteint ; éteindre le monde à l'écran passe tout de suite au suivant.
- **Ta soirée** (Réglages, ou sur l'accueil) : par défaut, chaque monde s'annonce par son nom, avec DISCOME en dessous, comme un carton de chapitre. On peut le remplacer par le nom de la soirée (et une deuxième ligne pour le DJ ou la date), par un logo, ou ne rien afficher. Chaque monde le montre dans son style, sur un plan « Titre » :
    - Olympe : en marbre, en capitales romaines, au-dessus de la mer de nuages ; au drop il se brise en bandes devant le soleil ;
    - Monolithe : en inscription de béton au-dessus de l'avenue ;
    - Signal : en lignes de niveau sous un cadre de reconnaissance ;
    - Bestiaire : en capitales de marbre ou d'obsidienne, qui se changent lentement en bustes et reviennent ;
    - Mercure : en lettres de chrome dressées dans le bain de métal ;
    - Canyon : en verre d'aurore boréale au-dessus du feu, translucide et lumineux de l'intérieur ;
    - Arcanes : en relique de verre et de pixels, pleine de cosmos, au-dessus du mage ;
    - Cathédrale : en lettres de lumière au bout de la nef, reflétées par le sol ;
    - Chair : sous la peau de la Membrane, qui respire et le laisse transparaître ;
    - Mycélium : en fils de mycélium lumineux qui poussent sur la falaise de la grotte, au milieu des vers luisants, et que le lac reflète ;
    - Circuit : en lettres de lumière sur un grand panneau au-dessus du portique de départ, des cinq feux et de la grille.
  - Le titre se lit toujours franchement, dans le style du monde : au moins 40 % environ de la largeur de l'image, sans zone brûlée. Pendant le plan Titre, les effets se calment (bloom réduit, plus de stroboscope, d'aberration chromatique, de traînées ni de miroir, accents et effets rétro adoucis). Le Monolithe monte au-dessus des toits pour faire face à son inscription, Olympe grise un peu son ciel blanc derrière lui.
  - Le réalisateur le montre à un moment fort : à l'entrée dans un monde ou au premier drop de la musique, une fois par monde, un monde sur deux, ou souvent. Il reste à l'écran le temps d'un plan, au moins 8 mesures. Un drop à la main (`Espace`) reste toujours un vrai drop : il ne montre pas le titre et passe même pendant le titre. `N` ou « Afficher maintenant » le montre tout de suite.
  - Un logo est réduit à sa silhouette (sa transparence, ou ce qui se détache de la couleur de ses bords) ; chaque monde lui donne sa matière. Ses couleurs sont gardées pour une seule chose : là où deux d'entre elles se touchent (des lettres posées sur une forme), une fine rainure est taillée, et ces lettres se lisent dans chaque monde. L'aperçu montre la forme que sculptent les mondes, prévient si des traits sont trop fins ; « Inverser » corrige un logo lu à l'envers.
  - Le titre est écrit dans la police du monde, servie par l'application (aucun appel externe pendant la soirée). Il devient un champ de distance en relief, bombé ou taillé, que les scènes à têtes sculptent comme une tête (`src/brand/`).
  - « Rappel » : jamais, ou toutes les 5, 10 ou 15 minutes, le plan Titre du monde revient sur un moment calme (une coupe du groove, l'entrée d'un breakdown), jamais pendant une montée ou un drop.
  - « Signature dans un coin » : le titre ou la silhouette du logo (rainurée) en petit sur toutes les scènes, nette, une ombre douce dessous, effacée pendant le plan Titre ; sa taille (petite, moyenne, grande), son coin et son opacité se règlent. Tout reste dans le navigateur.
- **Têtes** : les scènes de visage (le Ciel intérieur, Topographie, Profil, Trame, Mercure, Métamorphose), l'Architecte et le Colosse du Monolithe ont un réglage « Tête », rangé par familles :
  - Animaux : tigre, loup, faucon, lion, hibou, bélier (bustes de Printables) ; cobra, panthère, ours, cerf, éléphant (sculptés en code) ;
  - Visages : la tête humaine sculptée en code, et douze portraits de Rome et de Grèce scannés par le SMK de Copenhague (domaine public) : Romaine âgée, Lysimaché, Dame aux boucles, Giulia, Minatia Polla, Héra, Memnon, Antinoüs, Marc Aurèle, Socrate, Pseudo-Sénèque, Homère ;
  - Archétypes : le Patron, archétype du culte de la personnalité et pas un portrait (mâchoire carrée, sourcils épais, moustache, cheveux plaqués en arrière, col de vareuse) ; six archétypes antiques, une coiffe sculptée en code posée sur un portrait : l'Empereur (laurier et rubans, sur Marc Aurèle), l'Impératrice (diadème en croissant), Athéna (casque à crête), la Vestale (voile), Dionysos et Silène (lierre et grappes) ;
  - Masques : la tragédie et la comédie du théâtre grec ;
  - Sculptures du monde : Moai, Néfertiti ;
  - toutes sont des grilles de distances, donc tous les effets marchent avec toutes les têtes. Les bustes et les scans sont convertis une fois par `scripts/bake-heads.mjs` ; les têtes en code sont cuites sur la carte graphique à leur premier usage (`src/scenes/art/sculpt/`), sans rien à télécharger ; une coiffe suit le tour de tête de son buste, mesuré sur sa grille. Crédits et licences dans `public/heads/CREDITS.md` ;
  - un plan peut tirer une autre tête à chaque retour (`vary.choices`). Seules les têtes des mondes actifs se chargent (celles du monde affiché d'abord) ; celles d'un monde qu'on éteint quittent la carte graphique.
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
- **Fonds** : les premières scènes (Tourbillon, Halo, Échos, Tunnel, Orbe, Spectro-terrain, Kaléidoscope, Corps de particules) servent de fonds aux mondes.
  - Elles sont rendues en basse résolution, floutées et teintées dans la palette du monde.
  - Elles n'apparaissent que dans les zones sombres de la scène principale, jamais à l'intérieur de son sujet : les scènes de visages et d'architecture transmettent leur silhouette au compositeur.
  - Le réalisateur change de fond toutes les 3 phrases, ou au drop. Il le rend plus présent en breakdown et le fait pulser pendant les rafales.
  - On peut aussi choisir le fond à la main dans la section « Fond ».
  - Le monde Classique garde ces scènes en plein écran, avec leurs couleurs d'origine.
- **Palettes** : 2 à 4 couleurs par palette, avec des rôles fixes (fond, encre, accent) au lieu d'arcs-en-ciel. Les scènes s'en servent pour se recolorer selon le monde.
- **Réalisateur** (Manuel / Chill / Club / Rave) : un montage qui suit la structure du morceau.
  - Chaque moment appelle les plans faits pour lui (le rôle de chaque plan dans son monde) : un plan calme en groove, un plan de montée dès le premier temps de la montée et tenu jusqu'au drop, un plan de drop, un plan d'après-drop au breakdown (tenu jusqu'à la montée).
  - Un plan « montée → drop » (La Chute, Le Labyrinthe) est choisi pour la montée et traverse le drop sans coupe : sa révélation est l'impact (le puits qui s'ouvre sur la caverne, la caméra qui s'élève au-dessus du labyrinthe). Le réalisateur ne prépare alors pas de plan de drop ; la tenue et la reprise des coupes restent celles du mode.
  - Au drop, le plan de drop est tenu le temps de son histoire (8 mesures en Chill, 4 en Club, 2 en Rave) ; le rythme passe alors par le montage de caméra à l'intérieur de la scène : coupes franches sur le 1, toutes les 4 mesures en Chill, 2 en Club, chaque mesure en Rave, deux fois plus serrées au second drop d'un morceau. Seule la Rave enchaîne ensuite une rafale de coupes de scène.
  - Les coupes frappent sur le temps : une transition courte (punch, flash, glitch) part en avance pour que son choc tombe sur le 1 ; au drop, elle part à son point fort.
  - La caméra des scènes à cadrages pousse lentement vers le sujet pendant la montée, glisse lentement au breakdown, et une phrase sur trois commence par une coupe franche en groove.
  - Le silence d'avant le drop plonge l'image dans le noir (adouci avec « Limiter les flashs ») ; une intro calme tient ses plans deux fois plus longtemps.
  - À chaque retour d'un plan, sa palette et ses choix déclarés (tête, matière) changent ; ses curseurs ne bougent que dans les plages qu'il déclare (librement dans le monde Classique).
  - `npm run rehearse` fait jouer au réalisateur un morceau scripté dans chaque monde, imprime sa feuille de montage (`-v`) et vérifie ces règles.
- **Transitions** : cut, fondu, punch, glitch, volet lumineux, iris, flash blanc, passage au noir, plongée dans la fissure (on entre dans une fente de lumière et on ressort dans la scène suivante), plongée dans l'écran (un petit rectangle lumineux s'allume au milieu de l'image, on plonge dedans).
- **Calque** : une 2e scène superposée, avec mode de fusion, opacité et option « pulse au beat ». Un monde peut poser son propre calque (Arcanes pose le Grimoire, Mycélium ses Visions), retiré en quittant le monde.
- **Post-FX** : accents rythmiques (le cadre pousse et la lumière monte au kick, les claps scintillent, le 1 d'une phrase de drop frappe : plein au drop, léger en groove, dosé par monde), aberration chromatique, traînées (et traînées irisées, qui changent de teinte à chaque image), respiration (l'image ondule et gonfle sur deux mesures, comme des parois qui fondent), halo lumineux (bloom, dosé par monde, aucun pour Signal), flou de vitesse, pixel (tramage), scanlines, CRT, VHS, grain, étalonnage, miroir, postérisation, strobo (option « Limiter les flashs »). L'option « Pixel et VHS seulement sur les temps forts » les réserve au drop (l'image éclate en gros blocs qui se résolvent palier par palier en une seconde) et aux kicks forts du drop ; Arcanes l'active, pour garder son esthétique de jeu rétro sans sauts de pixels au repos.
- **Rendu** : un étalonnage unique en fin de chaîne. Les scènes photographiques (Olympe, Mercure, Cathédrale, Canyon, Arcanes, Chair…) livrent leur lumière brute ; le compositeur leur applique à toutes la même courbe de tons, puis une seule vignette, celle du monde, à toutes les scènes, graphiques comprises. Le bloom lit cette lumière : les vraies hautes lumières d'un drop (étincelles, éclats, flash) rayonnent davantage, dans leur couleur. Chaque scène shader passe par un anticrénelage (FXAA) et s'agrandit en bicubique ; les images intermédiaires sont en 16 bits, avec un tramage final (pas de paliers dans les noirs). La qualité Auto apprend la résolution que chaque scène tient en restant fluide, Ultra force la pleine résolution. Les scènes phares gagnent un relief fin qui n'apparaît que lorsqu'il est assez grand à l'écran : grain du marbre (Olympe), grain et voiles du marbre, fils d'or de l'obsidienne (Métamorphose), rides du mercure (Billes), capillaires et peau mouillée (Morphose).

## Scènes

**Direction artistique** (`src/scenes/art/`, shaders en raymarching) :

| Scène | Ce qu'on voit | Au drop |
| --- | --- | --- |
| Le Ciel intérieur | Olympe, le paradis blanc : un buste antique (un autre à chaque retour) flotte haut au-dessus d'une mer de nuages, dans un ciel blanc sans horizon ; des cumulus passent dans le marbre de son visage, comme dans un collage, ses yeux sont ceux d'une statue ; des rayons de lumière en éventail autour du soleil bas, l'ombre du buste découpée dedans ; à la montée, le canon des proportions se trace au crayon sur son visage | La tête s'ouvre en coquille ou éclate en fragments suspendus (en alternance) sur le ciel qu'elle contient et le soleil qui y brille ; une lumière d'or pâle sort de la fente ; elle se referme au breakdown |
| La Mer de nuages | Un vol très lent au ras d'une mer de nuages, vers un soleil bas ; des têtes antiques colossales en émergent comme des îles, le visage tourné vers le ciel, toutes différentes ; au kick une onde de lumière roule sur les nuages, à la montée le soleil se lève | On plonge dans les nuages et on ressort au-dessus d'une autre mer |
| La Salle du temps | Un sol blanc infini qui se fond dans le ciel ; des bustes sur de hauts socles, immobiles, très loin les uns des autres ; le temps passe en accéléré : leurs ombres tournent avec le soleil, de plus en plus vite à la montée, celles des nuages filent | Le temps s'arrête : les ombres se figent dans un flash blanc, deux mesures d'immobilité, puis tout repart lentement |
| L'Assemblée des dieux | Au centre d'un cercle de têtes olympiennes colossales (Héra, Athéna, Dionysos, Homère en Zeus, l'Empereur, l'Impératrice) sur des colonnes de nuages, qui baissent les yeux vers nous ; la caméra tourne lentement ; au kick un anneau de lumière fait le tour | Une colonne de lumière tombe du zénith, les nuages tourbillonnent, les dieux s'éclairent de l'intérieur |
| Les Œuvres mortes | Une réserve oubliée dans les nuages : des rangées de plâtres tirés du même moule, copies de copies d'un portrait antique (un autre à chaque passage), certains sous des draps ; de la poussière qui scintille dans les rais de lumière ; pendant un break, un drap glisse et découvre un visage | Un plâtre se fend et une lumière d'or pâle sort de la fêlure |
| Métamorphose | Buste de musée en marbre ou en obsidienne, posé sur son socle de pierre sombre sous le rond de lumière d'un spot, dans la poussière du faisceau, qui se transforme lentement d'une tête en une autre, du cou vers le sommet (le bélier, un bas-relief, tient sur sa tige et ne se montre que de face) ; la couture d'or du front flashe au kick, la poussière scintille sur les charleys ; cycle Extinction (chaque drop pétrifie un animal qui ne revient pas, jusqu'à la tête humaine seule) ; cycle Antiques (chaque portrait se couronne de son archétype : Marc Aurèle de laurier, Minatia du casque d'Athéna…) ; cycle Masques du théâtre (la tragédie devient la comédie) | La transformation démarre ou s'accélère, la couture s'embrase et lâche des étincelles, la poussière s'envole |
| Le Muséum | Une galerie d'histoire naturelle la nuit : de chaque côté de l'allée, des vitrines sur socle, chacune avec un buste en marbre (quatre animaux de la bibliothèque ou, dans la collection Antiques, quatre portraits de Rome et de Grèce, différents à chaque passage et jamais un portrait avec son archétype ; répétés le long de l'allée) sous son rond de lumière ; sol sombre aux reflets doux, le reste de la galerie dans l'ombre, la tête humaine seule au bout de l'allée. La caméra glisse le long de l'allée (enfilade, trois-quarts sur une vitrine, gros plan à travers la vitre, plongée sur les rangées) ; le kick fait respirer les lumières, les charleys font scintiller la poussière dans les faisceaux, la montée épaissit l'air ; au fil de la soirée, la galerie se vide | Une lumière grésille et s'éteint (en douceur avec « Limiter les flashs ») : le buste de la vitrine qu'on regarde tombe en poussière, du sommet du crâne vers le socle, et la vitrine reste vide sous un reste de lumière ; à la fin, seule la tête humaine est encore éclairée |
| Topographie | Le visage dessiné par des lignes de niveau qui changent lentement d'orientation ; une ligne de lumière le traverse à chaque kick ; option Reconnaissance faciale (points, maillage, cadre, balayage) | Les lignes basculent en profondeur |
| Profil | Le profil en contre-jour, brume et rais de lumière ; le contour s'allume en vague à chaque kick | Un contour d'accent s'allume |
| Trame | Trois trames de couleur, chacune éclairée d'un côté, qui tournent lentement | Inversion |
| Mercure (Houle) | Masque chromé dans un bain de métal liquide, sous un studio photo (plafond lumineux en dalles, deux softbox en bande) dont le visage et le bain renvoient les reflets ; une courbe de cotations à l'horizon ; le masque s'enfonce à mesure qu'elle monte ; la houle suit le morceau (miroir au breakdown, forte au drop) ; chaque kick lance un anneau | La courbe s'effondre ; le studio s'éteint et une lame de lumière balaie le visage et le bain |
| Billes | Gouttes de mercure lourdes posées sur un miroir noir : elles glissent lentement, se rejoignent, fusionnent et se séparent, toute la pièce se courbe en elles ; elles tremblent au kick et gonflent un peu sur les basses | Elles coulent en une flaque où tombe une goutte, et la caméra s'approche : une couronne d'éclaboussure se lève comme dans du lait, ses doigts lancent des gouttelettes (quelques-unes droit sur l'objectif), un jet monte du cratère et retombe ; puis les gouttes se reforment |
| Onde | Bain de mercure en ondes stationnaires, comme la cymatique : chaque partie du spectre dessine ses anneaux et ses pétales ; une goutte tombe au kick ; variante Pics (un dôme de ferrofluide noir hérissé de pointes qui suivent les basses, vu en entier, découpé par les reflets du studio) | La figure passe à un motif plus complexe ; les pics jaillissent et la caméra se rapproche |
| Mélange | Sphère de métal liquide où le mercure et un second métal (la couleur directrice du monde) se marbrent en volutes ; les coutures s'allument au kick ; le métal coloré gagne au fil de la soirée | Un remous brasse les deux métaux |
| Coulée | Un mur de métal liquide vu de face : le mercure et un second métal (la couleur directrice) y coulent très lentement et se mélangent en descendant, de lourdes gouttes glissent ; les crêtes s'allument au kick | Une coulée d'or en fusion, au front brûlant, descend du haut par-dessus le mercure puis s'y fond ; le mur coule plus vite quelques mesures |
| La Fonte | Une pile de lingots et de pièces d'or dans un studio noir de photo produit, filmée comme une publicité de luxe, debout dans un bain de mercure qui la dissout lentement par le pied : les arêtes s'adoucissent, des coulures glissent, la pile s'enfonce, un halo d'amalgame tourne dans le mercure ; à chaque kick une goutte d'or tombe et touche le bain sur le temps ; pendant la montée la fonte s'accélère et le pied de la pile rougeoie | Toute la pile s'effondre en une coulée incandescente qui s'étale sur le mercure et s'y mêle en volutes ; bien plus tard, une nouvelle pile remonte du bain |
| Entrepôt | Vol dans les allées infinies d'un entrepôt : rayonnages (montants bleus, lisses orange) chargés de cartons étiquetés, tapis roulant, rampes de néons blancs au plafond dont la lumière froide bat au kick, dans un voile de poussière ; pendant la montée le hall s'assombrit et des tubes crépitent sur les charleys ; au fil de la soirée les rayonnages se remplissent et des tubes meurent. Variante Serveurs : couloir de baies sous une lumière froide bleutée, chemins de câbles et de fibre au plafond, sol à dalles perforées ; à chaque kick une vague de LED court le long des baies | Les néons flambent, de gros cartons dégringolent en tournoyant dans l'allée et s'empilent ; Serveurs : toutes les LED passent au rouge, comme une alerte, puis reviennent |
| Cathédrale | Nef d'arches lumineuses, sol miroir, brume ; la forme des arches change à chaque phrase, et devient de plus en plus souvent un écran. Une silhouette encapuchonnée, éclairée par son téléphone, ne s'approche que pendant les montées | Vitesse lumière : les arches s'étirent en traînées, la silhouette disparaît |
| Les Fidèles | Une foule de silhouettes sombres, tête baissée, parfois sous une capuche : seul le visage et les mains prennent la lumière froide de l'écran qu'elles tiennent ; une seule silhouette sans téléphone danse lentement, prise dans une lumière chaude tombée d'en haut | Les écrans s'éteignent, les têtes se relèvent vers les étoiles, cernées de lumière |
| La Rosace | Une immense rosace gothique de lumière d'une seule couleur, haut dans le mur d'une nef sombre, dont les pétales en lancette sont des écrans ; elle tourne lentement, ses rais portent son dessin dans la brume jusqu'au sol miroir ; les charleys allument quelques pétales comme des notifications, le kick fait respirer les rais, la montée allume les anneaux du cœur vers le bord | La rosace s'embrase et ses rais inondent la nef (une montée douce avec « Limiter les flashs ») ; au breakdown, seul le cœur brille encore |
| Les Orgues | Un buffet d'orgue dont les tuyaux sont de lumière, dans la brume : chaque tuyau suit une bande du spectre (les graves dans les grands tuyaux des côtés, les aigus dans les petits du centre), sans à-coups ; un souffle de lumière monte dans les tuyaux au kick ; la montée en allume de plus en plus | Tous les tuyaux flambent et la lumière jaillit vers la voûte ; au breakdown, quelques tuyaux respirent encore |
| Monolithe | Avenue brutaliste en béton banché, un soleil bas juste à droite de l'axe : les tours en contre-jour, leurs ombres qui traversent l'avenue, les rais dans la poussière ; pendant la montée le soleil descend et rougit ; monolithe ou tête colossale à l'horizon, caméras de surveillance qui suivent la nôtre, écrans muets, l'eau qui monte ; variante Nuit sodium : lampadaires orange le long de l'avenue, flaques de lumière sur la chaussée mouillée | Décollage au-dessus des toits, le soleil remonte d'un coup : la ville devient un cadran solaire, l'ombre du monolithe la traverse, et il s'allume comme un écran ; la nuit, les lampadaires s'éteignent et se rallument en cascade |
| Panoptique | La nuit, un anneau de cellules en béton autour d'une tour de guet ; dans chacune une silhouette éclairée en bleu froid par l'écran qu'elle tient (une cellule vide n'a qu'un écran au mur). Le projecteur de la tour balaie l'anneau, cône de lumière dans la poussière, et s'arrête sur une cellule à chaque kick (sans kick, il balaie sans s'arrêter) ; la montée allume des écrans et le fait sauter plus loin | Tous les écrans s'allument d'un coup, une mer de lueurs bleues, et l'œil de la tour flashe ; puis les écrans s'éteignent un à un |
| La Collectivité | Une place d'armes : des rangs de silhouettes identiques alignées au cordeau, chacune un écran à la main, face au visage géant du Patron en bas-relief, aux yeux qui luisent ; au kick toute la foule fait le même geste, pendant la montée les écrans s'allument rang par rang | La caméra monte : les écrans, levés comme les cartons des jeux de masse, dessinent ensemble le portrait du Patron, puis la mosaïque se défait rang par rang |
| Gorge | Vol dans une gorge étroite aux parois ondulées, strates colorées, rais de lumière ; de nuit (monde Canyon), une lune en croissant éclaire les parois, ciel en spirale, strates en fils lumineux où court la lumière, grands pétroglyphes magenta et or (spirales, soleils, serpents, mains, éclairs) qui s'allument au passage | On sort de la fente, une vague de couleur court le long des strates, les pétroglyphes flashent |
| Mesas | Vol au ras d'une rivière miroir entre des falaises en gradins, soleil en anneau (ou nuit chamanique, comme la Gorge) ; au fil de la soirée la rivière s'assèche, le soleil grossit, une strate de plastique traverse les falaises | On monte au-dessus des mesas |
| Le Cactus | Le cactus sacré dans la nuit du désert, chaque côte un faisceau de fils de couleur cerné d'un fil sombre, d'autres cactus en silhouettes à l'horizon sous une lune en croissant ; le sol respire en cercles, le ciel tourne en spirale pendant la montée ; variante Bouton : un peyotl en relief (côtes rondes, touffes de laine) sur un mandala de fils, qui gonfle pendant la montée | Des fleurs magenta et or s'ouvrent au bout de ses bras, le pollen monte, la caméra s'élève sur le sol devenu mandala ; le Bouton ouvre sa fleur rose |
| L'Esprit | Un feu en langues de fils ; sa fumée monte en tournant, prend les couleurs de l'aurore boréale et devient un esprit animal (loup, cerf, faucon, ours, hibou, panthère, bélier, cobra, éléphant) en verre d'aurore : translucide, lumineux de l'intérieur, traversé de rideaux verts et violets qui montent, son contour lumineux, la nuit visible à travers lui, le cou dissous en voile ; une aurore à fines raies se lève derrière ; au kick une onde de lumière le traverse, dans la montée ses rideaux s'avivent | L'esprit s'embrase, se défait en lumière et renaît en un autre animal, dans une gerbe d'étincelles |
| Les Ancêtres | Notre esprit voyage dans l'espace, jugé par les ancêtres : les esprits animaux et des visages anciens (portraits de Rome et de Grèce, leurs archétypes, Moai, Néfertiti), parfois un masque de théâtre, en verre d'aurore, qui se succèdent de part et d'autre de la route au-dessus de nous, de temps en temps un grand ancien au-dessus de la route ; jamais deux fois le même en vue (un archétype compte pour le portrait sur lequel il est sculpté), et aucun ne revient avant qu'une quinzaine d'autres soient passés ; tous nous regardent et nous suivent des yeux en baissant la tête vers nous ; tout autour, des voiles d'aurore verts et violets, sans sol ni horizon, des étoiles ; le vol accélère dans la montée, les têtes s'allument de l'intérieur ; « Ancêtres en vol », plus rapide, pour les drops | L'aurore s'embrase et les ancêtres se resserrent autour de nous |
| La Vision | Scène des breakdowns, en couleurs huichol : plongée sans fin dans un mandala de fils (côtes de cactus, pétales, yeux qui clignent, serpents, soleils, fleurs de peyotl), un œil qui s'ouvre au cœur ; au kick, les anneaux respirent et les couronnes tournent en sens alternés | — |
| L'Architecte | Mage à tête de pyramide (ou de faucon, Horus), robe de lignes et d'étoiles, cristal rouge, lac d'anneaux arc-en-ciel | La pyramide devient un prisme (rayon blanc entrant, arc-en-ciel sortant) et la robe s'ouvre sur le cosmos |
| Le Nomade | Chapeau conique, orbe dans la main, désert martien, longue ombre, contour néon | L'orbe éclate en rayons et en un anneau de lumière qui balaie le désert, le soleil tourne |
| Les Trois | Moines rouge, bleu et or traversés par un rayon prismatique (une bande de couleur = une bande de fréquences) | Le rayon s'élargit, les robes s'embrasent |
| Le Portail | Lac d'anneaux arc-en-ciel, minuscule silhouette debout sur l'eau, fil de lumière ; pendant la montée, l'orage se forme (nuages éclairés de l'intérieur, fil qui grésille) | La foudre frappe la silhouette en saccades, puis une colonne de lumière s'installe dans le portail, onde de choc sur le lac, vortex ; les kicks re-frappent quelques mesures (un seul coup avec « Limiter les flashs ») |
| La Voie | Vol rapide sur une route de lumière prismatique, entre deux files de grands obélisques gravés posés sur une chaussée, jusqu'à la pyramide sacrée qui grossit et s'élève sans jamais être atteinte ; la vague du kick allume leurs pyramidions, qui s'allument un à un pendant la montée ; ambiances Cosmos ou Désert | La pyramide bondit vers nous et devient un prisme (rayon blanc qui entre, éventail arc-en-ciel), tous les pyramidions flambent |
| Grimoire | HUD de jeu ésotérique (2D) : glyphes, orbites, texte japonais, vraies données du morceau ; le chapitre est celui du plan à l'écran (« The Rainbow Gate » sur le Portail…) | Le titre du chapitre se brouille, l'avertissement clignote |
| Chair | Une anémone dans l'eau profonde, accrochée à sa roche : pied cannelé, disque buccal plissé, deux couronnes d'une quarantaine de tentacules fins et translucides qui ondulent dans un courant lent, pointes bioluminescentes ; une impulsion monte dans ses veines à chaque kick ; elle blanchit au fil de la soirée ; variante Abysses (fragments de plastique, un sac qui dérive) | Spores lumineuses |
| Morphose | Le Halo en 3D : une forme de chair translucide en deux couronnes rayonnantes, dont chaque branche suit une bande du spectre ; elle passe lentement d'une famille à l'autre (oursin, fleur, étoile, anneau) ; une vague de lumière part du cœur au kick | Elle s'ouvre en corolle et se referme en une nouvelle famille |
| Radiolaire | Squelette de verre d'un micro-organisme : sphère en dentelle hérissée d'épines dont le maillage se transforme, une coque dans la coque, une lueur rouge au cœur sur les basses ; les épines s'allument au kick | La coque s'ouvre en deux sur la coque intérieure |
| Méduse | Méduse bioluminescente dont l'ombrelle bat à son rythme, filaments ondulants, neige marine ; ses canaux s'allument au kick | Un essaim de petites méduses translucides s'élève, chacune avec son bord lumineux et ses filaments |
| Membrane | Une peau de nacre qui respire, filmée de près ; quelque chose pousse dessous (un visage, ou le titre de la soirée) et la tend jusqu'à laisser passer la lumière ; une impulsion court dans les veines au kick | La lumière inonde la peau |
| Signal | Données sur une grille suisse : spectrogramme qui défile, grands chiffres, code-barres, onde ; la mise en page change à chaque phrase | Inversion |
| Le Torrent | Une cascade sans fin de petites vignettes lumineuses (un cadre d'un pixel, une image tramée, jamais un mot) tombe d'un ciel noir dans un gouffre de brume, en jets qui dérivent ; une petite silhouette la regarde du haut d'un piton ; une vague de lumière la parcourt à chaque kick, quelques vignettes s'allument en blanc sur les charleys, la montée les étire en traits | Tout se fige en l'air, puis les vignettes s'effritent en poussière et un nouveau flot dévale du haut ; au breakdown, il ne reste qu'un filet |
| Le Pèlerinage | Sur un désert de sel au crépuscule, craquelé en polygones et couvert de flaques qui font miroir, des files sans fin de petites silhouettes noires (manteaux, sacs à dos, toutes différentes) marchent vers un monolithe de lumière dressé à l'horizon, un écran géant qu'on n'atteint jamais ; leurs longues ombres s'étirent vers nous ; plans larges et lents (au ras du sol, aérien, de profil, à travers la procession) ; le monolithe pulse au kick et un contour s'en échappe, des rides courent sur l'eau aux charleys, la marche devient course pendant la montée ; au fil de la soirée, les files s'épaississent | Le monolithe s'embrase en une vague de blanc (une montée douce avec « Limiter les flashs »), les files s'arrêtent net deux mesures, puis repartent ; quelques marcheurs se retournent et rebroussent chemin vers nous |
| L'Écran sous la pluie (Averse) | Une silhouette en long manteau à capuche, immobile sur une immense eau noire en miroir, la tête penchée sur le téléphone qu'elle tient à la poitrine : l'écran est la seule lumière proche, il éclaire par-dessous son visage dans la capuche et ses mains, et tremble dans l'eau ; une pluie de gouttes de lumière tombe sur toute l'étendue, chaque goutte trace un anneau d'un pixel sur l'eau et laisse un point sur elle ; plans larges et lents (très large, de dos, en plongée, au ras de l'eau), un seul plan serré ; les charleys amènent de grosses gouttes, le kick allume les anneaux. Plein cadre : le fond du monde ne passe pas | Scène des breakdowns de Signal : la pluie s'épaissit, les points recouvrent la silhouette et sa propre lumière s'éteint, jusqu'à ce qu'il ne reste que des points autour de l'écran allumé |
| La Forêt hantée | Un vol lent à hauteur d'homme entre des arbres morts tordus, sous une lune basse : la brume en couches avale les troncs lointains, la lune passe en rayons entre eux et étire leurs ombres vers nous ; des feux follets ouvrent la route et clignotent sur les charleys ; au sol, le mycélium relie chaque arbre à ses voisins et chaque kick y fait courir une impulsion d'arbre en arbre ; la montée accélère et resserre les troncs sur le chemin | Éclosion : la brume s'embrase dans la couleur du moment, une vague de lumière court jusqu'au fond de la forêt et allume tous les champignons des troncs, les feux follets éclatent en essaim |
| Les Géants | Une forêt de champignons géants vue à hauteur d'insecte : pieds courbés, chapeaux translucides éclairés par la lune, lamelles lumineuses où la couleur glisse (lilas, violet, rose, ambre) et dont la lumière tombe en flaques sur la mousse, brins d'herbe immenses, neige de spores floue près de l'objectif ; Rétrécir : pendant la montée, l'œil descend au ras de la mousse et l'objectif se resserre | Les chapeaux exhalent des nuages de spores lumineuses, un anneau de lumière court sur le sol, les lamelles passent à la couleur suivante |
| La Chute | La chute dans le terrier : un puits de terre sinueux et sans fin (strates de terre, d'argile et de craie, racines, pierres, veines de mycélium et points de champignons lumineux), de vieux objets qui flottent en tournant (une montre, une clé, une petite porte, un flacon à la boisson lumineuse) ; lente en groove, de plus en plus rapide pendant la montée (flou de vitesse) | Plan montée → drop : le puits s'ouvre par le toit d'une caverne immense où des champignons géants lumineux sont reliés par des filaments de mycélium ; la chute devient un flottement |
| Le Labyrinthe | Un labyrinthe parfait et sans fin de hautes haies sombres sous la lune, parcouru à hauteur d'homme (la caméra suit le même tracé que le shader, au bit près) ; la brume dans les allées, le mycélium au milieu de chacune ; la montée presse le pas, grandit les haies et baisse la lumière : on ne trouve pas la sortie | Plan montée → drop : la caméra s'élève d'un coup puis ralentit et découvre le labyrinthe jusqu'à l'horizon, parcouru d'une vague de lumière ; après la tenue, elle redescend dans les allées |
| La Grotte aux lucioles | Une caverne immense : des vers luisants partout sur la roche, des milliers de fils perlés de lumière bleue pendus à la voûte, des stalactites et des stalagmites de calcite mouillée, un lac noir qui reflète tout, une petite silhouette encapuchonnée sur une barque avec sa lanterne ; au kick une goutte tombe et le lac s'anneau ; Silence (pour les breakdowns) : au ras de l'eau, seulement les fils et la lanterne ; plan Titre | Les cristaux des stalagmites s'embrasent en vague |
| La Tanière | Depuis le terrier du loup, une arche de terre et de racines encadre la forêt sous la lune, dans la brume, dessinée en ombres chinoises ; des paires d'yeux s'allument une à une dans le noir et clignent, de la buée sort à l'entrée ; sur certaines phrases un loup se lève sur la crête et hurle devant la lune. Le loup n'est jamais vu de près | La lune perce les nuages et toute la meute hurle sur la crête |
| Le Miroir | « De l'autre côté » : un étang immobile dans une forêt morte, grise et givrée, sous une lune pâle ; son reflet montre la même forêt vivante (feuillages fleuris de lumière, champignons lumineux, lucioles, une nuit chaude et ambrée) ; cadrages bas, au ras de l'eau ; au kick une goutte trouble les deux mondes | La surface se brise en ondes ; pendant la tenue, la couleur du reflet déborde dans la vraie forêt et monte le long des troncs, puis l'eau se calme |
| Le Circuit | Une piste anti-gravité de verre noir suspendue très haut au-dessus d'une mégapole de nuit (tapis de lumières, tours de verre aux arêtes de lumière) : rails de lumière, anneaux, chevrons de boost, virages relevés, bosses et deux tire-bouchons où la ville passe au-dessus de nous ; on roule au ras de la piste dans une meute de bolides (une flèche de verre noir, deux nacelles, des moteurs en anneaux) qui tiennent leur file, prennent la corde et doublent en déboîtant ; leurs traînées sont des rubans de lumière tendus entre les nacelles (blancs au moteur, à la couleur du bolide, violets en queue), parcourus d'une impulsion à chaque kick, semant des escarbilles, et reflétés dans la piste ; au kick une vague de lumière file devant, pendant la montée les lumières des rails filent et la caméra descend ; le même tour revient sans fin, une lumière de plus au portique d'arrivée à chaque passage ; variante Croisière (moins de bolides, caméra plus haute) | La piste se dérobe devant nous : la meute vole au-dessus du vide, la ville tout en bas, et se pose plus loin |
| La Grille de départ | La ligne de départ sur la piste suspendue : une douzaine de bolides en quinconce sous le portique et ses cinq feux, moteurs au ralenti qui palpitent au kick ; pendant la montée un feu rouge s'allume à chaque cinquième et les moteurs montent en régime ; à chaque retour, de nouveau le départ ; plan Titre | Plan montée → drop : les feux s'éteignent, la meute part et la caméra la suit dans les premières courbes |
| Le Tube | La piste plonge dans un tube de verre : la meute roule sur sa paroi tout autour, la caméra avec elle, et la ville tourne derrière le verre (fin pavage, lignes de lumière, anneaux qui s'allument en vague au kick) ; pendant la montée le tube se resserre et la meute avec lui | Plan montée → drop : on jaillit de la bouche du tube, on se remet à l'endroit et on s'élève au-dessus de la course tendue en traînées sur la ville |
| La Cité de verre | Une ville sans fin de tours de verre noir aux arêtes tracées de lumière ; des flux de bolides coulent sur des voies suspendues à trois hauteurs, la pluie tombe, le sol mouillé reflète tout ; on glisse lentement dans une avenue, tout petit ; au kick la lumière remonte les arêtes depuis le sol ; Extinction (pour les breakdowns) : la ville s'éteint, il reste la pluie et les flux | Toutes les arêtes s'embrasent jusqu'au ciel, la caméra s'élève |
| Les Traînées | Une plaine infinie de dalles de verre noir sous la pluie, la mégapole tout autour à l'horizon (tours en silhouette contre sa lueur, fenêtres allumées, reflétées dans le verre). Les bolides de verre noir et de néon s'inclinent dans les virages et peignent des figures de lumière, une par phrase : anneaux, grand cercle, spirales, tresses à trois, grand huit. Leurs murs montent du sol derrière eux, parcourus de courants, couchent leur lumière sur le verre, puis se défont bloc par bloc en lâchant une poussière lumineuse. Au kick les murs pulsent, ils étincellent sur les charleys. La montée enroule les bolides en spirale. La caméra alterne la grue et la poursuite au ras du sol. Les murs restent et la plaine se remplit au fil de la soirée ; Pose longue : vu de haut, la peinture de lumière se construit | Une immense rosace pendant quatre mesures, en poursuite, puis l'étoile |
| Générations | La même course à travers les âges du jeu vidéo : gros pixels, route en bandes et bolides en sprites ; lignes vectorielles phosphorescentes ; polygones plats dans le brouillard ; une époque à chaque retour, et pendant la montée les époques passent, chacune par un balayage sur un temps fort | Plan montée → drop : le rendu complet du Circuit |
| L'Arène | La course vue des gradins : un stade géant de verre noir qui couronne une tour de la mégapole, ses gradins épousant le virage de la piste, qui entre par une porte de lumière et ressort à l'autre bout, sous une couronne de projecteurs ; une figure par siège éclairée par les projecteurs, une lumière brandie par la moitié du public ; une ola fait le tour des gradins au kick, des flashs crépitent sur les charleys ; Les Gradins (calme) : l'attente, une meute par phrase | La meute jaillit par la porte et traverse l'arène, toute la foule s'allume ; puis une meute toutes les deux mesures |
| Les Stands | La voie des stands le long de la piste, un mur de lumière entre elles, une rangée de garages de verre noir baignés de lumière blanche ; un bolide se gare, des bras articulés descendent du plafond et travaillent sur lui sous une pluie d'étincelles, de plus en plus vite pendant la montée, ses moteurs se chargent ; la meute passe sur la piste de temps en temps | Plan montée → drop : les bras se relèvent, le bolide repart en trombe dans la voie et rejoint la piste, la caméra à sa suite |
| Le Pilote | Un pilote en casque de moto intégral qui tourne lentement sur lui-même. Le casque : laque noire, lame blanche sur chaque flanc bordée de la couleur du moment, mentonnière en V à prise d'air en carbone, becquet et écopes en carbone, écran iridium sur pivots chromés, derrière lequel on devine le regard. Le pilote porte un cuir de course. Quatre fonds d'un retour à l'autre : anneau de néon, mur de tubes qui s'allument en séquence au kick, la course derrière (la ville floue, des traînées qui passent), lignes de vitesse ; « Face à face » pour les drops | Caméra embarquée face au pilote couché sur sa machine. La vitesse monte en une mesure et tient tout le drop : le fond s'efface, la route, ses feux de piste et les lumières de la ville filent vers le point de fuite derrière lui, l'image vibre et se floute. Puis il se remet à tourner |

**Classiques**, recolorées par les palettes des mondes : Halo, Kaléidoscope, Orbe, Tunnel, Nébuleuse, Spectro-terrain, Échos, Danseuse, Androïde, Corps de particules.
- **Androïde** : un visage de panneaux de verre noir, aux coutures de néon qui suivent chacune la bande du spectre de leur hauteur, deux fentes de lumière pour yeux, dans un studio sombre de tubes néon qui se reflètent sur le verre ; au kick, des circuits s'allument sous le verre depuis les coutures, la montée les étend à tout le visage ; au drop, les panneaux se déverrouillent, s'écartent sur un cœur de lumière, puis se referment.
- **Danseuse** : l'hologramme n'éclaire que la surface avant du corps (les mèches et les plis ne s'additionnent plus en boule blanche).
- **Corps de particules** : des particules fines réparties sur toute la surface du corps, le côté proche plus lumineux ; les formes abstraites surtout dans les breaks.
- **Nébuleuse** : une galaxie spirale en 3D aux étoiles nettes comme des pointes d'épingle, bras de gaz en nœuds colorés et bandes de poussière sombre, vue sous plusieurs angles (en biais, de face, par la tranche, au ras d'un bras) ; au kick, une salve d'étoiles jaillit du cœur le long des bras ; la montée l'accélère et rapproche la caméra ; au drop, le cœur s'embrase et une vague de lumière court dans les bras. L'ancienne spirale 2D, devenue Tourbillon, ne sert plus que de fond (Monolithe, Arcanes, Bestiaire).

## Raccourcis

| Touche | Action |
| --- | --- |
| `←` `→`, `1`–`9` | Changer de plan dans le monde courant |
| `Espace` | Drop manuel (impact et montage du drop, recale la mesure) |
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
    art/mycelium.glsl.ts Nuit de lune, brume, fils de mycélium et lucioles du monde Mycélium
    art/circuitTrack.ts  La piste du monde Circuit, lue à l'identique en JS et en GLSL (un tour qui revient sans fin), la meute
    art/circuit.glsl.ts  Nuit, mégapole lointaine et bolide du monde Circuit ; circuitScene.glsl.ts : le dessin des scènes de piste
    art/heads.ts         Bibliothèque de têtes (familles, licences) : chargement des grilles, headD() en GLSL ; la tête « titre » sculpte le titre
    art/sculpt/          Têtes sculptées en code (animaux, masques, coiffes des archétypes) et le four qui les cuit en grilles sur la carte graphique
    art/sky.glsl.ts      Le paradis blanc d'Olympe : ciel, mer de nuages, rayons, marbre, ciel dans la pierre, canon des proportions
    art/casting.ts       Distribution par passage (Muséum) et défilé (Ancêtres) : les têtes suivantes se chargent pendant que celles-ci jouent
    2d/  shader/  3d/    Scènes classiques ; 3d/humanoid/ : danseuse, corps de particules (l'androïde est dans art/)
  components/            Visualizer (boucle, sources, HUD), ControlPanel, BrandSettings, YouTubePlayer, settings
public/models/           Michelle.glb (personnage Mixamo des exemples three.js)
public/heads/            Têtes converties (grilles de distances), crédits et licences
scripts/bake-heads.mjs   Conversion des bustes et des scans (STL, 3MF, OBJ, PLY, glTF de assets/heads-src/, calés par assets/heads.config.json)
scripts/rehearse.ts      Répétition du réalisateur (npm run rehearse), avec ts-hooks.mjs pour lancer le TypeScript de l'app dans Node
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

Une scène qui montre des têtes par elle-même les déclare dans `heads` (une liste, ou une fonction de ses réglages : une collection, un cycle) ; elles se chargent avec les mondes qui la tiennent. Pour tirer quelques têtes d'un grand ensemble à chaque passage sans tout charger : `Casting` (`src/scenes/art/casting.ts`) ; pour des têtes qui défilent une à une, chacune différente de celles en vue et des dernières vues : `Procession`. Une nouvelle tête en code : sa forme dans `sculpt/sculpt.glsl.ts`, sa recette dans `sculpt/cast.ts` (`worn()` pour une coiffe posée sur un buste), son entrée dans `HEADS`. Une limite de rendu qui suit la grille (`uHeadMin.y + uHeadSize.y`) laisse passer les bois et les crêtes.

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
