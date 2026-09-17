# Choix techniques

Décisions structurantes prises lors de la montée DSFR 1.15.3 et de l'intégration de DSFR Chart, avec ce qui les motive et ce qui a été écarté. Rédigé pour la personne qui reprendra ce dépôt et se demandera pourquoi c'est fait comme ça.

---

## 1. Un outil dédié pour les graphiques, plutôt qu'une catégorie de plus

**Décision.** Ajouter `get_chart_doc` (7 → 8 outils) et faire apparaître les graphiques dans `list_components` et `search_components`, marqués `[chart]`, avec un renvoi explicite vers le nouvel outil.

**Pourquoi.** Un `<bar-chart>` n'a aucune classe `fr-*`, ses « props » sont des attributs HTML dont la valeur est du JSON sérialisé (`x='[["2025","2030"]]'`), et l'accessibilité de dsfr-chart est une section **globale** et non une fiche par composant. Verser les graphiques dans l'index des composants ferait donc mentir deux outils sur sept :

| Appel | Ce que ça renverrait |
|---|---|
| `get_component_code("bar-chart")` | une liste de classes `fr-*` vide |
| `get_component_accessibility("bar-chart")` | « pas de section accessibilité », alors que c'est le sujet le plus critique |

L'argument décisif en faveur d'un outil dédié : **la description d'un outil MCP est en contexte en permanence, avant tout appel**. C'est le seul endroit où l'on peut prévenir qu'il s'agit de web-components Vue d'un paquet npm distinct. Une valeur `category` dans un JSON de retour ne le dit qu'après coup, quand l'agent a déjà choisi le mauvais outil.

**Écarté — tout fusionner sous `category: "chart"`.** Zéro outil ajouté, mais l'agent apprend la distinction trop tard.

**Écarté — silo complet (`list_charts` + `get_chart_doc` + `search_charts`).** 7 → 10 outils, soit +43 % de surface, et surtout un trou de découvrabilité : un agent qui cherche « graphique en barres DSFR » via `search_components` ne trouve rien et part inventer un `fr-chart` ou du Chart.js brut. C'est exactement le mode d'échec que ce serveur existe pour éviter.

**Coût assumé.** Une ligne dans `list_components` qui ne porte pas `sections` mais `tool: "get_chart_doc"` : la frontière est structurelle, pas seulement lexicale.

---

## 2. Cloner dsfr-chart depuis git, pas depuis npm

**Décision.** `git clone --sparse` au tag `DSFR_CHART_TAG` (défaut `v2.1.1`), même mécanique que pour le DSFR, dans `.dsfr-chart-repo/`.

**Pourquoi npm est éliminé.** Le `package.json` amont déclare `"files": ["dist/*", "README.md", "CONTRIBUTING.md", "CHANGELOG.md"]`. Le tarball ne contient donc **pas** `src/`. Or `src/components/*.vue` (les props avec leur type, leur caractère obligatoire et leur défaut) et `src/assets/colors.json` sont les seules sources fiables pour ce que le README énonce de façon incomplète. Et `dist/` est du JS minifié, inexploitable.

**Pourquoi pas un fichier statique versionné dans le dépôt.** Il dupliquerait 57 Ko d'amont, créerait une seconde source de vérité et pourrirait en silence, alors que le projet a déjà un pipeline de fetch automatisé (`refresh-docs.yml`, quotidien).

**Tag épinglé en dur, jamais `main` ni `latest`.** `prepublishOnly` lance `fetch-docs` : une release amont ratée casserait sinon une publication npm de ce serveur. Même discipline que `DSFR_TAG`.

---

## 3. Le code fait autorité sur l'existence, le README sur le sens

**Décision.** Pour chaque graphique, la liste des attributs vient des props Vue ; la description vient du README. Un attribut présent dans le code mais absent du README est **conservé** et marqué `documented: false`.

**Pourquoi.** Le README amont est incomplet, et sur un point faux. Vérifié composant par composant : les lignes de repère (`vline`, `hline` et leurs variantes), le drill-down (`sub-x`, `sub-y`), `scale-min`/`scale-max` du radar et **l'intégralité de `table-chart`** n'y figurent pas. Le README documente par ailleurs `trend` comme `(String)` là où le code déclare `[Number, String]`.

Il est aussi inégalement structuré : les trois attributs `databox-*`, communs aux dix graphiques, sont décrits en prose dans la section DataBox et non dans la liste de paramètres de chaque graphique. Le parseur les y récupère et les applique à tous les graphiques qui les déclarent, ce qui porte la couverture de 111 à 141 attributs décrits sur 175.

