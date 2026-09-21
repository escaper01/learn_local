import { AppError, type ResolvedSetting, type SettingScope, type SettingValue } from "@learnlocal/contracts";

export interface SettingDefinition {
  key: string;
  category: string;
  label: string;
  description: string;
  type: ResolvedSetting["type"];
  defaultValue: SettingValue;
  options?: readonly string[];
  min?: number;
  max?: number;
}

export interface StoredSetting {
  key: string;
  scope: SettingScope;
  scopeId: string;
  value: SettingValue;
}

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = Object.freeze([
  { key: "editor.fontSize", category: "Editor", label: "Editor font size", description: "Code editor text size in pixels.", type: "number", defaultValue: 14, min: 12, max: 24 },
  { key: "editor.wordWrap", category: "Editor", label: "Wrap long lines", description: "Wrap code that extends beyond the editor width.", type: "boolean", defaultValue: false },
  { key: "learning.dailyMinutes", category: "Learning", label: "Daily practice target", description: "Preferred practice time per day.", type: "number", defaultValue: 30, min: 10, max: 240 },
  { key: "learning.hintDelaySeconds", category: "Learning", label: "Hint delay", description: "Seconds before the next hint becomes available.", type: "number", defaultValue: 30, min: 0, max: 300 },
  { key: "prompt.teachingStyle", category: "Prompts", label: "Teaching style", description: "Default tone for generated course prompts.", type: "enum", defaultValue: "supportive", options: ["supportive", "concise", "socratic", "project-based"] },
  { key: "prompt.customInstructions", category: "Prompts", label: "Custom instructions", description: "Additional requirements included in generated prompts.", type: "string", defaultValue: "" },
  { key: "runner.autoInstall", category: "Runtimes", label: "Offer runtime installation", description: "Offer to install a missing approved runtime when opening a course.", type: "boolean", defaultValue: true }
]);

export function definitionFor(key: string): SettingDefinition {
  const definition = SETTING_DEFINITIONS.find((candidate) => candidate.key === key);
  if (!definition) throw new AppError("SETTING_UNKNOWN", "validation", `Unknown setting '${key}'.`);
  return definition;
}

export function validateSettingValue(key: string, value: SettingValue): SettingValue {
  const definition = definitionFor(key);
  if (definition.type === "boolean" && typeof value !== "boolean") throw new AppError("SETTING_TYPE_INVALID", "validation", `${definition.label} must be true or false.`);
  if (definition.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new AppError("SETTING_TYPE_INVALID", "validation", `${definition.label} must be a number.`);
    if (definition.min !== undefined && value < definition.min || definition.max !== undefined && value > definition.max) throw new AppError("SETTING_RANGE_INVALID", "validation", `${definition.label} is outside its allowed range.`);
  }
  if ((definition.type === "string" || definition.type === "enum") && typeof value !== "string") throw new AppError("SETTING_TYPE_INVALID", "validation", `${definition.label} must be text.`);
  if (definition.type === "string" && String(value).length > 10_000) throw new AppError("SETTING_LENGTH_INVALID", "validation", `${definition.label} is too long.`);
  if (definition.type === "enum" && !definition.options?.includes(String(value))) throw new AppError("SETTING_OPTION_INVALID", "validation", `${definition.label} has an unsupported value.`);
  return value;
}

export function resolveSettings(records: readonly StoredSetting[], context: { language?: string | undefined; courseId?: string | undefined } = {}): ResolvedSetting[] {
  return SETTING_DEFINITIONS.map((definition) => {
    const candidates = [
      context.courseId ? records.find((record) => record.key === definition.key && record.scope === "course" && record.scopeId === context.courseId) : undefined,
      context.language ? records.find((record) => record.key === definition.key && record.scope === "language" && record.scopeId === context.language) : undefined,
      records.find((record) => record.key === definition.key && record.scope === "global" && record.scopeId === "")
    ];
    const selected = candidates.find(Boolean);
    return {
      ...definition,
      value: selected?.value ?? definition.defaultValue,
      defaultValue: definition.defaultValue,
      source: selected?.scope ?? "default"
    };
  });
}

export interface SettingsProfile {
  format: "learnlocal-settings";
  schemaVersion: "1.0.0";
  exportedAt: string;
  settings: Record<string, SettingValue>;
}

export function createSettingsProfile(records: readonly StoredSetting[]): SettingsProfile {
  return {
    format: "learnlocal-settings",
    schemaVersion: "1.0.0",
    exportedAt: new Date().toISOString(),
    settings: Object.fromEntries(records.filter((record) => record.scope === "global").map((record) => [record.key, record.value]))
  };
}

export function parseSettingsProfile(value: unknown): Array<{ key: string; value: SettingValue }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError("SETTINGS_IMPORT_INVALID", "validation", "Settings profile must be a JSON object.");
  const profile = value as Record<string, unknown>;
  if (profile.format !== "learnlocal-settings" || profile.schemaVersion !== "1.0.0" || !profile.settings || typeof profile.settings !== "object" || Array.isArray(profile.settings)) {
    throw new AppError("SETTINGS_IMPORT_INVALID", "validation", "Settings profile format or schema version is unsupported.");
  }
  return Object.entries(profile.settings as Record<string, unknown>).map(([key, raw]) => {
    if (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean") throw new AppError("SETTINGS_IMPORT_INVALID", "validation", `Setting '${key}' has an invalid value.`);
    return { key, value: validateSettingValue(key, raw) };
  });
}
