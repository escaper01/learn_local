export type ThemeTokens = Record<string, string>;

export interface MonacoRule {
  token: string;
  foreground?: string | undefined;
  fontStyle?: string | undefined;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  colorScheme: "dark" | "light";
  builtIn: boolean;
  tokens: ThemeTokens;
  monacoBase: "vs-dark" | "vs";
  monacoRules: MonacoRule[];
  monacoColors: Record<string, string>;
}

export const THEME_TOKEN_KEYS = [
  "bg", "bg-elevated", "bg-sunken", "surface", "surface-alt", "surface-hover",
  "border", "border-soft", "text", "text-strong", "text-muted", "text-faint",
  "accent", "accent-strong", "accent-contrast", "accent-soft-bg", "accent-soft-text",
  "success", "success-strong", "success-bg", "danger", "danger-strong", "danger-bg",
  "warning", "warning-bg", "java-color", "java-bg", "python-color", "python-bg",
  "shadow", "backdrop", "code-text", "code-bg", "gold", "font-reading",
  "syntax-keyword", "syntax-string", "syntax-comment", "syntax-number", "syntax-type", "syntax-function"
] as const;

export type ThemeTokenKey = typeof THEME_TOKEN_KEYS[number];

const SANS = "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
const SERIF = "Georgia, \"Iowan Old Style\", \"Palatino Linotype\", \"Book Antiqua\", serif";

