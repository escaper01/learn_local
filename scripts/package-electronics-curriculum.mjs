import { createReadStream, createWriteStream } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import yazl from "yazl";

const repositoryRoot = resolve(import.meta.dirname, "..");
const courseRoot = resolve(repositoryRoot, "examples/electronicsCourse");
const destination = resolve(repositoryRoot, "electronicsCourse.learnpack");
const manifest = JSON.parse(await readFile(resolve(courseRoot, "manifest.json"), "utf8"));
const lessonFiles = [];
for (const modulePath of manifest.modules) {
  const module = JSON.parse(await readFile(resolve(courseRoot, ...modulePath.split("/")), "utf8"));
  for (const lesson of module.lessons) lessonFiles.push(lesson.theoryFile);
}
const diagramFiles = (await readdir(resolve(courseRoot, "assets/diagrams"))).map((name) => `assets/diagrams/${name}`);
const componentFiles = (await readdir(resolve(courseRoot, "assets/components"))).map((name) => `assets/components/${name}`);
const paths = ["manifest.json", ...manifest.projects, ...manifest.modules, ...lessonFiles, ...diagramFiles, ...componentFiles];
const archive = new yazl.ZipFile();
for (const path of paths) archive.addReadStream(createReadStream(resolve(courseRoot, ...path.split("/"))), path);
archive.end();
await new Promise((resolvePromise, reject) => {
  const output = createWriteStream(destination);
  archive.outputStream.pipe(output).once("close", resolvePromise).once("error", reject);
});
console.log(`Packaged ${paths.length} electronics curriculum files into ${destination}.`);