Ne garder que le README amputerait la doc servie ; ne garder que le code la rendrait inintelligible. Le drapeau `documented` dit la vérité sur la provenance, ce qui vaut mieux que de choisir un camp en silence. Même logique pour `table-chart`, gardé avec `documented: false` plutôt que supprimé.

**Cas limite traité explicitement.** Les tableaux « Résumé des paramètres de MapChart » marquent `value` et `name` comme obligatoires alors que le composant leur donne une valeur par défaut. Le champ `required` suit le code ; la description porte la mention « documenté comme obligatoire en amont, bien que le composant déclare une valeur par défaut ». Signaler l'écart est plus utile que trancher.

**Limite assumée, à ne pas franchir.** La composition palette → couleurs vit dans `src/utils/colors.js` (`choosePalette`, `getSequentialAscending`…), pas dans la doc. Elle n'a aucun contrat publié et changera sans préavis : le serveur livre la table de jetons verbatim et les 7 noms de palettes, et rien de plus.

---

## 4. Le parseur du README s'ancre sur le contenu, pas sur la profondeur des titres

**Décision.** Un graphique est repéré par la phrase ``balise : `<tag>` ``, et il possède le titre qui la précède, quel qu'en soit le niveau. Les sections transverses sont repérées par leur intitulé.

**Pourquoi.** La hiérarchie de titres du README amont ment, de deux façons :

- `MapChartReg` est documenté en **H3 imbriqué** dans `# Cartes (MapChart)`. Un découpage par H1 le ferait disparaître, ou pire, attribuerait sa prop `region` à `map-chart` — qui ne l'a pas — et la prop `level` de `map-chart` à `map-chart-reg`, qui ne l'a pas non plus.
- `## Gestion des couleurs` et `## Accessibilité` sont syntaxiquement sous `# DataBox`, alors qu'elles sont transverses.

L'ancrage par contenu traite les deux. La plage d'un graphique imbriqué est en outre **découpée dans celle de son parent le plus proche**, pour que `map-chart` conserve ses propres notes et exemples au lieu de se les faire voler.

Deux exceptions sont codées explicitement, parce que l'amont ne suit pas sa propre convention : `DataBox`, dont le README ne donne aucune phrase `balise :`, est ancré sur son titre H1 ; `table-chart`, absent du README, est reconstruit depuis le composant Vue avec un titre codé en dur et `documented: false`. La règle couvre donc 9 des 11 graphiques, les deux autres étant traités nommément.

**Coût assumé.** Le parseur connaît quelques intitulés amont (`Gestion des couleurs`, `Accessibilité`, `Mise en place du graphique`, trois formats de section de paramètres). Un renommage en amont les fait manquer. C'est couvert par un test d'intégrité qui exige quatre guides d'au moins 500 caractères, donc l'oubli est visible plutôt que silencieux.

---

## 5. `docs/charts.json` unique, pas d'arborescence `docs/chart/`

**Décision.** Un seul fichier JSON (≈95 Ko), chargé en entier dans `buildDsfrData`, sans `LRUCache` ni lecture disque au runtime.

**Pourquoi.** L'arborescence `docs/<category>/<name>/*.md` existe parce que l'amont DSFR **est** une arborescence de markdown, et parce qu'un `code.md` pèse parfois des centaines de lignes. dsfr-chart, c'est un README de 1315 lignes, déjà structuré en paramètres obligatoires / optionnels / exemples. Le parser une fois au build est strictement supérieur à le redécouper à chaque requête. Le poids est du même ordre que `icons.json` (105 Ko), déjà chargé de la même façon.

---

## 6. Détection de structure plutôt que de version pour les couleurs

**Décision.** `resolveColorDocs()` déduit la disposition de l'arborescence, pas du numéro de tag : présence de `core/color/usage.md` **et** absence de `core/palette/overview.md`. Chaque page retenue est ensuite confirmée par son contenu — une page de décisions porte des lignes `$background-*`, une page de palette porte des blocs `::::fr-table[…]` — avant d'être acceptée.

**Pourquoi.** Le README documente `DSFR_TAG=v1.14.3 pnpm run fetch-docs`, et la CI `refresh-docs.yml` rejoue le fetch chaque nuit. Le script doit rester utilisable sur les deux dispositions. Tester le tag imposerait de maintenir une table de correspondance version → chemins ; tester la présence du fichier est auto-descriptif et ne se périme pas.

**Pourquoi deux signaux et une validation, et pas juste un test d'existence.** Sur un signal unique, un renommage amont de `color/usage` ferait silencieusement retomber dans la branche « héritée », qui déclarerait la page de *palette* 1.15 comme page de décisions : zéro token, zéro famille, et aucune erreur. C'est exactement le mode de panne que cette PR corrige ; le reproduire dans le correctif aurait été dommage.