export const BUILT_IN_THEMES: ThemeDefinition[] = [
  {
    id: "leetcode-dark",
    name: "LeetCode Dark",
    colorScheme: "dark",
    builtIn: true,
    tokens: {
      bg: "#16171a", "bg-elevated": "#1e2023", "bg-sunken": "#121316",
      surface: "#202226", "surface-alt": "#1a1c1f", "surface-hover": "#2a2d31",
      border: "#34373c", "border-soft": "#292c30",
      text: "#e6e7e9", "text-strong": "#f5f6f7", "text-muted": "#9098a0", "text-faint": "#6b7178",
      accent: "#ffa116", "accent-strong": "#ffb84d", "accent-contrast": "#241605",
      "accent-soft-bg": "#3a2a10", "accent-soft-text": "#ffc471",
      success: "#35c46a", "success-strong": "#55d98a", "success-bg": "#16301f",
      danger: "#ef4743", "danger-strong": "#ff6b66", "danger-bg": "#3a1a1a",
      warning: "#d9a441", "warning-bg": "#2e2515",
      "java-color": "#f0ae62", "java-bg": "#37271a", "python-color": "#75b9e9", "python-bg": "#183249",
      shadow: "#00000066", backdrop: "#05070ab8",
      "code-text": "#8fc7ff", "code-bg": "#1c2430", gold: "#d1a94e",
      "syntax-keyword": "#c586c0", "syntax-string": "#ce9178", "syntax-comment": "#6a9955",
      "syntax-number": "#b5cea8", "syntax-type": "#4ec9b0", "syntax-function": "#dcdcaa",
      "font-reading": SANS
    },
    monacoBase: "vs-dark",
    monacoRules: [
      { token: "comment", foreground: "6a9955", fontStyle: "italic" },
      { token: "string", foreground: "ce9178" },
      { token: "keyword", foreground: "c586c0" },
      { token: "number", foreground: "b5cea8" },
      { token: "type", foreground: "4ec9b0" },
      { token: "function", foreground: "dcdcaa" },
      { token: "variable", foreground: "9cdcfe" },
      { token: "identifier", foreground: "9cdcfe" },
      { token: "delimiter", foreground: "d4d4d4" },
      { token: "operator", foreground: "d4d4d4" }
    ],
    monacoColors: { "editor.background": "#121316", "editor.foreground": "#e6e7e9", "editorLineNumber.foreground": "#4a4e55" }
  },
  {
    id: "medium-light",
    name: "Medium Light",
    colorScheme: "light",
    builtIn: true,
    tokens: {
      bg: "#ffffff", "bg-elevated": "#fafaf9", "bg-sunken": "#f7f6f3",
      surface: "#ffffff", "surface-alt": "#faf9f7", "surface-hover": "#f1efe9",
      border: "#e2ded5", "border-soft": "#ece8e0",
      text: "#1a1a1a", "text-strong": "#0d0d0d", "text-muted": "#6b6b6b", "text-faint": "#8a8a8a",
      accent: "#1a8917", "accent-strong": "#12730f", "accent-contrast": "#ffffff",
      "accent-soft-bg": "#e6f4e6", "accent-soft-text": "#12730f",
      success: "#1a8917", "success-strong": "#12730f", "success-bg": "#e6f4e6",
      danger: "#b3261e", "danger-strong": "#8f1d17", "danger-bg": "#fbe9e7",
      warning: "#8a6420", "warning-bg": "#f6efe0",
      "java-color": "#a5650f", "java-bg": "#f7ead2", "python-color": "#1f5c8a", "python-bg": "#dcecf7",
      shadow: "#2331292b", backdrop: "#2a2a2666",
      "code-text": "#0a5cb8", "code-bg": "#eef2f7", gold: "#b48a2e",
      "syntax-keyword": "#d73a49", "syntax-string": "#032f62", "syntax-comment": "#6a737d",
      "syntax-number": "#005cc5", "syntax-type": "#22863a", "syntax-function": "#6f42c1",
      "font-reading": SERIF
    },
    monacoBase: "vs",
    monacoRules: [
      { token: "comment", foreground: "6a737d", fontStyle: "italic" },
      { token: "string", foreground: "032f62" },
      { token: "keyword", foreground: "d73a49" },
      { token: "number", foreground: "005cc5" },
      { token: "type", foreground: "22863a" },
      { token: "function", foreground: "6f42c1" },
      { token: "variable", foreground: "24292e" },
      { token: "identifier", foreground: "24292e" },
      { token: "delimiter", foreground: "24292e" },
      { token: "operator", foreground: "d73a49" }
    ],
    monacoColors: { "editor.background": "#ffffff", "editor.foreground": "#1a1a1a", "editorLineNumber.foreground": "#c0c6cc" }
  },
  {
    id: "one-dark-pro",
    name: "One Dark Pro",
    colorScheme: "dark",
    builtIn: true,
    tokens: {
      bg: "#282c34", "bg-elevated": "#21252b", "bg-sunken": "#1e222a",
      surface: "#2c313a", "surface-alt": "#262a33", "surface-hover": "#333842",
      border: "#3b4048", "border-soft": "#313640",
      text: "#abb2bf", "text-strong": "#d7dae0", "text-muted": "#7f848e", "text-faint": "#5c6370",
      accent: "#61afef", "accent-strong": "#82c1f5", "accent-contrast": "#0d1117",
      "accent-soft-bg": "#2c3b4d", "accent-soft-text": "#9cd3fb",
      success: "#98c379", "success-strong": "#b1d992", "success-bg": "#2b3a26",
      danger: "#e06c75", "danger-strong": "#ec8790", "danger-bg": "#3a2427",
      warning: "#e5c07b", "warning-bg": "#3a331d",
      "java-color": "#d19a66", "java-bg": "#3a2b1a", "python-color": "#56b6c2", "python-bg": "#1c3438",
      shadow: "#00000066", backdrop: "#10131866",
      "code-text": "#98c379", "code-bg": "#1e222a", gold: "#e5c07b",
      "syntax-keyword": "#c678dd", "syntax-string": "#98c379", "syntax-comment": "#5c6370",
      "syntax-number": "#d19a66", "syntax-type": "#e5c07b", "syntax-function": "#61afef",
      "font-reading": SANS
    },
    monacoBase: "vs-dark",
    monacoRules: [
      { token: "comment", foreground: "5c6370", fontStyle: "italic" },
      { token: "string", foreground: "98c379" },
      { token: "keyword", foreground: "c678dd" },
      { token: "number", foreground: "d19a66" },
      { token: "type", foreground: "e5c07b" },
      { token: "function", foreground: "61afef" },
      { token: "variable", foreground: "e06c75" },
      { token: "identifier", foreground: "abb2bf" },
      { token: "delimiter", foreground: "abb2bf" },
      { token: "operator", foreground: "56b6c2" }
    ],
    monacoColors: { "editor.background": "#1e222a", "editor.foreground": "#abb2bf", "editorLineNumber.foreground": "#495162" }
  },
  {
    id: "atom-one-dark",
    name: "Atom One Dark",
    colorScheme: "dark",
    builtIn: true,
    tokens: {
      bg: "#21252b", "bg-elevated": "#282c34", "bg-sunken": "#1b1f24",
      surface: "#2c313a", "surface-alt": "#262a33", "surface-hover": "#323842",
      border: "#3a3f4b", "border-soft": "#2f333d",
      text: "#abb2bf", "text-strong": "#c8ccd4", "text-muted": "#6b717d", "text-faint": "#565c66",
      accent: "#528bff", "accent-strong": "#7aa2ff", "accent-contrast": "#0a0e14",
      "accent-soft-bg": "#1f2d4d", "accent-soft-text": "#9db8ff",
      success: "#89ca78", "success-strong": "#a2d98d", "success-bg": "#26301f",
      danger: "#e5566d", "danger-strong": "#ef7a8d", "danger-bg": "#3a1f26",
      warning: "#e0c285", "warning-bg": "#37301c",
      "java-color": "#d19a66", "java-bg": "#362a1a", "python-color": "#56b6c2", "python-bg": "#1a3236",
      shadow: "#00000066", backdrop: "#0d0f1266",
      "code-text": "#89ca78", "code-bg": "#1b1f24", gold: "#d19a66",
      "syntax-keyword": "#c678dd", "syntax-string": "#89ca78", "syntax-comment": "#5c6370",
      "syntax-number": "#d19a66", "syntax-type": "#e0c285", "syntax-function": "#528bff",
      "font-reading": SANS
    },
    monacoBase: "vs-dark",
    monacoRules: [
      { token: "comment", foreground: "5c6370", fontStyle: "italic" },
      { token: "string", foreground: "89ca78" },
      { token: "keyword", foreground: "c678dd" },
      { token: "number", foreground: "d19a66" },
      { token: "type", foreground: "e0c285" },
      { token: "function", foreground: "528bff" },
      { token: "variable", foreground: "e5566d" },
      { token: "identifier", foreground: "abb2bf" },
      { token: "delimiter", foreground: "abb2bf" },
      { token: "operator", foreground: "56b6c2" }
    ],
    monacoColors: { "editor.background": "#1b1f24", "editor.foreground": "#abb2bf", "editorLineNumber.foreground": "#454a54" }
  },
  {
    id: "powershell-blue",
    name: "PowerShell Blue",
    colorScheme: "dark",
    builtIn: true,
    tokens: {
      bg: "#012456", "bg-elevated": "#01204a", "bg-sunken": "#011a3d",
      surface: "#062a5e", "surface-alt": "#052352", "surface-hover": "#0a3570",
      border: "#1c3f72", "border-soft": "#123162",
      text: "#eeedf0", "text-strong": "#ffffff", "text-muted": "#a7b6d6", "text-faint": "#7288b8",
      accent: "#29b8d6", "accent-strong": "#5ecbde", "accent-contrast": "#01142b",
      "accent-soft-bg": "#113a52", "accent-soft-text": "#7fd8ea",
      success: "#16c60c", "success-strong": "#4ee23f", "success-bg": "#0f3a10",
      danger: "#e74856", "danger-strong": "#f2727e", "danger-bg": "#3a1620",
      warning: "#f2c811", "warning-bg": "#3a3110",
      "java-color": "#e8a33d", "java-bg": "#3a2a14", "python-color": "#61d6d6", "python-bg": "#123434",
      shadow: "#00000066", backdrop: "#00071566",
      "code-text": "#61d6d6", "code-bg": "#011a3d", gold: "#f2c811",
      "syntax-keyword": "#29b8d6", "syntax-string": "#61d6d6", "syntax-comment": "#6a9955",
      "syntax-number": "#f2c811", "syntax-type": "#5ecbde", "syntax-function": "#eeedf0",
      "font-reading": SANS
    },
    monacoBase: "vs-dark",
    monacoRules: [
      { token: "comment", foreground: "6a9955", fontStyle: "italic" },
      { token: "string", foreground: "61d6d6" },
      { token: "keyword", foreground: "29b8d6" },
      { token: "number", foreground: "f2c811" },
      { token: "type", foreground: "5ecbde" },
      { token: "function", foreground: "eeedf0" },
      { token: "variable", foreground: "eeedf0" },
      { token: "identifier", foreground: "eeedf0" },
      { token: "delimiter", foreground: "a7b6d6" },
      { token: "operator", foreground: "f2c811" }
    ],
    monacoColors: { "editor.background": "#011a3d", "editor.foreground": "#eeedf0", "editorLineNumber.foreground": "#3f5789" }
  }
];

