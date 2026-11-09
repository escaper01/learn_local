# Creating and maintaining a LearnLocal course

LearnLocal courses are authored directly as repository files. The source directory—not a generated archive—is the source of truth. Use `examples/javaCourse/` as the reference for executable programming courses and `examples/electronicsCourse/` as the reference for study-mode, visual, calculation, laboratory, and physical-design courses. The smaller `learnpack-spec/examples/java-foundations/` directory is useful when you only need the minimum valid structure.

This guide covers both creating a completely new course and adding a topic to an existing one.

## Before you edit

1. Read the target course's `manifest.json` from beginning to end.
2. Inspect the two adjacent modules that come before and after the proposed topic.
3. Read their module JSON, Markdown lessons, exercises, solutions, and related project files.
4. Read `manifest.schema.json`, `module.schema.json`, and `project.schema.json` in `packages/learnpack/schema/`.
5. Search the repository for the proposed IDs and topic name so you do not duplicate existing material.
6. Decide where the topic belongs in the learning progression and what learners must already know.

Do not start by producing disconnected JSON in a chat response. Edit the repository files, follow the established course style, and validate the result in place.

## Choose the correct scope

Add lessons to an existing module when the topic is a focused extension of that module and uses the same prerequisites. Create a new module when the topic introduces a substantial conceptual layer, needs several lessons and exercises, or changes the progression for later modules. Create a new course only when the audience, runtime, subject, level, or overall learning outcome is materially different.

A production-quality topic should normally contain:

- explicit prerequisites and learning objectives;
- theory taught in a deliberate order;
- worked examples with assumptions and intermediate reasoning;
- common mistakes and diagnostic guidance;
- practice that starts guided and becomes independent;
- solutions or deterministic tests appropriate to the exercise type;
- a recap and a bridge to the next topic;
- diagrams or component images when spatial or physical relationships matter;
- a project checkpoint when the topic should be integrated with earlier skills.

## Plan the topic before writing files

| Item | Question to answer |
|---|---|
| Audience | What does the learner already know? |
| Outcome | What should the learner be able to explain, calculate, build, debug, or program? |
| Vocabulary | Which terms and symbols must be introduced first? |
| Theory sequence | Which ideas depend on earlier ideas? |
| Worked examples | Which representative problems show the complete reasoning process? |
| Practice | Which exercises prove understanding rather than recall? |
| Evidence | What output, measurement, diagram, test, or checklist demonstrates success? |
| Failure modes | Which misconceptions or practical faults should learners diagnose? |
| Visuals | Which diagrams, schematics, waveforms, photographs, or tables are necessary? |
| Integration | Which project or later module will reuse this knowledge? |

Teach every concept before assessing it. Do not place a quiz, lab, debugging task, or project checkpoint before the lesson that establishes its contract and vocabulary.

## Directory structure

```text
examples/myCourse/
  manifest.json
  content/
    module-01.json
    module-02.json
  lessons/
    module-01/
      m01-l01-introduction.md
      m01-l02-worked-example.md
  projects/
    phase-01.json
    final-capstone.json
  assets/
    diagrams/
      m01-system-overview.svg
    components/
      example-hardware.png
```

`manifest.json` declares metadata plus the ordered module and project paths. Each module contains ordered lessons. Long-form theory belongs in Markdown files referenced by `theoryFile`; short fixture lessons may use inline `theoryMarkdown`, but never set both.

## Stable IDs and filenames

Every course, module, lesson, exercise, test, and project ID must be globally unique within the course, lowercase kebab-case, and stable across compatible revisions.

Recommended patterns:

```text
course:      embedded-systems-foundations
module:      embedded-m03-gpio
lesson:      embedded-m03-l02-input-conditioning
exercise:    embedded-m03-l02-pullup-calculation
test:        embedded-m03-l02-pullup-test-open
project:     embedded-phase-01-sensor-node
```

Do not renumber or rename existing IDs merely because lesson titles or ordering changed. Progress is associated with those IDs. If an old exercise is replaced by a materially different contract, give the replacement a new ID.

Filenames should be descriptive and stable. References in `manifest.json`, module JSON, project JSON, and Markdown must match their exact case and relative path.

## Create or update the manifest

For a new course, begin with a valid `manifest.json`:

```json
{
  "format": "learnpack",
  "schemaVersion": "1.0.0",
  "id": "embedded-systems-foundations",
  "version": "1.0.0",
  "course": {
    "title": "Embedded Systems Foundations",
    "description": "A practical progression from digital I/O to connected embedded systems.",
    "language": "embedded",
    "languageVersion": "1.0",
    "level": "beginner",
    "estimatedHours": 120,
    "authors": [{ "name": "LearnLocal Contributors" }]
  },
  "runtime": {
    "adapter": "embedded",
    "adapterRange": ">=0.1.0 <2.0.0",
    "runtimeVersion": "1.0",
    "containerRequirements": "Study-mode course; optional hardware and simulator tools are described by individual labs."
  },
  "modules": ["content/module-01.json"],
  "projects": []
}
```

