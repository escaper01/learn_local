import { createReadStream, createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import yazl from "yazl";

const repositoryRoot = resolve(import.meta.dirname, "..");
const courseRoot = resolve(repositoryRoot, "examples");
const manifestPath = resolve(courseRoot, "manifest.json");
const destination = resolve(repositoryRoot, "my-course.learnpack");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (!Array.isArray(manifest.modules) || !Array.isArray(manifest.projects)) {
  throw new Error("examples/manifest.json must declare module and project paths");
}

const paths = ["manifest.json", ...manifest.modules, ...manifest.projects];
const archive = new yazl.ZipFile();
for (const path of paths) {
  const absolutePath = resolve(courseRoot, ...path.split("/"));
  JSON.parse(await readFile(absolutePath, "utf8"));
  archive.addReadStream(createReadStream(absolutePath), path);
}
archive.end();

await new Promise((resolvePromise, reject) => {
  const output = createWriteStream(destination);
  archive.outputStream.pipe(output).once("close", resolvePromise).once("error", reject);
});

console.log(`Packaged ${manifest.modules.length} manually authored modules and ${manifest.projects.length} projects into ${destination}.`);
