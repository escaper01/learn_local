import type { CoursePromptRequest } from "@learnlocal/contracts";

export function buildCoursePrompt(input: CoursePromptRequest): string {
  return `You are designing a complete, portable programming course for LearnLocal.

LEARNER PROFILE
- Language: ${input.languageName} ${input.runtimeVersion}
- Safe language identifier: ${input.language}
- Source file extension: .${input.fileExtension}
- Requested runtime/toolchain: ${input.containerRequirements}
- Current experience: ${input.experience}
- Primary goal: ${input.goal}
- Topics to emphasize: ${input.topics || "Choose an appropriate progression."}
- Topics to skip: ${input.skipTopics || "None specified."}
- Schedule: ${input.dailyMinutes} minutes per day for ${input.durationWeeks} weeks
- Preferred project theme: ${input.projectTheme || "Choose practical, varied projects."}
- Teaching style: ${input.teachingStyle}
${input.customInstructions ? `- Additional instructions: ${input.customInstructions}` : ""}

DELIVERABLE
Create a complete LearnPack 1.0 course as separate JSON files in one response. The learner will save manifest.json first, use LearnLocal to create the paths referenced by it, paste each JSON block into the matching file, and compress those files into the final .learnpack archive. Do not create or simulate an archive.

COMPLETE RESPONSE PROTOCOL
- Produce every required file in this single response, beginning with manifest.json.
- For each file, write one line in the form SAVE AS: manifest.json or SAVE AS: content/module-01.json, followed by exactly one JSON code block containing only that file's valid JSON.
- Use only forward slashes in paths, even if the learner uses Windows.
- Never combine files into one JSON object or embed one file as a JSON string inside another.
- Every module and project referenced by manifest.json must appear later in the same response.
- Finish with a short checklist of the exact paths generated.
- Never output partial or truncated JSON. If response capacity is tight, combine related lessons into fewer modules while preserving every required topic and all course components.

Keep the course achievable within the schedule and move through concept, worked example, tiny exercise, function exercise, debugging task, concept check, checkpoint, reflection, and milestone project.

DEPTH AND TOPIC COVERAGE
- Treat every item under "Topics to emphasize" as required, not optional. Give each required topic at least one clearly titled lesson, or explicitly name all combined topics in a lesson title and teach each one substantially.
- Each lesson's theoryMarkdown must include a clear explanation, at least one worked code example, common mistakes, and a concise recap. Do not shorten files to an arbitrary line count.
- Each lesson must contain at least three meaningful exercises: a concept check, a hands-on code exercise, and either a debugging task or a progressively harder challenge.
- Across the course include all supported exercise types: output, function, debug, multipleChoice, and project.
- Each code exercise should normally include at least two public tests, two hidden edge-case tests, and two to four progressive hints.
- Include cumulative challenges after major topic groups, project checkpoints throughout the course, and at least one final multi-file milestone project integrating the required topics.
- Before responding, build an internal coverage table mapping every required topic to its lesson, exercises, challenge, and project usage. Do not output the internal table, but do not omit any mapped item.

MANIFEST REQUIREMENTS
- format must be "learnpack" and schemaVersion must be "1.0.0".
- Use a stable lowercase kebab-case course id and semantic version "1.0.0".
- course.language must be "${input.language}", course.languageVersion must be "${input.runtimeVersion}", and course.fileExtension must be "${input.fileExtension}".
- runtime.adapter must be "${input.language}", runtime.adapterRange must be ">=0.1.0 <2.0.0", runtime.runtimeVersion must be "${input.runtimeVersion}", and runtime.containerRequirements must describe "${input.containerRequirements}" without naming a Docker image.
- Reference module files under content/ and project files under projects/.
- Each project file contains id, title, descriptionMarkdown, optional learningObjectives, and an ordered checkpointExerciseIds list. Every referenced checkpoint must be an exercise whose type is project.
- Use exactly this top-level shape and do not place title or description at the root:
  { "format": "learnpack", "schemaVersion": "1.0.0", "id": "course-id", "version": "1.0.0", "course": { "title": "...", "description": "...", "language": "${input.language}", "languageVersion": "${input.runtimeVersion}", "fileExtension": "${input.fileExtension}", "level": "beginner", "estimatedHours": 20, "authors": [{ "name": "AI-generated for local use" }] }, "runtime": { "adapter": "${input.language}", "adapterRange": ">=0.1.0 <2.0.0", "runtimeVersion": "${input.runtimeVersion}", "containerRequirements": "${input.containerRequirements}" }, "modules": ["content/module-01.json"], "projects": ["projects/final-project.json"] }

MODULE AND EXERCISE REQUIREMENTS
- Every module contains stable id, title, optional description, and lessons.
- Every lesson contains stable id, title, theoryMarkdown, and exercises.
- Allowed exercise types are output, function, debug, multipleChoice, and project.
- Code exercises include starterFiles using safe relative paths ending in .${input.fileExtension}.
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
- Dependencies outside the ${input.languageName} standard library or explicitly requested toolchain.
- Docker image names or executable container commands. Runtime requirements are metadata for a future trusted LearnLocal adapter, never executable course configuration.

QUALITY CHECK BEFORE RESPONDING
1. Every referenced file exists and every id is unique.
2. Course language, runtime adapter, and versions agree exactly.
3. Every exercise is solvable from the preceding teaching material.
4. Public tests provide useful feedback and hidden tests do not expose expected values in lesson text.
5. The final milestone integrates the course goals without requiring network access.
6. All JSON is syntactically valid and contains no comments or trailing commas.
7. The final file list exactly matches the files referenced by manifest.json, with manifest.json at the archive root.
8. Every required topic is taught, practiced, assessed, and used again in a challenge or project.

Begin now and generate manifest.json followed by every referenced JSON file in this one response.`;
}
