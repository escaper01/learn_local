import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SafeMarkdown } from "./SafeMarkdown";

const render = (value: string) => renderToStaticMarkup(<SafeMarkdown value={value} />);

describe("SafeMarkdown", () => {
  it("renders the lesson heading levels", () => {
    const html = render("# Title\n\n## Section\n\n### Topic\n\n#### Detail");
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<h3>Section</h3>");
    expect(html).toContain("<h4>Topic</h4>");
    expect(html).toContain("<h5>Detail</h5>");
  });

  it("renders bullet and numbered lists without merging them into paragraphs", () => {
    const html = render("Steps:\n1. Compile\n2. Run\n\n- javac\n- java");
    expect(html).toContain("<p>Steps:</p>");
    expect(html).toContain('<ol start="1"><li>Compile</li><li>Run</li></ol>');
    expect(html).toContain("<ul><li>javac</li><li>java</li></ul>");
  });

  it("renders bold, italic, and inline code without treating code as emphasis", () => {
    const html = render("A **checked** exception is *declared*; `a * b * c` stays code and 2 * 3 is plain.");
    expect(html).toContain("<strong>checked</strong>");
    expect(html).toContain("<em>declared</em>");
    expect(html).toContain("<code>a * b * c</code>");
    expect(html).toContain("2 * 3 is plain.");
  });

  it("renders pipe tables, including escaped pipes inside cells", () => {
    const html = render("| Operator | Meaning |\n|---|:---:|\n| `&&` | and |\n| `a \\|\\| b` | or |");
    expect(html).toContain("<thead><tr><th>Operator</th><th>Meaning</th></tr></thead>");
    expect(html).toContain("<td><code>&amp;&amp;</code></td><td>and</td>");
    expect(html).toContain("<td><code>a || b</code></td><td>or</td>");
  });

  it("renders callouts by kind and keeps fenced code verbatim", () => {
    const html = render("> **Warning:** never do this\n\n> **Tip:** prefer that\n\n> plain note\n\n```java\nint x = 1; // **not bold**\n```");
    expect(html).toContain('<blockquote class="callout warning"><p><strong>Warning:</strong> never do this</p></blockquote>');
    expect(html).toContain('<blockquote class="callout tip">');
    expect(html).toContain('<blockquote class="callout note"><p>plain note</p></blockquote>');
    expect(html).toContain('<pre><code data-language="java">int x = 1; // **not bold**</code></pre>');
  });

  it("treats HTML and links in course content as inert text", () => {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[click](javascript:alert(1))');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a ");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
