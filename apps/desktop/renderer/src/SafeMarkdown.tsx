import type { ReactNode } from "react";

function emphasis(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*(?=\S)[^*]+?(?<=\S)\*\*|\*(?=\S)[^*]+?(?<=\S)\*)/g).filter(Boolean).map((part, index) => {
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) return <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>;
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) return <em key={`${keyPrefix}-${index}`}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function inlineMarkdown(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).filter(Boolean).flatMap((part, index): ReactNode[] => part.length > 1 && part.startsWith("`") && part.endsWith("`") ? [<code key={index}>{part.slice(1, -1)}</code>] : emphasis(part, String(index)));
}

const TABLE_SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;
const BLOCK_START = /^(#{1,6}\s+|[-*]\s+|\d+\.\s+|```|>|\|)|^(-{3,}|\*{3,})$/;

function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim().replaceAll("\\|", "|"));
}

export function SafeMarkdown({ value, className = "" }: { value: string; className?: string }) {
  const lines = value.replaceAll("\r\n", "\n").split("\n");
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) { index += 1; continue; }
    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]!.trim().startsWith("```")) { code.push(lines[index]!); index += 1; }
      index += index < lines.length ? 1 : 0;
      blocks.push(<pre key={`code-${index}`}><code data-language={language || undefined}>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const content = inlineMarkdown(heading[2]!);
      const level = heading[1]!.length;
      blocks.push(level === 1 ? <h2 key={`heading-${index}`}>{content}</h2> : level === 2 ? <h3 key={`heading-${index}`}>{content}</h3> : level === 3 ? <h4 key={`heading-${index}`}>{content}</h4> : <h5 key={`heading-${index}`}>{content}</h5>);
      index += 1;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push(<hr key={`rule-${index}`} />);
      index += 1;
      continue;
    }
    if (trimmed.startsWith("|") && TABLE_SEPARATOR.test(lines[index + 1]?.trim() ?? "")) {
      const header = tableCells(trimmed);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index]!.trim().startsWith("|")) { rows.push(tableCells(lines[index]!)); index += 1; }
      blocks.push(<div className="markdown-table" key={`table-${index}`}><table>
        <thead><tr>{header.map((cell, cellIndex) => <th key={cellIndex}>{inlineMarkdown(cell)}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{header.map((_, cellIndex) => <td key={cellIndex}>{inlineMarkdown(row[cellIndex] ?? "")}</td>)}</tr>)}</tbody>
      </table></div>);
      continue;
    }
    if (trimmed.startsWith(">")) {
      const quoted: string[] = [];
      while (index < lines.length && lines[index]!.trim().startsWith(">")) { quoted.push(lines[index]!.trim().replace(/^>\s?/, "")); index += 1; }
      const text = quoted.join(" ").trim();
      const kind = /^\*\*(warning|caution|important)\b/i.test(text) ? "warning" : /^\*\*tip\b/i.test(text) ? "tip" : "note";
      blocks.push(<blockquote className={`callout ${kind}`} key={`quote-${index}`}><p>{inlineMarkdown(text)}</p></blockquote>);
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index]!.trim())) { items.push(lines[index]!.trim().replace(/^[-*]\s+/, "")); index += 1; }
      blocks.push(<ul key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item)}</li>)}</ul>);
      continue;
    }
    const ordered = /^(\d+)\.\s+/.exec(trimmed);
    if (ordered) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index]!.trim())) { items.push(lines[index]!.trim().replace(/^\d+\.\s+/, "")); index += 1; }
      blocks.push(<ol key={`ordered-${index}`} start={Number(ordered[1])}>{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item)}</li>)}</ol>);
      continue;
    }
    const paragraph = [trimmed];
    index += 1;
    while (index < lines.length && lines[index]!.trim() && !BLOCK_START.test(lines[index]!.trim())) { paragraph.push(lines[index]!.trim()); index += 1; }
    blocks.push(<p key={`paragraph-${index}`}>{inlineMarkdown(paragraph.join(" "))}</p>);
  }
  return <div className={`safe-markdown ${className}`.trim()}>{blocks}</div>;
}
