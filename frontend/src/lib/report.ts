/**
 * Investigation reports use fixed level-2 headings (see prompts/system.md):
 * Summary, Root cause, Timeline, Evidence gaps. Split the Markdown into
 * {heading -> body}; text before the first heading is "intro".
 */
export function splitReport(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let key = "intro";
  for (const line of markdown.split("\n")) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      key = heading[1].toLowerCase();
      continue;
    }
    sections[key] = (sections[key] ?? "") + line + "\n";
  }
  for (const [name, body] of Object.entries(sections)) {
    if (!body.trim()) delete sections[name];
  }
  return sections;
}

export const isStructuredReport = (sections: Record<string, string>) =>
  ["summary", "root cause", "timeline"].some((name) => name in sections);
