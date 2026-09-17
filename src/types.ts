export interface ComponentEntry {
  name: string;
  title: string;
  description: string;
  category: "component" | "core" | "layout" | "pattern";
  sections: string[];
}

export interface SearchResult {
  name: string;
  title: string;
  category: string;
  matchType: string;
  excerpt: string;
}

export interface ToolTextResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
}

export interface IconEntry {
  name: string;
  category: string;
  variants: string[];
  classes: string[];
}

export interface ColorDecisionToken {
  token: string;
  context: "background" | "text" | "artwork";
  description: string;
  light: string;
  dark: string;
}

export interface ColorFamily {
  name: string;
  category: "primaire" | "neutre" | "systeme" | "illustrative";
  correspondences: Record<string, { light: string; dark: string }>;
}

export interface ColorsIndex {
  decisionTokens: ColorDecisionToken[];
  families: ColorFamily[];
  illustrativeNames: string[];
}

export interface KeyboardInteraction {
  key: string;
  action: string;
}

export interface AccessibilityGuideline {
  type: "do" | "dont";
  label: string;
  caption: string;
}

export interface ContrastRow {
  state: string;
  lightTheme: string;
  darkTheme: string;
}

export interface ContrastTable {
  label: string;
  rows: ContrastRow[];
}

export interface RgaaCriteria {
  topic: string;
  criteria: string[];
}

export interface AccessibilityReference {
  label: string;
  url: string;
}

export interface ComponentAccessibility {
  name: string;
  title: string;
  keyboardInteractions: KeyboardInteraction[];
  rules: {
    text: string;
    guidelines: AccessibilityGuideline[];
  };
  contrasts: ContrastTable[];
  screenReader: string;
  rgaaCriteria: RgaaCriteria[];
  references: AccessibilityReference[];
  cleanedMarkdown: string;
}

// Keyed by component name (ComponentEntry.name) for O(1) lookup;
// a missing key means the component has no accessibility section.
export type AccessibilityIndex = Record<string, ComponentAccessibility>;

// --- DSFR Chart (@gouvfr/dsfr-chart) ---------------------------------------
// Les graphiques ne sont pas des composants CSS DSFR mais des web-components
// Vue.js d'un paquet npm distinct : ils sont donc indexés à part, avec leurs
// attributs HTML plutôt que des classes `fr-*`.

export interface ChartParam {
  /** Attribut HTML, en kebab-case (ex : "unit-tooltip"). */
  name: string;
  /** Prop Vue correspondante, en camelCase (ex : "unitTooltip"). */
  prop: string;
  /** Type déclaré par le composant (ex : "String", "Number | String"). */
  type: string;
  required: boolean;
  default?: string;
  /** Description issue du README amont ; vide si le paramètre n'y figure pas. */
  description: string;
  allowedValues?: string[];
  /** false quand la prop existe dans le code mais est absente du README. */
  documented: boolean;
}

export interface ChartExample {
  label: string;
  code: string;
}

export interface ChartEntry {
  /** Nom de la balise, identifiant canonique (ex : "bar-chart"). */
  name: string;
  /** Balise complète (ex : "<bar-chart>"). */
  tag: string;
  /** Composant Vue source (ex : "BarChart"). */
  component: string;
  title: string;
  description: string;
  /** Formes alternatives acceptées à la résolution (PascalCase, sans tiret…). */
  aliases: string[];
  /** false quand le web-component existe mais n'a pas de section dans le README. */
  documented: boolean;
  params: ChartParam[];
  examples: ChartExample[];
  notes: string[];
}

/** Sujet transverse du README amont (installation, couleurs, accessibilité…). */
export interface ChartGuide {
  name: string;
  title: string;
  markdown: string;
}

export interface ChartPalette {
  name: string;
  description: string;
}

export interface ChartColorToken {
  token: string;
  light: string;
  dark: string;
}

export interface ChartsIndex {
  version: string;
  package: string;
  repository: string;
  charts: ChartEntry[];
  guides: ChartGuide[];
  palettes: ChartPalette[];
  colorTokens: ChartColorToken[];
}

// --- Métadonnées du corpus -------------------------------------------------

export interface DocsCounts {
  entries: number;
  icons: number;
  iconClasses: number;
  decisionTokens: number;
  colorFamilies: number;
  illustrativeNames: number;
  accessibilityComponents: number;
  charts: number;
  /** Charts with a dedicated section in the upstream README. */
  documentedCharts: number;
  /** Chart attributes carrying a description read from the upstream README. */
  documentedChartParams: number;
}

export interface DocsMeta {
  /** Version du format de docs/ ; à incrémenter quand la structure change. */
  schemaVersion: number;
  dsfrVersion: string;
  dsfrCommit: string;
  dsfrRepository: string;
  dsfrChartVersion: string;
  dsfrChartCommit: string;
  dsfrChartRepository: string;
  fetchedAt: string;
  counts: DocsCounts;
}