**Corollaire.** Les expressions régulières de parsing n'ont **pas** été touchées : simulation faite sur les fichiers réels des deux versions, le format des tableaux amont est identique (30 tokens de décision, 24 familles — dont 4 lues directement dans les tableaux et 20 dérivées —, 17 illustratives). Seuls les chemins changent. Vérifié de bout en bout : `DSFR_TAG=v1.14.3 DSFR_CHART_TAG=v2.0.5 pnpm run fetch-docs` puis `pnpm test` donne 137 tests verts, comme sur 1.15.3.

---

## 7. Trois filets de robustesse, à trois moments différents

**Décision.** Assertions plancher dans `fetch-docs` **et** tests d'intégrité en CI **et** `meta.json` enrichi exposé au client. Les trois, pas l'un ou l'autre.

**Pourquoi.** La régression qui motive tout ce travail est passée à travers 69 tests verts, parce que les fixtures de test sont synthétiques et découplées du pipeline d'extraction. Chaque filet couvre un moment que les autres ne couvrent pas :

| Filet | Moment | Ce qu'il empêche |
|---|---|---|
| Seuils plancher dans `fetch-docs` | build / `prepublishOnly` | publier un paquet amputé sur npm |
| `integrity.test.ts` sur le `docs/` réel | CI | merger une extraction dégradée |
| `meta.json` + versions dans `list_components` | runtime | qu'un client ignore ce qu'il consomme |

Les compteurs de `meta.json` sont la source unique des deux premiers : une seule donnée protège le build et informe le client.

**Seuils volontairement bas** (70 entrées, 500 icônes, 25 tokens…), pas des égalités exactes : ils doivent tolérer l'évolution normale de l'amont tout en attrapant une source qui a bougé. Une égalité stricte se transformerait en bruit à chaque montée de version mineure, et finirait par être relâchée.

**Vérification des filets eux-mêmes.** Un garde-fou jamais vu échouer n'en est pas un. Les deux ont été testés en les cassant volontairement : `colors.json` vidé → 5 tests d'intégrité rouges ; classes `fr--` réintroduites → 2 tests rouges ; chemin de source cassé → `fetch-docs` sort en code 1 avec le détail ligne à ligne.

---

## 8. Tout le réseau avant la destruction de `docs/`

**Décision.** Les deux dépôts amont sont clonés au tout début du script ; `rmSync(docs/)` ne vient qu'ensuite.

**Pourquoi.** `fetch-docs` supprime `docs/` puis le reconstruit en place. Si le clone de dsfr-chart avait lieu après — l'ordre naturel de lecture du script — une coupure réseau, un dépôt indisponible ou un tag retiré laisserait le corpus versionné détruit et à moitié réécrit, dans un dépôt de travail ou sur le runner du cron nocturne. Regrouper les appels réseau en amont fait qu'un échec laisse `docs/` intact.

---

## 9. Ce qui n'a pas été fait, et pourquoi

**Ingérer les pages `*/search` de DSFR 1.15.** `color/search`, `icon/search` et `pictogram/search` sont des coquilles de 26 lignes contenant une directive `::dsfr-doc-filter` rendue côté client. Les ingérer ajouterait trois entrées d'index sans valeur et du bruit dans `search_components`. L'amont les marque lui-même `sitemap: noindex` et `boost: 0`.

**Rendre la boucle « core » récursive.** Ce serait le réflexe, mais ici un contresens : elle avalerait précisément les trois coquilles ci-dessus. Seule `color/usage` est exposée, comme une section de l'entrée `color` — cohérent avec ce que `processDocDir` fait déjà pour les composants.

**Coder en dur les 6 alias d'icônes manquants** (`fr-icon-account-*`, `delete-*`, `play-*`). Ils existent dans le CSS publié mais n'ont pas de SVG dédié. Les ajouter créerait une liste d'alias amont à maintenir à la main, pour un gain nul en pratique : `search_icons("delete")` renvoie déjà `delete-bin-line`, qui fonctionne. Documenté comme dette.

**Rétro-ingénierer le mécanisme de palettes de dsfr-chart.** Voir §3.

**Migrer `pnpm.overrides` vers `pnpm-workspace.yaml`.** pnpm 10.28+ ne lit plus le champ `pnpm` de `package.json` et le signale à chaque commande. Les surcharges de sécurité survivent dans le lockfile, donc `--frozen-lockfile` les applique toujours — mais elles disparaîtraient à la première régénération. Réel, mais sans rapport avec cette montée de version : à traiter séparément pour ne pas mélanger les sujets dans une même PR.
