import { describe, expect, it } from "vitest";
import { buildCoursePrompt } from "./index";

describe("course prompt generator", () => {
  it("locks language and LearnPack security constraints", () => {
    const prompt = buildCoursePrompt({
      language: "python",
      languageName: "Python",
      runtimeVersion: "3.13",
      fileExtension: "py",
      containerRequirements: "Python 3.13 standard library",
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
    expect(prompt).toContain("Python 3.13 standard library");
    expect(prompt).toContain("Runtime requirements are metadata");
    expect(prompt).toContain("Shell commands");
    expect(prompt).toContain("Use short lessons.");
    expect(prompt).toContain("every required file in this single response");
    expect(prompt).toContain("compress those files into the final .learnpack archive");
    expect(prompt).toContain("files and functions");
    expect(prompt).toContain("at least three meaningful exercises");
    expect(prompt).toContain("Use only forward slashes in paths");
  });
});
