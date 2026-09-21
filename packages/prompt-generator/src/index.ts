import type { CoursePromptRequest } from "@learnlocal/contracts";

const LANGUAGE_DETAILS = {
  java: { name: "Java", version: "21", adapter: "java", extension: "java" },
  python: { name: "Python", version: "3.13", adapter: "python", extension: "py" }
} as const;

export function buildCoursePrompt(input: CoursePromptRequest): string {
  const language = LANGUAGE_DETAILS[input.language];
  return `You are designing a complete, portable programming course for LearnLocal.

LEARNER PROFILE
- Language: ${language.name} ${language.version}
- Current experience: ${input.experience}
- Primary goal: ${input.goal}
- Topics to emphasize: ${input.topics || "Choose an appropriate progression."}
- Topics to skip: ${input.skipTopics || "None specified."}
- Schedule: ${input.dailyMinutes} minutes per day for ${input.durationWeeks} weeks
- Preferred project theme: ${input.projectTheme || "Choose practical, varied projects."}
- Teaching style: ${input.teachingStyle}
${input.customInstructions ? `- Additional instructions: ${input.customInstructions}` : ""}

DELIVERABLE
Return a LearnPack 1.0 course as JSON files. Do not wrap JSON in Markdown fences. First return manifest.json, then each referenced module as a separately labeled JSON object. Keep the course achievable within the schedule and move through concept, worked example, tiny exercise, function exercise, debugging task, concept check, checkpoint, reflection, and milestone project.

MANIFEST REQUIREMENTS
- format must be "learnpack" and schemaVersion must be "1.0.0".
- Use a stable lowercase kebab-case course id and semantic version "1.0.0".
- course.language must be "${input.language}" and course.languageVersion must be "${language.version}".
- runtime.adapter must be "${language.adapter}", runtime.adapterRange must be ">=0.1.0 <2.0.0", and runtime.runtimeVersion must be "${language.version}".
- Reference module files under content/ and project files under projects/.

MODULE AND EXERCISE REQUIREMENTS
- Every module contains stable id, title, optional description, and lessons.
- Every lesson contains stable id, title, theoryMarkdown, and exercises.
- Allowed exercise types are output, function, debug, multipleChoice, and project.
- Code exercises include starterFiles using safe relative paths ending in .${language.extension}.
- Function and output tests are declarative objects with stable id, visibility (public or hidden), arguments/input, expected value, and optional comparison mode.
- Include progressive hints without revealing the final answer.
- Use limits near timeoutMs 3000, memoryMb 256, maxOutputKb 64.
- Include public happy-path and edge-case tests plus hidden edge cases.

SECURITY RULES — NEVER INCLUDE
- Shell commands, scripts, package-manager commands, or arbitrary test programs.
- Docker image names, flags, mounts, capabilities, devices, ports, host paths, or network destinations.
- Executables, binary dependencies, symlinks, absolute paths, or ../ path traversal.
- HTML or executable content inside Markdown.
- Dependencies outside the ${language.name} standard library.

QUALITY CHECK BEFORE RESPONDING
1. Every referenced file exists and every id is unique.
2. Course language, runtime adapter, and versions agree exactly.
3. Every exercise is solvable from the preceding teaching material.
4. Public tests provide useful feedback and hidden tests do not expose expected values in lesson text.
5. The final milestone integrates the course goals without requiring network access.
6. All JSON is syntactically valid and contains no comments or trailing commas.

Begin with manifest.json.`;
}
