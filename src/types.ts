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
