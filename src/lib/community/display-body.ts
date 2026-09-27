/**
 * Official post creation stores its first line in `title` for feed headlines
 * and also stores the full text in `body`. Remove that mirrored first line
 * when the UI renders title and body together. Leave distinct legacy title/body
 * pairs and all student posts unchanged.
 */
export function displayPostBody(title: string | null, body: string | null): string | null {
  if (!title || !body) return body;
  const lines = body.split('\n');
  const firstContentLine = lines.findIndex(line => line.trim().length > 0);
  if (firstContentLine < 0 || lines[firstContentLine].trim() !== title.trim()) return body;
  lines.splice(firstContentLine, 1);
  while (lines.length && !lines[0].trim()) lines.shift();
  return lines.join('\n') || null;
}