Keep `schemaVersion` at `1.0.0` unless the application schemas change. `version` is the course content version and must be bumped whenever learners should import the revision as a new immutable version:

- patch: typo, clarification, corrected answer, or equivalent compatible fix;
- minor: new lessons, exercises, diagrams, or a new backward-compatible topic;
- major: reordered foundations, changed exercise contracts, removed content, or a substantially redesigned course.

Update `estimatedHours` honestly when the scope changes.

## Write the module and lesson sequence

A module file follows this structure:

```json
{
  "id": "embedded-m03-gpio",
  "title": "GPIO and Electrical Interfaces",
  "description": "Read inputs and drive outputs without violating electrical limits.",
  "lessons": [
    {
      "id": "embedded-m03-l01-gpio-model",
      "title": "The GPIO electrical model",
      "theoryFile": "lessons/module-03/embedded-m03-l01-gpio-model.md",
      "exercises": []
    }
  ]
}
```

For a substantial topic, a reliable lesson progression is:

1. physical or conceptual model and vocabulary;
2. rules, equations, or APIs;
3. worked analysis and design choices;
4. measurement, debugging, and failure evidence;
5. assessment and deliberate practice;
6. integration through a lab or project checkpoint.

Match the depth of neighboring modules. Avoid one enormous lesson, repeated generic paragraphs, shallow definitions without examples, and exercises that only restate the lesson.

## Write useful Markdown lessons

Each lesson should include the parts that are useful for its subject:

- why the concept matters;
- learning objectives;
- prerequisites and definitions;
- a model, diagram, or mental picture;
- derivation or step-by-step explanation;
- at least one complete worked example;
- tradeoffs and typical values;
- common errors and how evidence exposes them;
- a short guided practice prompt;
- a recap and next-step connection.

Use headings, paragraphs, emphasis, lists, tables, blockquotes, inline code, fenced code blocks, and local images. Keep units visible in calculations. State assumptions. Distinguish recommended operating conditions from absolute maximum ratings. For software, define inputs, outputs, error behavior, complexity, and environmental assumptions before testing them.

## Choose the appropriate exercise type

| Type | Use it for | Completion evidence |
|---|---|---|
| `multipleChoice` | Concept discrimination and misconception checks | Correct choice index |
| `function` | Deterministic programming behavior | Public and hidden argument/return tests |
| `output` | Complete-program or text transformation behavior | Input/output tests |
| `debug` | Finding and repairing a known fault | Tests against the repaired behavior |
| `project` | Integrated checkpoints | Tests or a guided solution/checklist |
| `calculation` | Numerical design and analysis | Worked solution plus checklist |
| `shortAnswer` | Explanation and engineering judgment | Model answer plus checklist |
| `schematic` | Circuit or block-diagram design | Worked design plus checklist |
| `simulation` | Predicted sweeps, waveforms, and models | Expected evidence plus checklist |
| `lab` | Physical or virtual measurement | Procedure, expected evidence, safety notes, checklist |
| `firmware` | Embedded work outside the Java runner | Reference approach plus checklist |
| `designReview` | Tradeoff and constraint analysis | Review rubric and worked decision |
| `troubleshooting` | Fault isolation from observations | Diagnostic path, measurements, checklist |

Executable Java exercises use `starterFiles`, an entry point where appropriate, tests, hints, and resource limits. Include public tests that explain the contract and hidden tests that cover boundaries without changing the contract.

Guided exercises must include both a non-empty `solutionMarkdown` and a non-empty `checklist`. The solution should show reasoning, not merely the final value. The checklist should describe observable evidence the learner can honestly confirm.

```json
{
  "id": "embedded-m03-l02-pullup-calculation",
  "type": "calculation",
  "title": "Choose an input pull-up resistor",
  "instructionMarkdown": "Choose a pull-up for a 3.3 V input given the stated leakage and current limits. Show units and verify both logic states.",
  "solutionMarkdown": "Start from the worst-case leakage...",
  "checklist": [
    "I stated the worst-case input leakage.",
    "I checked the low-state sink current.",
    "I verified voltage margin in both states."
  ],
  "hints": ["Treat the input leakage and switch current as separate constraints."]
}
```

## Write solutions and tests responsibly

Solutions must be reproducible by another learner. Include assumptions, intermediate work, units or types, final results, and a verification method. For physical work, include safe limits and expected instrument readings. Do not tell learners to work on mains voltage or defeat protective equipment.

For executable exercises:

- make tests deterministic and independent;
- cover normal, boundary, empty, and malformed cases promised by the lesson;
- use stable test IDs;
- keep hidden tests within the documented contract;
- avoid network, clock, random, host-path, or external-service dependencies;
- ensure starter files match the expected workspace exactly;
- use bounded time, memory, and output limits;
- verify instructor reference implementations against every test.

For multiple-choice questions, avoid trick wording. Distractors should correspond to plausible misconceptions explained in the lesson.

