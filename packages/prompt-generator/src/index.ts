import type { CoursePromptRequest } from "@learnlocal/contracts";

export function buildCoursePrompt(input: CoursePromptRequest): string {
  return `You are designing a complete, portable programming course for LearnLocal.

USER REQUEST
- Programming language: ${input.language}
- What the learner wants to learn and build: ${input.learningRequest}

INFER THE COURSE METADATA
Infer all other details yourself. Do not ask follow-up questions.
- Choose a lowercase kebab-case language identifier, source extension, suitable course level, estimated hours, teaching progression, exercises, challenges, and practical projects.
- Infer an appropriate runtime/toolchain version and a short descriptive containerRequirements value. For Java use Java 21 and identifier "java". For Python use Python 3.13 and identifier "python". For another language use a suitable stable version; it will import in study mode until LearnLocal ships a trusted adapter.
- containerRequirements is descriptive metadata only, such as a compiler/interpreter, version, standard library, and essential toolchain. Never provide an image name, installation command, shell command, Dockerfile, flags, mounts, ports, or host paths.
- Treat every topic, goal, exclusion, experience clue, and project idea in the user's request as authoritative. Where the user is silent, choose sensible defaults.

DELIVERABLE
Create a complete LearnPack 1.0 course as separate JSON files in one response. The learner will save manifest.json first, use LearnLocal to create the paths referenced by it, paste each JSON block into the matching file, and compress those files into the final .learnpack archive. Do not create or simulate an archive.

COMPLETE RESPONSE PROTOCOL
- Produce every required file in this single response, beginning with manifest.json.
- For each file, write one line in the form SAVE AS: manifest.json or SAVE AS: content/module-01.json, followed by exactly one JSON code block containing only that file's valid JSON.
- Use only forward slashes in all manifest paths. Never use Windows backslashes.
- Never combine files into one JSON object or embed one file as a JSON string inside another.
- Every module and project referenced by manifest.json must appear later in the same response.
- Finish with a short checklist of the exact paths generated.
- Never output partial or truncated JSON. If response capacity is tight, use fewer modules while preserving complete lessons and valid exercises.

COURSE DEPTH
- Teach every requested topic substantially. Each lesson theoryMarkdown includes an explanation, worked code example, common mistakes, and recap.
- Each lesson contains at least three meaningful exercises: one concept check, one hands-on code exercise, and one debugging task or harder challenge.
- Across the course use output, function, debug, multipleChoice, and project exercises.
- Code exercises normally contain at least two public tests, two hidden edge-case tests, and two to four progressive hints.
- Add cumulative challenges, project checkpoints, and at least one final project integrating the major topics.
- Internally verify that every requested topic is taught, practiced, assessed, and used in a challenge or project.

MANIFEST CONTRACT
- Use exactly these top-level keys: format, schemaVersion, id, version, course, runtime, modules, projects. No other top-level keys.
- format is "learnpack", schemaVersion is "1.0.0", and version is "1.0.0".
- course contains exactly: title, description, language, languageVersion, fileExtension, level, estimatedHours, authors.
- runtime contains exactly: adapter, adapterRange, runtimeVersion, containerRequirements.
- course.language and runtime.adapter use the inferred lowercase identifier. course.languageVersion and runtime.runtimeVersion are identical. adapterRange is ">=0.1.0 <2.0.0".
- authors is [{ "name": "AI-generated for local use" }].
- modules contains unique forward-slash paths under content/. projects contains unique forward-slash paths under projects/.

MODULE CONTRACT
- A module contains only id, title, optional description, and lessons.
- A lesson contains only id, title, theoryMarkdown, and exercises. A lesson does not have description or descriptionMarkdown.
- Every exercise contains id, type, title, and instructionMarkdown. Never substitute questionMarkdown or descriptionMarkdown for instructionMarkdown.
- Exercise type is exactly one of: output, function, debug, multipleChoice, project.
- IDs are unique lowercase kebab-case strings. Do not add unlisted properties.

EXACT MULTIPLE-CHOICE SHAPE
Use flat string choices and a zero-based correctChoice index. Never use options, option objects, isCorrect, textMarkdown, or feedbackMarkdown:
{
  "id": "concept-check-id",
  "type": "multipleChoice",
  "title": "Concept check",
  "instructionMarkdown": "The question goes here.",
  "choices": ["First answer", "Second answer", "Third answer"],
  "correctChoice": 1,
  "hints": ["A progressive hint"]
}

EXACT FUNCTION SHAPE
Every function exercise requires starterFiles, entrypoint, and tests. entrypoint.kind must be "function". Use returns, never returnType. Allowed parameter/return types are only int, double, boolean, string, int[], double[], boolean[], string[]. For Java, className is "Solution", the file is Solution.java, and the method is public static. For other languages choose a valid source filename and omit className unless its trusted adapter requires it:
{
  "id": "function-exercise-id",
  "type": "function",
  "title": "Function exercise",
  "instructionMarkdown": "The complete task goes here.",
  "starterFiles": [{ "path": "solution.<inferred-extension>", "content": "valid starter source code" }],
  "entrypoint": { "kind": "function", "name": "functionName", "parameters": [{ "name": "value", "type": "int" }], "returns": "int" },
  "tests": [
    { "id": "public-basic", "visibility": "public", "arguments": [1], "expected": 2 },
    { "id": "hidden-edge", "visibility": "hidden", "arguments": [0], "expected": 1 }
  ],
  "hints": ["A progressive hint"],
  "limits": { "timeoutMs": 3000, "memoryMb": 256, "maxOutputKb": 64 }
}
Replace every angle-bracket placeholder with real content; angle brackets are not valid final filenames.

EXACT OUTPUT, DEBUG, AND PROJECT SHAPE
Every output, debug, and project exercise requires starterFiles and tests. Tests use input and expected, not arguments. A project checkpoint is still an exercise and still needs instructionMarkdown, starterFiles, and at least one test:
{
  "id": "code-exercise-id",
  "type": "debug",
  "title": "Code exercise",
  "instructionMarkdown": "The complete task goes here.",
  "starterFiles": [{ "path": "main.<inferred-extension>", "content": "valid starter source code" }],
  "tests": [
    { "id": "public-basic", "visibility": "public", "input": "", "expected": "expected output", "comparison": "trimmed" },
    { "id": "hidden-edge", "visibility": "hidden", "input": "edge input", "expected": "edge output", "comparison": "trimmed" }
  ],
  "hints": ["A progressive hint"],
  "limits": { "timeoutMs": 3000, "memoryMb": 256, "maxOutputKb": 64 }
}
Replace every angle-bracket placeholder with the inferred extension.

PROJECT FILE CONTRACT
- A project file contains only id, title, descriptionMarkdown, optional learningObjectives, and checkpointExerciseIds.
- Every checkpointExerciseIds value must exactly match an existing exercise whose type is "project".
- Do not reference a planned or nonexistent checkpoint. Project exercises must already be valid under the exact shape above.

SECURITY RULES
- Use only the language's standard library. Do not require third-party packages, network access, external services, databases, JUnit, or package downloads.
- Never include shell commands, scripts, package-manager commands, Docker image names/configuration, executables, binary dependencies, symlinks, absolute paths, ../ traversal, HTML, or executable Markdown.
- Runtime requirements are non-executable metadata and never control LearnLocal's trusted runtime.

MANDATORY VALIDATION BEFORE RESPONDING
1. Search every exercise: it has instructionMarkdown and does not have questionMarkdown or descriptionMarkdown.
2. Search every multipleChoice exercise: choices is an array of strings and correctChoice is a valid zero-based integer; options does not exist.
3. Search every function exercise: starterFiles exists; entrypoint has kind and name; returns is used; returnType does not exist; tests exist.
4. Search every output, debug, and project exercise: starterFiles and tests both exist.
5. Every project checkpoint ID resolves to a valid type=project exercise.
6. Every referenced file is included, every ID is unique, all paths use forward slashes, and all source filenames use the inferred extension.
7. All JSON parses without comments or trailing commas and contains only the properties permitted above.
8. Never shorten or omit required course content merely to meet an arbitrary line count.

Begin now. Infer the metadata, then generate manifest.json followed by every referenced JSON file in this single response.`;
}
