import { createReadStream, createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import yazl from "yazl";

const repositoryRoot = resolve(import.meta.dirname, "..");
const courseRoot = resolve(repositoryRoot, "examples/javaCourse");
const destination = resolve(repositoryRoot, "javaCourse.learnpack");
const manifest = JSON.parse(await readFile(resolve(courseRoot, "manifest.json"), "utf8"));

if (!Array.isArray(manifest.modules) || !Array.isArray(manifest.projects)) {
  throw new Error("examples/javaCourse/manifest.json must declare module and project paths");
}

const lessonFiles = [];
for (const modulePath of manifest.modules) {
  const module = JSON.parse(await readFile(resolve(courseRoot, ...modulePath.split("/")), "utf8"));
  for (const lesson of module.lessons) {
    if (typeof lesson.theoryFile === "string") lessonFiles.push(lesson.theoryFile);
  }
}

const paths = ["manifest.json", ...manifest.projects, ...manifest.modules, ...lessonFiles];
const archive = new yazl.ZipFile();
for (const path of paths) {
  const absolutePath = resolve(courseRoot, ...path.split("/"));
  const text = await readFile(absolutePath, "utf8");
  if (path.endsWith(".json")) JSON.parse(text);
  else if (!text.trim()) throw new Error(`Lesson file is empty: ${path}`);
  archive.addReadStream(createReadStream(absolutePath), path);
}
archive.end();

await new Promise((resolvePromise, reject) => {
  const output = createWriteStream(destination);
  archive.outputStream.pipe(output).once("close", resolvePromise).once("error", reject);
});

console.log(`Packaged ${manifest.modules.length} modules, ${lessonFiles.length} lesson files, and ${manifest.projects.length} projects into ${destination}.`);
