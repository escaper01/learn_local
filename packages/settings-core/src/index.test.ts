import { describe, expect, it } from "vitest";
import { parseSettingsProfile, resolveSettings, validateSettingValue } from "./index";

describe("settings core", () => {
  it("resolves course, language, global, then default precedence", () => {
    const resolved = resolveSettings([
      { key: "editor.fontSize", scope: "global", scopeId: "", value: 15 },
      { key: "editor.fontSize", scope: "language", scopeId: "java", value: 17 },
      { key: "editor.fontSize", scope: "course", scopeId: "course-a", value: 19 }
    ], { language: "java", courseId: "course-a" });
    expect(resolved.find((setting) => setting.key === "editor.fontSize")).toMatchObject({ value: 19, source: "course" });
  });

  it("rejects unknown and out-of-range values", () => {
    expect(() => validateSettingValue("editor.fontSize", 100)).toThrow(/outside/i);
    expect(() => validateSettingValue("security.network", true)).toThrow(/unknown/i);
  });

  it("validates imported settings atomically", () => {
    expect(() => parseSettingsProfile({ format: "learnlocal-settings", schemaVersion: "1.0.0", settings: { "runner.memoryMb": 4096 } })).toThrow(/unknown/i);
  });
});
