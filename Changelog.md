# Changelog

## Montée DSFR 1.14.3 → 1.15.3 et intégration de DSFR Chart 2.1.1

_17 septembre 2026 — branche `feat/update-DSFR-1.15.3`_

Deux volets : la montée de version du DSFR, qui casse l'extraction des couleurs si on se contente de bouger le tag, et l'ajout d'un domaine entier (la dataviz) jusqu'ici absent du serveur. Deux bugs préexistants, découverts en vérifiant le premier volet, sont corrigés au passage.

### Versions épinglées

| Source | Avant | Après | Publiée le |
|---|---|---|---|
| `@gouvfr/dsfr` | `v1.14.3` | **`v1.15.3`** | 09/09/2026 |
| `@gouvfr/dsfr-chart` | — | **`v2.1.1`** | 03/06/2026 |

Vérifié sur `registry.npmjs.org` et l'API GitHub le 17/09/2026 : 1.15.3 est bien la dernière version stable, rien de plus récent n'existe (le dist-tag npm `unstable` pointe sur `1.15.0-rc.3`, **antérieur** à `latest`). 2.1.1 est la dernière de `dsfr-chart`, dont le versionnage est indépendant de celui du DSFR.

Une seule version de la série est inutilisable : **1.15.1**, la seule à déclarer une dépendance runtime (`@gouvfr/dsfr-nexus`), dont la chaîne atteint `@gouvfr/dsfr-token`, absent du registre npm (404 vérifié). 1.15.0, 1.15.2 et 1.15.3 s'installent normalement.

En revanche, **depuis 1.15.0 toute version exige l'acceptation de la licence à l'installation** : un script `preinstall` fait échouer `npm install` sans `DSFR_ACCEPT_LICENSE=1` (en CI) ou sans passer par `npm create @gouvfr/dsfr@latest`. Le script n'existait pas en 1.14.3. Sans effet sur ce dépôt, qui clone les sources git, mais c'est le premier mur que rencontreront les équipes qui montent de version.

---

## Corrections

### `get_color_tokens` ne renvoyait plus rien à partir de DSFR 1.15 — corrigé

La refonte de la documentation couleurs en 1.15.0 déplace les sources sans prévenir :

| | ≤ 1.14.x | ≥ 1.15.0 |
|---|---|---|
| Tokens de décision (`$background-*`, `$text-*`, `$artwork-*`) | `core/color/index.md` | `core/color/usage/index.md` (nouveau sous-dossier) |
| Palette et familles (Bleu France, Rouge Marianne, Gris…) | `core/palette/index.md` | `core/color/index.md` |
| `core/palette/` | existe | **supprimé** |

`extractColors()` pointait sur les anciens chemins et la boucle « core » de `fetch-docs.ts` ne descendait pas dans les sous-dossiers. Résultat mesuré d'un simple changement de tag :

```
colors.json  1.14.3 : 30 tokens de décision | 24 familles | 17 illustratives
colors.json  1.15.3 :  0 tokens             |  0 familles |  0 illustratives
```

Le script sortait en code 0 et **les 69 tests passaient**, les fixtures de test étant découplées du pipeline d'extraction. Dégradation totalement silencieuse.

Corrigé par une détection de structure (et non par le numéro de tag), pour que `DSFR_TAG=v1.14.3` continue de fonctionner : si `core/color/usage.md` existe, on est en 1.15+ et on lit les décisions là, la palette dans `core/color/overview.md` ; sinon on retombe sur l'ancienne disposition. Les expressions régulières de parsing sont inchangées — le format des tableaux amont n'a pas bougé.

### 39 classes CSS d'icônes étaient fausses — corrigé

39 fichiers SVG du DSFR portent un préfixe `fr--` par lequel l'amont marque ses icônes propres (par opposition aux Remix Icons). Le build du DSFR supprime ce marqueur ; `extractIcons()` le conservait et produisait `fr-icon-fr--error-fill` là où la vraie classe est `fr-icon-error-fill`.

