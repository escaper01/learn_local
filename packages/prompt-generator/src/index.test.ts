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
    expect(prompt).toContain("For Java use Java 21");
    expect(prompt).toContain("it will import in study mode until LearnLocal ships a trusted adapter");
    expect(prompt).toContain('"instructionMarkdown"');
    expect(prompt).toContain('"choices": ["First answer"');
    expect(prompt).toContain('"kind": "function"');
    expect(prompt).toContain("Use returns, never returnType");
    expect(prompt).toContain("starterFiles and tests both exist");
    expect(prompt).toContain("every required file in this single response");
    expect(prompt).toContain("import that course folder directly in LearnLocal");
    expect(prompt).toContain("multiple narrowly focused reading lessons");
    expect(prompt).toContain("Reading lessons may and often should have an empty exercises array");
    expect(prompt).toContain("Questions and code tasks follow teaching");
    expect(prompt).toContain("Never use Windows backslashes");
  });

  it("includes requested topics when provided", () => {
    const prompt = buildCoursePrompt({
      language: "Java",
      learningRequest: "Teach me from the fundamentals through practical projects.",
      topics: ["Records", "Streams", "Generics"]
    });
    expect(prompt).toContain("Topics to include: Records, Streams, Generics");
  });

  it("omits the topics line when none are provided", () => {
    const prompt = buildCoursePrompt({ language: "Java", learningRequest: "Teach me Java." });
    expect(prompt).not.toContain("Topics to include");
  });
});