## Add projects and milestones

A project file references existing `project` exercises in learning order:

```json
{
  "id": "embedded-phase-01-sensor-node",
  "title": "Sensor Node Foundation",
  "descriptionMarkdown": "Integrate safe GPIO, sampling, and fault reporting.",
  "learningObjectives": [
    "Apply input-conditioning rules",
    "Collect and interpret verification evidence"
  ],
  "checkpointExerciseIds": [
    "embedded-m03-sensor-node-checkpoint"
  ]
}
```

Every referenced checkpoint ID must exist and have type `project`. Add the project path to `manifest.json`. A milestone should integrate previously taught skills; it should not introduce unexplained core theory.

## Add diagrams, schematics, and images

Store visuals below the course's `assets/` directory and reference them with a course-root-relative path:

```markdown
![RC charging curve showing the 63.2 percent point](assets/diagrams/rc-charge.svg "Voltage reaches 63.2% after one time constant")
```

Use SVG for circuit diagrams, block diagrams, signal paths, timing diagrams, and plots that benefit from crisp labels. Use PNG, JPEG, or WebP for photographs and component imagery. Every image must:

- be available offline;
- have meaningful alt text;
- use readable labels at normal lesson width;
- show polarity, current direction, node names, units, and reference designators where applicable;
- avoid decorative detail that obscures the teaching point;
- have a nearby caption or explanation when interpretation is not obvious.

Remote images, scripts, event handlers, embedded active content, external SVG references, and paths outside `assets/` are rejected. Verify component photographs are licensed for repository distribution, or create original illustrations.

## Update every reference

After adding or moving content, check all of the following:

- the module path appears in `manifest.json` in the intended order;
- the project path appears in `manifest.json` when applicable;
- every `theoryFile` exists with exact casing;
- every project checkpoint ID resolves to one `project` exercise;
- every asset referenced in Markdown exists;
- all IDs are unique;
- lesson and exercise order teaches before testing;
- the course version and estimated hours are updated;
- descriptions and README statistics still match the actual course.

Use `rg` to search old filenames and IDs before deleting or renaming anything.

## Validate and package

Run the repository-wide checks:

```bash
npm run check
```

For the Electronics course, also run:

```bash
npm run curriculum:electronics:verify
npm run curriculum:electronics:package
```

For the Java course, build the distribution archive with:

```bash
npm run curriculum:package
```

If Docker and the Java 21 verification image are available, execute the repository's available Java instructor reference bodies with:

```bash
node scripts/verify-java-curriculum.mjs
```

The full LearnPack test suite still performs structural and semantic validation for self-directed portfolio checkpoints that intentionally have no repository instructor implementation.

Packaging writes generated archives at the repository root. They are release outputs and are intentionally ignored by Git. Never edit an archive as an authoring input.

## Import and inspect the result

1. Start LearnLocal with `npm run dev`.
2. Select **Import course**.
3. Choose the source folder containing `manifest.json`—for example, `examples/electronicsCourse/`.
4. Open the course and inspect topic order, titles, diagrams, exercises, solutions, and project milestones.
5. Test both a fresh learner path and navigation back to earlier content.
6. Correct the source files, bump the version when appropriate, and import again.

LearnLocal stores an immutable local snapshot and does not watch the source directory. Distribution ZIP files must be extracted before import.

## A prompt for Codex or Claude

Give the coding agent access to the whole repository and use a request such as:

> Read `AGENTS.md` and `docs/learnpack-authoring.md` completely. Inspect the target course manifest, adjacent modules, their Markdown lessons, exercises, solutions, projects, and the schemas under `packages/learnpack/schema/`. Add a production-quality topic about **[topic]** for **[audience and level]**. Teach prerequisites before assessment; include worked examples, exercises, full solutions or deterministic tests, common failure modes, diagrams/images where they improve understanding, and an integration project when appropriate. Preserve existing stable IDs, create globally unique kebab-case IDs, update every reference, bump the semantic course version, and run the relevant validation and tests. Edit the repository directly rather than returning disconnected curriculum JSON in chat.

For a completely new course, also specify the intended total depth, approximate hours, runtime or study-mode requirements, required modules, capstone outcome, and available equipment or software.

## Final review checklist

- [ ] The topic is placed after its prerequisites.
- [ ] Every assessed concept is taught first.
- [ ] IDs are unique, stable, and kebab-case.
- [ ] JSON matches the schemas and contains no extra properties.
- [ ] Markdown files and assets resolve with exact casing.
- [ ] Worked examples include reasoning, not only answers.
- [ ] Executable tests match the stated contract.
- [ ] Guided exercises include solutions and evidence checklists.
- [ ] Safety constraints and typical values are accurate.
- [ ] Visuals are readable, offline, licensed, and explained.
- [ ] Projects reference existing project exercises.
- [ ] Manifest ordering, version, and estimated hours are updated.
- [ ] Course-specific validation and `npm run check` pass.
- [ ] The course has been imported and visually inspected in LearnLocal.