Vérifié en croisant le `icons.json` généré avec les feuilles `dist/utility/icons/*.css` publiées : **39 classes générées n'existaient dans aucun CSS du DSFR**, dont les plus courantes — `error`, `success`, `warning`, `info`, `theme`, `accessibility`, `tiktok`, `submersion`, `capslock`. Un agent qui appelait `search_icons("warning")` recevait une classe sans effet.

Après correction : 1038 classes générées, **0 inexistante**, aucune collision. Bug préexistant, aggravé par la 1.15.3 qui vide `core/icon/index.md` (2982 → 143 lignes) — le dernier endroit où les bonnes classes étaient lisibles.

### Catégories des familles de couleurs décalées d'un cran — corrigé

`flushFamily()` était appelée au moment où l'on rencontrait l'en-tête de tableau **suivant**, donc après que le titre `###` intermédiaire avait déjà avancé la catégorie courante. La catégorie est désormais capturée à l'ouverture du tableau.

| Famille | Avant | Après |
|---|---|---|
| `blue-france` | primaire | primaire |
| `red-marianne` | ~~neutre~~ | **primaire** |
| `grey` | ~~systeme~~ | **neutre** |
| `info` | ~~illustrative~~ | **systeme** |

Conséquence concrète : `get_color_tokens(family="systeme")` renvoyait `grey`, et `family="neutre"` renvoyait `red-marianne`. Bug préexistant, identique en 1.14.3.

---

## Nouveautés

### Nouvel outil MCP : `get_chart_doc`

Le serveur passe de 7 à 8 outils et couvre désormais **DSFR Chart** (`@gouvfr/dsfr-chart` v2.1.1) : 11 web-components, 175 attributs extraits — dont 141 décrits par le README amont et 34 lus uniquement dans les composants Vue —, 27 exemples HTML, 4 guides transverses, 7 palettes et 17 jetons de couleur.

| Graphique | Balise | Attributs | Exemples |
|---|---|---|---|
| `line-chart` | `<line-chart>` | 20 | 5 |
| `bar-chart` | `<bar-chart>` | 21 | 6 |
| `bar-line-chart` | `<bar-line-chart>` | 27 | 1 |
| `pie-chart` | `<pie-chart>` | 13 | 2 |
| `map-chart` | `<map-chart>` | 9 | 4 |
| `map-chart-reg` | `<map-chart-reg>` | 9 | 1 |
| `scatter-chart` | `<scatter-chart>` | 21 | 3 |
| `radar-chart` | `<radar-chart>` | 12 | 3 |
| `gauge-chart` | `<gauge-chart>` | 12 | 1 |
| `data-box` | `<data-box>` | 20 | 1 |
| `table-chart` | `<table-chart>` | 11 | 0 |

L'outil accepte aussi quatre sujets transverses : `install`, `colors`, `accessibility`, `databox`.

**Chaque réponse rappelle la non-conformité RGAA.** Utilisés seuls, ces graphiques sont inaccessibles aux personnes aveugles, déficientes visuelles et handicapées motrices (critères 1.1, 1.6, 3.1, 3.3, 4.8, 4.9, 4.12, 10.13, 10.14) ; une alternative textuelle adjacente est obligatoire. C'est l'information la plus lourde de conséquences pour un site public et la plus facile à omettre.

