import { describe, expect, it } from "vitest";
import { buildCoursePrompt } from "./index";

describe("course prompt generator", () => {
  it("locks language and LearnPack security constraints", () => {
    const prompt = buildCoursePrompt({
      language: "python",
      experience: "beginner",
      goal: "Learn automation",
      topics: "files and functions",
      skipTopics: "web frameworks",
      dailyMinutes: 30,
      durationWeeks: 6,
      projectTheme: "personal productivity",
      teachingStyle: "supportive",
      customInstructions: "Use short lessons."
    });
    expect(prompt).toContain("Python 3.13");
    expect(prompt).toContain("runtime.adapter must be \"python\"");
    expect(prompt).toContain("Shell commands");
    expect(prompt).toContain("Use short lessons.");
  });
});
