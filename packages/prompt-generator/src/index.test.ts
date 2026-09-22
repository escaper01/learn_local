import { describe, expect, it } from "vitest";
import { buildCoursePrompt } from "./index";

describe("course prompt generator", () => {
  it("infers metadata while locking exact LearnPack exercise shapes", () => {
    const prompt = buildCoursePrompt({
      language: "Python",
      learningRequest: "Learn files and functions for personal automation. Skip web frameworks."
    });
    expect(prompt).toContain("Programming language: Python");
    expect(prompt).toContain("Learn files and functions for personal automation");
    expect(prompt).toContain("Do not ask follow-up questions");
    expect(prompt).toContain("For Python use Python 3.13");
    expect(prompt).toContain('"instructionMarkdown"');
    expect(prompt).toContain('"choices": ["First answer"');
    expect(prompt).toContain('"kind": "function"');
    expect(prompt).toContain("Use returns, never returnType");
    expect(prompt).toContain("starterFiles and tests both exist");
    expect(prompt).toContain("every required file in this single response");
    expect(prompt).toContain("compress those files into the final .learnpack archive");
    expect(prompt).toContain("multiple narrowly focused reading lessons");
    expect(prompt).toContain("Reading lessons may and often should have an empty exercises array");
    expect(prompt).toContain("Questions and code tasks follow teaching");
    expect(prompt).toContain("Never use Windows backslashes");
  });
});
