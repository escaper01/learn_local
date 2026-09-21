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
Create a LearnPack 1.0 course as separate JSON files. The learner will save the files and compress them into the final .learnpack archive; do not create or simulate an archive.

FILE-BY-FILE RESPONSE PROTOCOL
- Produce exactly one file per response, beginning with manifest.json.
- Start with a single line in the form: SAVE AS: manifest.json
- Then provide exactly one JSON code block containing only that file's valid JSON.
- Never combine multiple files into one response or embed one file as a JSON string inside another.
- After each file, stop and wait for the learner to say "next file".
- On later responses, use the exact safe relative path declared by manifest.json, for example SAVE AS: content/module-01.json.
- After the final file, say that generation is complete and list all paths once so the learner can verify the folder before packaging.

Keep the course achievable within the schedule and move through concept, worked example, tiny exercise, function exercise, debugging task, concept check, checkpoint, reflection, and milestone project.

MANIFEST REQUIREMENTS
- format must be "learnpack" and schemaVersion must be "1.0.0".
- Use a stable lowercase kebab-case course id and semantic version "1.0.0".
- course.language must be "${input.language}" and course.languageVersion must be "${language.version}".
- runtime.adapter must be "${language.adapter}", runtime.adapterRange must be ">=0.1.0 <2.0.0", and runtime.runtimeVersion must be "${language.version}".
- Reference module files under content/ and project files under projects/.
- Each project file contains id, title, descriptionMarkdown, optional learningObjectives, and an ordered checkpointExerciseIds list. Every referenced checkpoint must be an exercise whose type is project.

MODULE AND EXERCISE REQUIREMENTS
- Every module contains stable id, title, optional description, and lessons.
- Every lesson contains stable id, title, theoryMarkdown, and exercises.
- Allowed exercise types are output, function, debug, multipleChoice, and project.
- Code exercises include starterFiles using safe relative paths ending in .${language.extension}.
- Do not repeat manifest references or starter-file paths within an exercise.
- Function and output tests are declarative objects with stable id, visibility (public or hidden), arguments/input, expected value, and optional comparison mode.
- Function entrypoints declare up to eight named parameters and a return type using int, double, boolean, string, or an array form such as int[] or string[]. Test arguments must match those types and remain JSON values.
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
7. The final file list exactly matches the files referenced by manifest.json, with manifest.json at the archive root.

Begin now with only manifest.json and then wait for "next file".`;
}
