// Pure, side-effect-free parser that turns a DSFR `accessibility/index.md`
// document into a structured `ComponentAccessibility` object. Kept separate
// from fetch-docs.ts (which clones a repo and deletes docs/ on import) so it
// can be unit-tested directly against the real markdown.

import type {
  ComponentAccessibility,
  KeyboardInteraction,
  AccessibilityGuideline,
  ContrastRow,
  ContrastTable,
  RgaaCriteria,
  AccessibilityReference,
} from "../src/types.js";

const NBSP = / |&nbsp;/g;

/**
 * Normalize inline content: drop nbsp and <br>, strip real HTML tags (keeping
 * their inner text), and collapse whitespace. Inline code spans (`...`) are kept
 * verbatim so literal markup like `<h1>` or `<button type="submit">` survives.
 */
export function cleanInline(s: string): string {
  const normalized = s.replace(NBSP, " ").replace(/<br\s*\/?>/gi, " ");
  const out = normalized
    .split(/(`[^`]*`)/)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") && part.length > 1
        ? part
        : part.replace(/<[^>]*>/g, ""),
    )
    .join("");
  return out.replace(/\s+/g, " ").trim();
}

function stripFrontmatter(content: string): string {
  const m = content.match(/^---\n[\s\S]*?\n---\n?/);
  return m ? content.slice(m[0].length) : content;
}

function normalizeHeading(s: string): string {
  return cleanInline(s)
    .replace(/’/g, "'")
    .replace(/\*/g, "")
    .replace(/[:?]\s*$/, "")
    .toLowerCase()
    .trim();
}

interface RawSection {
  level: number;
  title: string; // normalized, lowercased
  bodyLines: string[]; // raw lines of section content (heading excluded)
}

/**
 * Split the body into sections keyed by heading text. A section spans from its
 * heading until the next heading of the same-or-shallower level. Matching by
 * text (not a fixed level) tolerates files that use ## instead of ### (e.g. connect).
 */
function splitSections(body: string): RawSection[] {
  const lines = body.split("\n");
  const headings: { idx: number; level: number; title: string }[] = [];
  lines.forEach((line, idx) => {
    const m = line.match(/^(#{2,5})\s+(.*)$/);
    if (m) headings.push({ idx, level: m[1].length, title: normalizeHeading(m[2]) });
  });

  const sections: RawSection[] = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    let endIdx = lines.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) {
        endIdx = headings[j].idx;
        break;
      }
    }
    sections.push({ level: h.level, title: h.title, bodyLines: lines.slice(h.idx + 1, endIdx) });
  }
  return sections;
}

function findSection(sections: RawSection[], keyword: string): RawSection | undefined {
  return sections.find((s) => s.title.includes(keyword));
}

function parseKeyboard(section?: RawSection): KeyboardInteraction[] {
  if (!section) return [];
  const lines = section.bodyLines;
  if (/aucune\s+interaction/i.test(lines.join("\n"))) return [];

  const out: KeyboardInteraction[] = [];
  for (let i = 0; i < lines.length; i++) {
    const top = lines[i].match(/^-\s+(.*)$/); // top-level bullet only (no indent)
    if (!top) continue;

    const raw = cleanInline(top[1]).replace(/`/g, "");
    const cm = raw.match(/^(.+?)\s*[:：]\s*(.*)$/);
    let key: string;
    let action: string;
    if (cm) {
      key = cm[1].trim();
      action = cm[2].trim();
    } else {
      key = raw.trim();
      action = "";
    }

    if (!action) {
      const subs: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s+-\s+/.test(lines[j])) {
          subs.push(cleanInline(lines[j].replace(/^\s*-\s+/, "")).replace(/`/g, ""));
        } else if (lines[j].trim() === "") {
          continue;
        } else {
          break;
        }
      }
      action = subs.join(" ");
    }

    if (key) out.push({ key, action });
  }
  return out;
}

function parseGuidelines(bodyLines: string[]): AccessibilityGuideline[] {
  const out: AccessibilityGuideline[] = [];
  for (let i = 0; i < bodyLines.length; i++) {
    const m = bodyLines[i].match(/^:::dsfr-doc-guideline\[(.*?)\]\{(.*?)\}/);
    if (!m) continue;

    const label = m[1];
    const attrs = m[2];
    let type: "do" | "dont";
    if (/valid\s*=\s*true/.test(attrs)) type = "do";
    else if (/valid\s*=\s*false/.test(attrs)) type = "dont";
    else type = /✅/.test(label) || (/à faire/i.test(label) && !/ne pas/i.test(label)) ? "do" : "dont";

    let caption = "";
    for (let j = i + 1; j < bodyLines.length; j++) {
      const l = bodyLines[j].trim();
      if (l.startsWith(":::")) break; // closing fence
      if (l === "" || l.startsWith("![")) continue;
      caption = cleanInline(bodyLines[j]);
      break;
    }

    const fallbackLabel = cleanInline(label.replace(/[✅❌]/g, ""));
    out.push({ type, label: caption || fallbackLabel, caption });
  }
  return out;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function parseTableRows(tableLines: string[]): ContrastRow[] {
  if (tableLines.length < 2) return [];
  const header = splitRow(tableLines[0]).map((c) => cleanInline(c).replace(/\*/g, "").toLowerCase());
  // Transposed tables (checkbox/radio/toggle) put themes in rows — degrade gracefully.
  if (header[0]?.includes("thème")) return [];

  const lightIdx = header.findIndex((h) => h.includes("clair"));
  const darkIdx = header.findIndex((h) => h.includes("sombre"));
  if (lightIdx === -1 || darkIdx === -1) return [];

  const rows: ContrastRow[] = [];
  for (let i = 1; i < tableLines.length; i++) {
    if (/^\|?\s*[-:]+\s*\|/.test(tableLines[i])) continue; // |---| separator
    const cols = splitRow(tableLines[i]);
    if (cols.length <= Math.max(lightIdx, darkIdx)) continue;
    const state = cleanInline(cols[0]).replace(/\*/g, "").trim();
    if (!state) continue;
    rows.push({
      state,
      lightTheme: cleanInline(cols[lightIdx]).replace(/\*/g, ""),
      darkTheme: cleanInline(cols[darkIdx]).replace(/\*/g, ""),
    });
  }
  return rows;
}

function parseContrasts(bodyLines: string[]): ContrastTable[] {
  const out: ContrastTable[] = [];
  for (let i = 0; i < bodyLines.length; i++) {
    const m = bodyLines[i].match(/^:::fr-table\[(.*?)\]/);
    if (!m) continue;

    let label = cleanInline(m[1]);
    for (let k = i - 1; k >= 0; k--) {
      const hm = bodyLines[k].match(/^#{4,5}\s+(.*)$/);
      if (hm) {
        label = cleanInline(hm[1]);
        break;
      }
      if (/^#{1,3}\s+/.test(bodyLines[k])) break;
    }

    const tableLines: string[] = [];
    for (let j = i + 1; j < bodyLines.length; j++) {
      if (/^:{3,}/.test(bodyLines[j])) break;
      if (bodyLines[j].trim().startsWith("|")) tableLines.push(bodyLines[j]);
    }
    out.push({ label, rows: parseTableRows(tableLines) });
  }
  return out;
}

function parseRgaaCriteria(section?: RawSection): RgaaCriteria[] {
  if (!section) return [];
  const out: RgaaCriteria[] = [];
  for (const line of section.bodyLines) {
    const m = line.match(/^-\s*(.+)$/);
    if (!m) continue;
    const item = m[1].replace(NBSP, " ");

    let topic: string;
    let rest: string;
    const bm = item.match(/^\*\*(.+?)\*\*\s*:?\s*(.*)$/);
    if (bm) {
      topic = bm[1].replace(/[:：]\s*$/, "").trim();
      rest = bm[2].replace(/^[:：]\s*/, "").trim();
    } else {
      const cm = item.match(/^(.+?)\s*[:：]\s*(.*)$/);
      if (!cm) continue;
      topic = cm[1].replace(/\*/g, "").trim();
      rest = cm[2].trim();
    }

    // Split on comma+space so typo'd criteria like "9,1" stay intact.
    const criteria = rest
      .split(/,\s+/)
      .map((c) => cleanInline(c).replace(/\*/g, "").trim())
      .filter(Boolean);
    if (topic && criteria.length) out.push({ topic, criteria });
  }
  return out;
}

function parseReferences(section?: RawSection): AccessibilityReference[] {
  if (!section) return [];
  const text = section.bodyLines.join("\n");
  const out: AccessibilityReference[] = [];
  const seen = new Set<string>();

  const mdRe = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(text))) {
    const url = m[2].trim();
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ label: cleanInline(m[1]), url });
  }

  const aRe = /<a\s[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis;
  while ((m = aRe.exec(text))) {
    const url = m[1].trim();
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ label: cleanInline(m[2]), url });
  }
  return out;
}

function cleanMarkdown(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inTabNav = false;

  for (let raw of lines) {
    if (/^:{3,}dsfr-doc-tab-navigation/.test(raw)) {
      inTabNav = true;
      continue;
    }
    if (inTabNav) {
      if (/^:{3,}\s*$/.test(raw)) inTabNav = false;
      continue;
    }
    if (/^:{3,}/.test(raw)) continue; // fence opener/closer
    if (/^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(raw)) continue; // standalone image

    const adm = raw.match(/^>\s*\[!(\w+)\]\s*$/);
    if (adm) {
      out.push("");
      out.push(`Note (${adm[1].toLowerCase()}):`);
      continue;
    }

    raw = raw.replace(/^>\s?/, "");
    raw = raw.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
    out.push(cleanInline(raw));
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseAccessibility(
  content: string,
  name: string,
  title: string,
): ComponentAccessibility {
  const body = stripFrontmatter(content);
  const sections = splitSections(body);
  const bodyLines = body.split("\n");

  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  const rulesSection = findSection(sections, "règles d'accessibilité");

  return {
    name,
    title,
    keyboardInteractions: safe(
      () => parseKeyboard(findSection(sections, "interactions clavier")),
      [],
    ),
    rules: {
      text: safe(() => (rulesSection ? cleanMarkdown(rulesSection.bodyLines.join("\n")) : ""), ""),
      guidelines: safe(() => parseGuidelines(bodyLines), []),
    },
    contrasts: safe(() => parseContrasts(bodyLines), []),
    screenReader: safe(
      () => parseScreenReader(findSection(sections, "restitution par les lecteurs")),
      "",
    ),
    rgaaCriteria: safe(() => parseRgaaCriteria(findSection(sections, "critères rgaa")), []),
    references: safe(() => parseReferences(findSection(sections, "références")), []),
    cleanedMarkdown: safe(() => cleanMarkdown(body), ""),
  };
}

function parseScreenReader(section?: RawSection): string {
  if (!section) return "";
  return cleanMarkdown(section.bodyLines.join("\n"));
}
