import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../examples/electronicsCourse");
const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
const errors = [];
const ids = new Map();
const assets = new Set();
let lessons = 0;
let exercises = 0;
let guided = 0;
let words = 0;
let coverageText = "";

function register(id, where) {
  if (ids.has(id)) errors.push(`Duplicate ID ${id}: ${ids.get(id)} and ${where}`);
  else ids.set(id, where);
}

async function read(relativePath) {
  try { return await readFile(resolve(root, ...relativePath.split("/")), "utf8"); }
  catch { errors.push(`Missing ${relativePath}`); return ""; }
}

register(manifest.id, "manifest.json");
const exerciseById = new Map();
for (const modulePath of manifest.modules) {
  const module = JSON.parse(await read(modulePath));
  coverageText += ` ${module.title} ${module.description ?? ""}`;
  register(module.id, modulePath);
  for (const lesson of module.lessons) {
    lessons += 1;
    register(lesson.id, modulePath);
    const markdown = await read(lesson.theoryFile);
    words += markdown.trim().split(/\s+/).length;
    for (const match of markdown.matchAll(/!\[[^\]]*\]\((assets\/[A-Za-z0-9._/-]+)/g)) assets.add(match[1]);
    for (const exercise of lesson.exercises) {
      exercises += 1;
      register(exercise.id, modulePath);
      exerciseById.set(exercise.id, exercise);
      if (exercise.type !== "multipleChoice") {
        guided += 1;
        if (!exercise.solutionMarkdown?.trim()) errors.push(`${exercise.id} has no worked solution`);
        if (!exercise.checklist?.length) errors.push(`${exercise.id} has no evidence checklist`);
      }
    }
  }
}

for (const projectPath of manifest.projects) {
  const project = JSON.parse(await read(projectPath));
  register(project.id, projectPath);
  for (const id of project.checkpointExerciseIds) if (!exerciseById.has(id)) errors.push(`${project.id} references missing checkpoint ${id}`);
}

for (const assetPath of assets) {
  try {
    const info = await stat(resolve(root, ...assetPath.split("/")));
    if (!info.isFile() || info.size === 0) errors.push(`Invalid asset ${assetPath}`);
  } catch { errors.push(`Missing asset ${assetPath}`); }
}

const requiredCoverage = ["Ohm", "Kirchhoff", "Thevenin", "Bode", "MOSFET", "Operational", "Microcontroller", "Communication", "Switching", "Battery", "Solar", "PCB", "EMI", "Troubleshooting", "RF", "IoT"];
for (const topic of requiredCoverage) if (!coverageText.toLowerCase().includes(topic.toLowerCase())) errors.push(`Coverage missing: ${topic}`);

if (manifest.modules.length !== 46) errors.push(`Expected 46 modules, found ${manifest.modules.length}`);
if (lessons !== 184) errors.push(`Expected 184 lessons, found ${lessons}`);
if (exercises !== 147) errors.push(`Expected 147 exercises, found ${exercises}`);
if (guided < 100) errors.push(`Expected at least 100 guided exercises, found ${guided}`);
if (words < 100000) errors.push(`Expected at least 100,000 lesson words, found ${words}`);

if (errors.length) throw new Error(`Electronics curriculum verification failed:\n- ${errors.join("\n- ")}`);
console.log(`PASS: ${manifest.modules.length} modules, ${lessons} lessons, ${exercises} exercises (${guided} guided), ${manifest.projects.length} projects, ${assets.size} referenced assets, ${words.toLocaleString()} lesson words.`);
