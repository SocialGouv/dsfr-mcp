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