**La documentation servie est plus complète que le README amont.** Les attributs sont lus dans les composants Vue (source d'autorité sur l'existence, le type, le caractère obligatoire et la valeur par défaut) et croisés avec le README (source d'autorité sur le sens). Les attributs présents dans le code mais absents de la doc amont sont conservés et signalés comme tels, plutôt que perdus :

- lignes de repère `vline` / `vlinecolor` / `vlinename` / `hline` / `hlinecolor` / `hlinename` sur `line-chart`, `scatter-chart`, `bar-line-chart` ;
- drill-down `sub-x` / `sub-y` sur `bar-chart`, `pie-chart`, `table-chart` ;
- `scale-min` / `scale-max`, `date` et `aspect-ratio` sur `radar-chart` ;
- l'intégralité de `table-chart`, qui n'a aucune section dans le README amont — `documented: false` le dit explicitement plutôt que de faire disparaître le composant.

À l'inverse, les trois attributs `databox-id` / `databox-type` / `databox-source`, communs aux dix graphiques, sont bien documentés en amont — mais en prose dans la section DataBox, pas dans la liste de paramètres de chaque graphique. Le parseur va les y chercher, ce qui fait passer la couverture de 111 à 141 attributs décrits sur 175.

Deux pièges de l'amont sont traités : `MapChartReg` est documenté en H3 **imbriqué** dans `# Cartes (MapChart)` (un découpage par niveau de titre lui attribuerait la prop `region` du mauvais composant), et les sections transverses `## Gestion des couleurs` / `## Accessibilité` sont imbriquées sous `# DataBox`.

### Découverte unifiée

`list_components` et `search_components` remontent aussi les graphiques, marqués `[chart]`, avec un renvoi explicite vers `get_chart_doc`. Sans cela, un agent qui cherche « graphique en barres DSFR » ne trouve rien et part inventer un `fr-chart` ou du Chart.js brut.

### Section `usage` sur le fondamental `color`

Nouvelle valeur pour le paramètre `section` de `get_component_doc`, qui expose la page `color/usage` apparue en DSFR 1.15 :

- `get_component_doc(name="color", section="overview")` → la **palette** (tokens d'option) ;
- `get_component_doc(name="color", section="usage")` → les **tokens de décision**.

Les trois pages `*/search` introduites en 1.15 (`color/search`, `icon/search`, `pictogram/search`) ne sont **pas** ingérées : ce sont des coquilles de 26 à 27 lignes contenant une directive `::dsfr-doc-filter` rendue côté client, sans contenu exploitable, que l'amont marque lui-même `sitemap: noindex`.

---

## Robustesse

La régression `colors.json` a traversé 69 tests verts. Trois filets ont été ajoutés, à trois moments différents.

**Au build.** `fetch-docs` échoue désormais (code de sortie ≠ 0) si un extracteur passe sous son seuil plancher : 70 entrées, 500 icônes, 1000 classes, 25 tokens de décision, 20 familles, 15 illustratives, 40 composants avec accessibilité, 10 graphiques. Seuils volontairement bas, pour tolérer l'évolution de l'amont tout en attrapant une source qui a bougé. `prepublishOnly` lance `fetch-docs` : un corpus amputé ne peut plus partir sur npm.

**En CI.** Nouveau fichier `src/__tests__/integrity.test.ts` : des tests portant sur le `docs/` réellement livré, et non sur des fixtures. Cohérence de `meta.json` avec le contenu du disque, non-vacuité de `colors.json`, catégories de familles, absence de classe `fr-icon-fr--`, filtrabilité des 18 catégories d'icônes, présence d'un fichier lisible derrière chaque section déclarée, complétude des graphiques et des guides.

Les deux filets ont été vérifiés en les faisant échouer volontairement : un `colors.json` vidé fait tomber 5 tests, des classes `fr--` réintroduites en font tomber 2, et un chemin de source cassé fait sortir `fetch-docs` en code 1 avec le diagnostic ligne à ligne. Les planchers ne portent pas que sur les cardinaux : `documentedCharts` et `documentedChartParams` gardent le *sens* extrait du README amont, que le seul décompte des graphiques ne protège pas — la liste des graphiques vient du registre des composants, elle reste à 11 même si le parseur ne tire plus rien de la doc.

La rétrocompatibilité annoncée a été prouvée de bout en bout, pas seulement affirmée : `DSFR_TAG=v1.14.3 DSFR_CHART_TAG=v2.0.5 pnpm run fetch-docs` suivi de `pnpm test` donne 137 tests verts, avec 30 tokens, 24 familles et les bonnes catégories.

`fetch-docs` clone désormais les deux dépôts amont **avant** de supprimer `docs/`. Une coupure réseau pendant la récupération de dsfr-chart laissait sinon le corpus versionné détruit et à moitié réécrit.

`.github/workflows/refresh-docs.yml` ne commit plus quand `docs/meta.json` est le seul fichier modifié : son horodatage de fetch change à chaque exécution, et le rafraîchissement nocturne pousserait sinon un commit vide toutes les nuits.

**Au runtime.** `docs/meta.json` passe de `{ dsfrVersion }` à un document complet : version du schéma, les deux tags, les deux commits résolus, les dépôts, l'horodatage du fetch et les compteurs d'extraction. `list_components` expose les deux versions, donc un client sait de quelle release provient la réponse qu'il lit.

---

## Ce qui change pour les consommateurs du serveur

**`list_components` change de forme.** La sortie passe d'un tableau JSON à un objet :

```json
{
  "dsfrVersion": "v1.15.3",
  "dsfrChartVersion": "v2.1.1",
  "entries": [ … ]
}
```

C'est le seul changement de contrat. Les entrées elles-mêmes sont inchangées, hors ajout des lignes `category: "chart"`.

**`get_component_doc(name="palette")` ne répond plus.** L'entrée `core/palette` disparaît de l'index, l'amont ayant supprimé la page (74 entrées au lieu de 75). Son contenu est désormais sous `color` / `overview`. Attention au piège inverse, silencieux : `color` / `overview` existe toujours mais a changé de sens — c'était les tokens de décision, c'est maintenant la palette.

---

## Delta documentaire DSFR 1.14.3 → 1.15.3

Aucun composant ajouté ni supprimé. 1.15.0 est la seule version substantielle de la série ; 1.15.1 est purement juridique et 1.15.2 un refactor de la chaîne de doc.

**Nouveautés fonctionnelles** (1.15.0 sauf mention) : bouton **ProConnect**, variante `fr-connect--pro` (le composant `connect` est renommé « Boutons FranceConnect et ProConnect ») · état **indeterminate** de la case à cocher · grille utilisable en `ul`/`ol` avec gouttières et sans puces · attribut `data-fr-analytics-action="reduce"` · variation « lien au fil du texte » · liaison `for`/`id` sur le curseur simple · variante **`fr-search-bar--labelled`** (1.15.3) · niveau de titre paramétrable sur le bandeau, `fr-notice__title` acceptant h2 à h6 ou p (1.15.3) · nouvelle fonte Marianne avec espace insécable (1.15.3).

**À signaler aux équipes d'intégration** — ce qui peut casser des pages existantes :

- **Retrait de 11 utilitaires de couleur `red-marianne`** (PR #1385). Liste exacte, obtenue en diffant `dist/utility/utility.min.css` entre les deux versions :
  `fr-background-action-high--red-marianne`, `fr-background-action-low--red-marianne`, `fr-background-alt--red-marianne`, `fr-background-contrast--red-marianne`, `fr-background-flat--red-marianne`, `fr-border-default--red-marianne`, `fr-border-plain--red-marianne`, `fr-text-action-high--red-marianne`, `fr-text-inverted--red-marianne`, `fr-text-label--red-marianne`, `fr-text-title--red-marianne`.
  Les cinq `fr-artwork-*--red-marianne` sont **conservées**. Attention en cherchant l'impact : la classe `fr-text--red-marianne` n'a jamais existé, le motif amont est `fr-text-<usage>--red-marianne`. Pour chiffrer :
  ```bash
  grep -rE 'fr-(background|border|text)-[a-z-]*--red-marianne' <vos-gabarits>
  ```
- **Sélecteur label/input** des boutons radio et cases à cocher : passage de `+` à `~` (PR #1380), impacte `radio`, `checkbox`, `password`, `segmented`, `form`.
- **Composant `display`** désactivé quand `data-fr-scheme` est absent (PR #1434).
- **Badges en groupe** : `<span>` au lieu de `<p>` (PR #1498, 1.15.3).
- **Licence** : le DSFR passe sous **etalab-2.0** en 1.15.1, avec de nouvelles CGU. Ce dépôt clone les sources git et n'exécute donc pas le script `preinstall` d'acceptation, mais **le changement de licence mérite une validation juridique** avant de continuer à redistribuer la documentation extraite.

**Icônes** : 1036 → 1038 SVG. Les deux ajouts sont `fr--arrow-right-down-circle-fill.svg` et `fr--arrow-right-up-circle-fill.svg` (catégorie `arrows`) ; d'après le changelog amont (PR #1383) il s'agit d'une **restauration** d'icônes supprimées par erreur en 1.14, pas de nouveautés. 547 → 549 groupes d'icônes.

**Mots-clés** : les trois quarts des fichiers markdown modifiés (152 sur 205) ne changent que sur la ligne `keywords:` du frontmatter, l'amont ayant ajouté les noms anglais (PR #1430) pour améliorer la recherche. Les 53 autres portent du contenu réel : `connect`, `checkbox`, `search`, `input`, `modal`, `notice`, `composition`, `badge`, `range`, `footer`, plusieurs modèles de `layout`, et `core/color`.

**Accessibilité** : `parse-accessibility.ts` a été exécuté sans modification sur les 45 fichiers des deux versions, avec comparaison champ par champ. Aucune régression : tous les compteurs sont égaux ou en hausse. Les diffs de 1.15.3 sont rédactionnels et bien captés (`indeterminate` sur `checkbox`, `data-fr-scrolling` et capture du focus sur `modal`, ProConnect sur `connect`).

---

## Fichiers

**Ajoutés** — `scripts/parse-chart-readme.ts`, `docs/charts.json`, `docs/core/color/usage.md`, `src/__tests__/{charts,integrity,parse-chart-readme}.test.ts`, `src/__tests__/fixtures/{charts.json,meta.json,chart-readme.md}`, `Changelog.md`, `choix-techniques.md`.

**Modifiés** — `scripts/fetch-docs.ts`, `src/{core,server,types}.ts`, `src/__tests__/core.test.ts`, `README.md`, `.gitignore`, `.github/workflows/refresh-docs.yml`.

**Supprimé** — `docs/core/palette/overview.md` (page disparue en amont).

Tests : **69 → 137**, tous verts. `pnpm build` et `pnpm test` passent.

---

## Dette identifiée, non traitée

Signalée ici pour ne pas la perdre ; rien de bloquant.

1. **6 classes d'alias d'icônes manquent.** `fr-icon-account-*`, `fr-icon-delete-*` et `fr-icon-play-*` existent dans le CSS publié comme alias de `account-circle-*`, `delete-bin-*` et `play-circle-*`, mais n'ont pas de fichier SVG dédié et échappent donc à l'extraction. Sans effet pratique : `search_icons("delete")` renvoie `delete-bin-line`, qui fonctionne. Les coder en dur créerait une liste d'alias amont à maintenir à la main.
2. **`rgaaCriteria` pollué par la section Références** sur `highlight`, `input`, `notice`, `pagination`, `skiplink` et `tab` : ces fichiers imbriquent `#### Références` sous `### Critères RGAA applicables`, et `splitSections` englobe les deux. Identique en 1.14.3.
3. **Tables de contraste transposées** sur `checkbox`, `radio` et `toggle` : `parseTableRows` abandonne volontairement (thèmes en lignes), et renvoie une table à zéro ligne. Identique en 1.14.3.
4. **`ICON_CATEGORIES` est écrite deux fois**, dans `src/core.ts` et dans l'enum zod de `src/server.ts`, sans source unique. Les deux listes sont exactes aujourd'hui — un test d'intégrité vérifie désormais que chaque catégorie réelle est filtrable — mais elles peuvent diverger.
5. **`pnpm.overrides` de `package.json` n'est plus lu par pnpm 10.28+**, qui émet un avertissement à chaque commande. Les surcharges de sécurité introduites en `c3f8d2b` survivent dans le lockfile, donc `--frozen-lockfile` les applique toujours ; elles disparaîtraient à la première régénération du lockfile. À migrer vers `pnpm-workspace.yaml`. Hors périmètre de cette PR.