export const TOKEN_GROUPS: Array<{ label: string; keys: ThemeTokenKey[] }> = [
  { label: "Backgrounds", keys: ["bg", "bg-elevated", "bg-sunken", "surface", "surface-alt", "surface-hover"] },
  { label: "Borders", keys: ["border", "border-soft"] },
  { label: "Text", keys: ["text", "text-strong", "text-muted", "text-faint"] },
  { label: "Accent", keys: ["accent", "accent-strong", "accent-contrast", "accent-soft-bg", "accent-soft-text"] },
  { label: "Status", keys: ["success", "success-strong", "success-bg", "danger", "danger-strong", "danger-bg", "warning", "warning-bg"] },
  { label: "Language badges", keys: ["java-color", "java-bg", "python-color", "python-bg"] },
  { label: "Code blocks", keys: ["code-text", "code-bg", "gold"] },
  { label: "Code syntax", keys: ["syntax-keyword", "syntax-string", "syntax-comment", "syntax-number", "syntax-type", "syntax-function"] }
];

export function applyThemeTokens(theme: Pick<ThemeDefinition, "tokens" | "colorScheme">): void {
  const root = document.documentElement;
  for (const key of THEME_TOKEN_KEYS) {
    const value = theme.tokens[key];
    if (value) root.style.setProperty(`--${key}`, value);
  }
  root.dataset.theme = theme.colorScheme;
  root.style.colorScheme = theme.colorScheme;
}
