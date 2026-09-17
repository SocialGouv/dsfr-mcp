<!-- Extrait verbatim du README de @gouvfr/dsfr-chart v2.1.1, réduit aux
     sections nécessaires aux tests du parseur. Ne pas reformater : le but
     est précisément de figer les tics de mise en forme de l'amont. -->

# DSFR Chart

DSFR Chart est un module complémentaire au Système de design de l’État (DSFR) pour la visualisation de données. Il s’agit d'une bibliothèque de web-components, implementés sous [Vue.js](https://vuejs.org/), à destination des développeurs ayant besoin de graphiques pour représenter des données.

## Demo

L’ensemble des graphiques disponibles sont mis en situation sur la page de [demo](https://gouvernementfr.github.io/dsfr-chart/).

## Installation

L’installation de **DSFR Chart** peut se faire de manières différentes. En téléchargeant l’ensemble des fichiers nécessaires à son utilisation ou en utilisant le gestionnaire de paquets **NPM**.

# Graphiques disponibles

Ce catalogue présente l’ensemble des graphiques disponibles dans le module complémentaire au Système de design de l’État (DSFR) pour la visualisation de données. Les différents types de graphiques sont disponibles en thème clair et thème sombre. Par ailleurs, les options de chacun des graphiques sont également présentés dans ce document.

# Graphique en ligne (LineChart)

Les graphiques en ligne sont accessibles à travers la balise : `<line-chart>`.

## Paramètres

### Obligatoires :

- **x** : _(String)_ Les valeurs sur l’axe des abscisses sous forme d'une liste entre crochets.
- **y** : _(String)_ Les valeurs sur l’axe des ordonnées sous forme d'une liste entre crochets.

### Optionnels :

- **name** : _(String)_ Les noms des séries de données sous forme d'une liste entre crochets.
- **unit-tooltip** : _(String)_ Permet de spécifier l’unité à afficher dans l’infobulle (tooltip) du graphique. Par exemple, `%`, `€`, `$`, etc.
- **x-min** : Permet de définir le minimum sur l’axe des abscisses.
- **x-max** : Permet de définir le maximum sur l’axe des abscisses.
- **y-min** : Permet de définir le minimum sur l’axe des ordonnées.
- **y-max** : Permet de définir le maximum sur l’axe des ordonnées.
- **date** : _(String)_ Permet d'afficher une date associée au graphique.
- **aspect-ratio** : _(String)_ Permet de définir le ratio largeur/hauteur du graphique. Par défaut, le ratio est de `2`.
- **selected-palette** : _(String)_ Permet de choisir la palette de couleurs utilisée pour le graphique. Les valeurs possibles sont :
  - `'default'` : Couleur par défaut.
  - _(laisser vide pour utiliser la palette par défaut)_
  - `'neutral'` : Palette neutre.
  - `'categorical'` : Palette catégorielle par défaut.
  - `'sequentialAscending'` : Palette séquentielle ascendante.
  - `'sequentialDescending'` : Palette séquentielle descendante.
  - `'divergentAscending'` : Palette divergente ascendante.
  - `'divergentDescending'` : Palette divergente descendante.

---

### 1. Graphique en ligne simple

**Exemple**:

```html
<line-chart
  x="[[1, 2, 3, 4]]"
  y="[[10, 20, 30, 40]]"
></line-chart>
```

---

### 2. Graphique en ligne avec palette divergente ascendante

**Exemple**:

```html
<line-chart
  x="[[1, 2, 3, 4]]"
  y="[[10, 20, 30, 40]]"
  selected-palette="divergentAscending"
></line-chart>
```

---

### 3. Graphique en ligne avec unité personnalisée dans l’infobulle

**Exemple**:

```html
<line-chart
  x="[[1, 2, 3, 4]]"
  y="[[1000, 2000, 3000, 4000]]"
  unit-tooltip="€"
></line-chart>
```

---

### 4. Graphique en ligne avec deux courbes

**Exemple**:

```html
<line-chart
  x="[[1, 2, 3], [1, 2, 3]]"
  y="[[30, 10, 20], [10, 20, 30]]"
  unit-tooltip="%"
></line-chart>
```

---

## Notes supplémentaires

- **unit-tooltip** : Ce paramètre vous permet de spécifier l’unité qui sera affichée dans l’infobulle (tooltip) lorsque l’utilisateur survole un point du graphique. Cela rend la lecture des valeurs plus intuitive en indiquant l’unité de mesure.
- **selected-palette** : Ce paramètre vous permet de personnaliser les couleurs utilisées dans le graphique. Choisissez parmi les options disponibles pour représenter vos données de manière appropriée.

---

## Conseils d'utilisation

- **Format des données** : Assurez-vous que les valeurs de `x` et `y` sont des chaînes représentant des listes, par exemple `x="[1, 2, 3]"`.
- **Combinaison des options** : Vous pouvez combiner plusieurs options pour personnaliser davantage votre graphique, par exemple en utilisant `selected-palette` avec `unit-tooltip`.
- **Personnalisation des séries** : Chaque série de données sera représentée par une ligne distincte. Les couleurs des lignes seront attribuées en fonction de la palette sélectionnée.

---

## Exemple combinant plusieurs options

**Exemple**:

```html
<line-chart
  x="[[1, 2, 3, 4, 5]]"
  y="[[15, 25, 35, 45, 55]]"
  selected-palette="categorical"
  unit-tooltip="kWh"
></line-chart>
```

# Cartes (MapChart)

Les cartes sont accessibles à travers la balise : `<map-chart>`.

## Paramètres

### Obligatoires :

- **data** : _(String)_ Un dictionnaire qui, pour chaque numéro de département, de région ou de pays, associe la valeur de l’indicateur dans cette zone géographique.

### Optionnels :

- **name** : _(String)_ Nom de l’indicateur.
- **value** : _(Number | String)_ La valeur de l’indicateur à l’échelle nationale. Cette valeur sera affichée dans la barre latérale.
- **level** : _(String)_ Choix du niveau de zoom. Les valeurs possibles sont :
  - `'dep'` : Carte avec découpage par départements (par défaut).
  - `'reg'` : Carte avec découpage par régions.
  - `'aca'` : Carte avec découpage par académies.
  - `'monde'` : Carte avec découpage par pays du monde.
- **date** : _(String)_ Permet d'afficher une date associée au graphique.
- **selected-palette** : _(String)_ Permet de choisir la palette de couleurs utilisée pour la carte. Les valeurs possibles sont :
  - `'categorical'`
  - `'sequentialAscending'` (par défaut)
  - `'sequentialDescending'`
  - `'divergentAscending'`
  - `'divergentDescending'`
  - `'neutral'`
  - _(laisser vide pour utiliser la palette par défaut)_

---

## Exemples

### 1. Carte avec découpage par départements

## Exemple :

```html
<map-chart
  data='{
    "01": 10, "02": 83, "03": 67, "04": 6, "05": 47, "06": 96, "07": 77, "08": 75,
    "09": 57, "10": 58, "11": 28, "12": 33, "13": 89, "14": 24, "15": 5, "16": 41,
    "17": 79, "18": 8, "19": 42, "2A": 63, "2B": 16, "21": 25, "22": 26, "23": 37,
    "24": 65, "25": 88, "26": 48, "27": 61, "28": 80, "29": 99, "30": 71, "31": 5,
    "32": 0, "33": 86, "34": 19, "35": 13, "36": 32, "37": 59, "38": 82, "39": 13,
    "40": 78, "41": 92, "42": 9, "43": 22, "44": 70, "45": 85, "46": 58, "47": 72,
    "48": 61, "49": 27, "50": 47, "51": 41, "52": 44, "53": 29, "54": 22, "55": 4,
    "56": 57, "57": 96, "58": 46, "59": 33, "60": 0, "61": 15, "62": 60, "63": 100,
    "64": 98, "65": 77, "66": 51, "67": 67, "68": 19, "69": 44, "70": 92, "71": 93,
    "72": 51, "73": 32, "74": 19, "75": 96, "76": 91, "77": 21, "78": 48, "79": 72,
    "80": 52, "81": 48, "82": 57, "83": 38, "84": 23, "85": 46, "86": 37, "87": 64,
    "88": 78, "89": 72, "90": 85, "91": 87, "92": 46, "93": 89, "94": 18, "95": 56,
    "971": 48, "972": 64, "973": 6, "974": 70, "976": 38
  }'
  value="10"
  name="Nom de l’indicateur"
  level="dep"
  date="11/02/2025"
></map-chart>
```

---


### 5. Carte régionale détaillée (MapChartReg)

Les cartes par région sont accessibles à travers la balise : `<map-chart-reg>`.

#### Paramètres spécifiques :

- **data** : _(String)_ Un dictionnaire qui, pour chaque numéro de département, associe la valeur de l’indicateur dans ce département au sein d'une région spécifique. Seul les numéro de départements de la région seront affichés et sont obligatoires.
- **region** : _(String)_ Code de la région à afficher.

## Exemple :

```html
<map-chart-reg
  data='{
    "08": 9, "10": 17, "51": 69, "52": 0, "54": 39,
    "55": 11, "57": 45, "67": 100, "68": 42, "88": 18
  }'
  value="10"
  name="Nom de l’indicateur"
  region="GES"
  date="11/02/2025"
></map-chart-reg>
```

---

## Notes supplémentaires

- **selected-palette** : Ce paramètre vous permet de personnaliser les couleurs utilisées sur la carte. Les palettes disponibles permettent de représenter les données selon différentes échelles de couleurs.
- **level** : Par défaut, la carte affiche le découpage par départements (`'dep'`). En spécifiant `'reg'`, vous pouvez afficher la carte avec le découpage par régions. Vous pouvez également utiliser `'aca'` pour afficher la carte avec le découpage par académies.= ou `'monde'` pour une carte mondiale.

---

## Conseils d'utilisation

- **Format des données** :
  - Départements : Les clés du dictionnaire `data` doivent correspondre aux codes des départements au format ISO 3166-2 (par exemple, `'75'` pour Paris, `'67'` pour le Bas-Rhin).
  - Régions : Les clés du dictionnaire `data` doivent correspondre aux codes des régions au format ISO 3166-2 (par exemple, `'IDF'` pour l’Île-de-France, `'GES'` pour le Grand Est).
  - Académies : Les clés du dictionnaire `data` doivent correspondre aux codes des académies (par exemple, `'PARIS'` pour l’académie de Paris, `'STRASBOURG'` pour l’académie de Strasbourg).
  - Pays du monde : Les clés du dictionnaire `data` doivent correspondre aux codes des pays au format ISO 3166-1 alpha-2 (par exemple, `'FR'` pour la France, `'US'` pour les États-Unis).

- **Combinaison des options** : Vous pouvez combiner plusieurs options pour personnaliser votre carte.

---

## Résumé des paramètres de MapChart

| **paramètre**    | **type**                                | **obligatoire** | **description**                                                                                  |
|------------------|-----------------------------------------|-----------------|--------------------------------------------------------------------------------------------------|
| data             | String                                  | oui             | dictionnaire associant les codes des départements aux valeurs de l’indicateur                    |
| value            | String ou Number                        | oui             | Valeur de l’indicateur à l’échelle nationale                                                     |
| name             | String                                  | oui             | Nom de l’indicateur                                                                              |
| level            | String ('dep', 'reg', 'aca' ou 'monde') | non             | Niveau de zoom de la carte ('dep' pour départements, 'reg' pour régions et 'aca' pour académies) |
| date             | String                                  | non             | Date de référence de l’indicateur                                                                |
| selected-palette | String                                  | non             | Palette de couleurs utilisée pour la carte                                                       |

## Résumé des paramètres de MapChartReg

| **paramètre**    | **type**         | **obligatoire** | **description**                                                               |
|------------------|------------------|-----------------|-------------------------------------------------------------------------------|
| data             | String           | oui             | dictionnaire associant les codes des départements aux valeurs de l’indicateur |
| value            | String ou Number | oui             | valeur de l’indicateur à l’échelle régionale                                  |
| name             | String           | oui             | nom de l’indicateur                                                           |
| region           | String           | oui             | code de la région à afficher                                                  |
| date             | String           | non             | Date de référence de l’indicateur                                             |
| selected-palette | String           | non             | palette de couleurs utilisée pour la carte                                    |

---

# DataBox

Le composant `DataBox` est un composant permettant d’afficher dans un cadre normé des données sous différentes formes (graphiques, chiffres clés, tableaux, etc.). Il est à utiliser pour composer un tableau de bord, ou toute page nécessitant de structurer la visualisation de données.

Polyvalente, la databox intègre également des fonctionnalités interactives telles que des sélecteurs de sources, des modales, et des menus déroulants permettant la mise à disposition d’actions supplémentaires.

## Utilisation classique avec toutes les options :

```html
<data-box
  id="abc"
  name="Emplois en France de 1926 à 1950"
  heading-level="h3"
  description="Description du graphique <b>avec du HTML</b>"
  tooltip-title="Emplois en France"
  tooltip-content="Nombre d'emplois en France de 1926 à 1950, par genre. Se base sur les données de l’INSEE et de Pôle Emploi et d'une autre source."
  modal-title="Titre de la modale"
  modal-content="Contenu de la modale"
  source="INSEE, Pôle Emploi, Autre source"
  date="2021-01-01"
  text-ia="Données générées par Intelligence Artificielle (IA)"
  link-ia="https://www.info.gouv.fr/actualite/lintelligence-artificielle"
  default-source="pole-emploi"
  trend="5%"
  segmented-control="true"
  fullscreen="true"
  screenshot="true"
  download="true"
  actions='["Source officielle", "Pôle emploi"]'
></data-box>
```

## Props

Voici la liste des props disponibles pour le composant `DataBox` :

### Obligatoires

- **id** `(String)` : identifiant unique de la DataBox
- **name** `(String)` : titre de la DataBox
- **source** `(String)` : source des données affichées
- **date** `(String)` : date des données affichées

### Optionnelles

- **value** `(Number | String)` (défaut : '') : valeur de la tooltip si chiffre clé
- **heading-level** `(String)` (défaut : 'h3') : niveau du titre de la DataBox (h1, h2, h3, h4, h5, h6)
- **description** `(String)` (défaut : '') : description de la tooltip (HTML possible)
- **tooltip-title** `(String)` (défaut : '') : titre de la tooltip
- **tooltip-content** `(String)` (défaut : '') : contenu de la tooltip
- **modal-title** `(String)` (défaut : '') : titre de la modale
- **modal-content** `(String)` (défaut : '') : contenu de la modale
- **text-ia** `(String)` (défaut : '') : texte indiquant que les données ont été générées par une IA
- **link-ia** `(String)` (défaut : '') : lien vers une page d'information sur l’IA ou la source des données générées par l’IA
- **default-source** `(String)` (défaut : null) : source à afficher par défaut
- **trend** `(String)` (défaut : null) : tendance de l’évolution des données
- **segmented-control** `(Boolean)` (défaut : true) : afficher le système de vue graphique/tableau
- **fullscreen** `(Boolean)` (défaut : false) : donner la possibilité d'ouvrir le graphique dans une modale
- **screenshot** `(Boolean)` (défaut : false) : permettre une capture d'écran de la DataBox
- **download** `(Boolean)` (défaut : false) : télécharger les données du graphique au format CSV
- **actions** `(Array)` (défaut : []) : liste des actions supplémentaires à afficher dans le menu (pour se greffer par la suite avec l’id)

### Mise en place du graphique et de son alternative

L’ensemble de ces informations permettront d'afficher une databox sans graphique.

Pour y intégrer un graphique, il faut juxtaposer la balise d'un graphique en spécifiant les attributs suivants qui permettront de faire le lien entre la Databox et le graphique :

- databox-id : identifiant de la DataBox
- databox-type : valeurs possibles : "chart" pour la vue du graphique et "table" pour la vue du tableau d'alternative textuelle
- databox-source : correspond au paramètre defaultSource de la DataBox

```html
<data-box
  id="abc"
  name="Emplois en France de 1926 à 1950"
  heading-level="h3"
  description="Description du graphique <b>avec du HTML</b>"
  tooltip-title="Emplois en France"
  tooltip-content="Nombre d'emplois en France de 1926 à 1950, par genre. Se base sur les données de l’INSEE et de Pôle Emploi et d'une autre source."
  modal-title="Titre de la modale"
  modal-content="Contenu de la modale"
  source="INSEE, Pôle Emploi, Autre source"
  date="2021-01-01"
  default-source="pole-emploi"
  trend="5%"
  segmented-control="true"
  fullscreen="true"
  screenshot="true"
  download="true"
  actions='["Source officielle", "Pôle emploi"]'
></data-box>

<scatter-chart
  databox-id="abc"
  databox-type="chart"
  databox-source="pole-emploi"
  x="[[1926, 1928, 1930, 1932, 1934, 1936, 1938, 1940, 1942, 1944, 1946, 1948, 1950, 1952], [1926, 1928, 1930, 1932, 1934, 1936, 1938, 1940, 1942, 1944, 1946, 1948, 1950, 1952], [1926, 1928, 1930, 1932, 1934, 1936, 1938, 1940, 1942, 1944, 1946, 1948, 1950, 1952]]"
  y="[[35, 35, 37, 37, 39, 41, 43, 48, 51, 52, 54, 55, 55, 58], [76, 83, 82, 80, 81, 80, 81, 80, 81, 80, 79, 75, 72, 72], [54, 56, 58, 57, 59, 60, 62, 64, 66, 66, 66, 65, 64, 65]]"
  name='["Femmes", "Hommes", "Ensemble"]'
  unit-tooltip="%"
  show-line="true"
></scatter-chart>

<table-chart
  databox-id="abc"
  databox-type="table"
  databox-source="pole-emploi"
  x="[1926, 1928, 1930, 1932, 1934, 1936, 1938, 1940, 1942, 1944, 1946, 1948, 1950]"
  y="[[48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60], [61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73], [55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67]]"
  name='["Femmes", "Hommes", "Ensemble"]'
  table-name="Années"
></table-chart>
```

## Gestion des couleurs

Un graphique étant par définition une représentation visuelle d’un ensemble de données, la couleur est un paramètre avec lequel il est possible de jouer pour en améliorer la compréhension et la perception. Une utilisation appropriée des couleurs est par conséquent essentielle pour réussir vos graphiques.

Dans DSFR Chart, le paramètre `selectedPalette` vous permet de personnaliser les couleurs utilisées dans le graphique. Choisissez parmi les options disponibles pour représenter vos données de manière appropriée :

- `'default'` : Couleur par défaut.
- `'neutral'` : Palette neutre.
## Accessibilité

> Utilisés seuls, les graphiques du DSFR Charts sont inaccessibles aux personnes aveugles, déficientes visuelles et aux personnes handicapées motrices. Il conviendra donc d’apporter une alternative textuelle pertinente à chaque fois qu’un graphique est affiché.

### Non-conformités

Les principales problématiques posées par les graphiques sont les suivantes :

- Accès aux données des graphiques et aux cartes impossibles (critères 1.1, 1.6, 4.8, 4.9 du RGAA)
- Accès et contrôle au clavier impossible (critères 4.12, 10.13, 10.14 du RGAA)
- Information donnée uniquement par la couleur (critère 3.1 du RGAA)
- Contrastes de couleurs non textuels (critère 3.3 du RGAA)

### Alternatives accessibles

## Contribution

Le processus de contribution est détaillé sur la page [CONTRIBUTING.md](CONTRIBUTING.md).
