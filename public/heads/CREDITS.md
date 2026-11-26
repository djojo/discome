# Têtes : sources

Grilles de distances calculées par `scripts/bake-heads.mjs` à partir de scans et de bustes. Les modèles d'origine ne
sont pas dans le dépôt (`assets/heads-src/`, ignoré par git). Leur calage est dans `assets/heads.config.json`.

## Portraits de Rome et de Grèce : SMK, domaine public

Scans des moulages de la collection royale de moulages (The Royal Cast Collection) du SMK, Statens Museum for Kunst,
Copenhague. Publiés par le musée sous [Public Domain Mark 1.0](https://creativecommons.org/publicdomain/mark/1.0/) :
libres de tout usage, commercial compris. Fichiers STL allégés téléchargés depuis l'API ouverte du SMK
(`https://api.smk.dk/api/v1/download-3d/…`).

| Tête | Œuvre | Inventaire | Licence | Page |
| --- | --- | --- | --- | --- |
| romaine | Portrait d'une Romaine âgée | DEP453 | Domaine public (PDM 1.0) | https://open.smk.dk/artwork/image/DEP453 |
| lysimache | Femme âgée, Lysimaché | KAS2247 | Domaine public (PDM 1.0) | https://open.smk.dk/artwork/image/KAS2247 |
| dame | Portrait d'une dame romaine aux boucles hautes | KAS843 | Domaine public (PDM 1.0) | https://open.smk.dk/artwork/image/KAS843 |
| giulia | Femme flavienne, « Giulia giovane » | KAS1122 | Domaine public (PDM 1.0) | https://open.smk.dk/artwork/image/KAS1122 |
| minatia | Portrait d'une jeune fille, Minatia Polla | KAS1227 | Domaine public (PDM 1.0) | https://open.smk.dk/artwork/image/KAS1227 |
| hera | Tête de l'Héra Barberini | KAS622 | Domaine public (PDM 1.0) | https://open.smk.dk/artwork/image/KAS622 |
| memnon | Memnon, élève d'Hérode Atticus | KAS969 | Domaine public (PDM 1.0) | https://open.smk.dk/artwork/image/KAS969 |
| antinous | Antinoüs couronné de lierre | DEP454 | Domaine public (PDM 1.0) | https://open.smk.dk/artwork/image/DEP454 |
| marcaurele | Marc Aurèle jeune | KAS1090 | Domaine public (PDM 1.0) | https://open.smk.dk/artwork/image/KAS1090 |
| socrate | Socrate | KAS635 | Domaine public (PDM 1.0) | https://open.smk.dk/artwork/image/KAS635 |
| seneque | Pseudo-Sénèque (Hésiode ?) | KAS94 | Domaine public (PDM 1.0) | https://open.smk.dk/artwork/image/KAS94 |
| homere | Homère, type d'Épiménide | KAS2237 | Domaine public (PDM 1.0) | https://open.smk.dk/artwork/image/KAS2237 |

## Bustes Printables : usage personnel

Bustes gratuits publiés sur Printables. Usage personnel ; voir la licence de chaque modèle sur sa page.

| Tête | Modèle | Auteur | Licence | Page |
| --- | --- | --- | --- | --- |
| tigre | Fantasy Tiger Bust | Stigern | Usage personnel | https://www.printables.com/model/1342710-fantasy-tiger-bust |
| loup | Wolf Bust Decor | Stigern | Usage personnel | https://www.printables.com/model/1275550-wolf-bust-decor |
| faucon | Ancient Egyptian Horus Bust | voir la page | Usage personnel | https://www.printables.com/model/1572054-ancient-egyptian-horus-bust-stl-falcon-god-3d-prin |
| lion | Marble Lion Bust #2 | Triple G Workshop | Usage personnel | https://www.printables.com/model/1262368-marble-lion-bust-2 |
| hibou | Great Horned Owl Bust | quentinsteinke | Usage personnel | https://www.printables.com/model/325499-great-horned-owl-bust |
| belier | Sculpted Ram Head | ncsandor | Usage personnel | https://www.printables.com/model/99006-sculpted-ram-head |
| moai | Moai Statue (3mf Ready to Print) | TIXEN | Usage personnel | https://www.printables.com/model/31513-moai-statue-3mf-ready-to-print-by-tixen |
| nefertiti | NEFERTITI | Prusa Research | Usage personnel | https://www.printables.com/model/3112-nefertiti |

## Sculptées en code, pour Discome

Aucun fichier : sculptées dans `src/scenes/art/sculpt/` et cuites sur la carte graphique au premier usage. Libres.

| Tête | Ce que c'est |
| --- | --- |
| humain, patron | La tête sculptée et Le Patron (`src/scenes/art/lib.glsl.ts`) |
| cobra, panthere, ours, cerf, elephant | Les animaux |
| tragedie, comedie | Les masques du théâtre grec |
