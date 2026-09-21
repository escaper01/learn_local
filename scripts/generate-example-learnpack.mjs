import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import yazl from "yazl";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "learnpack-spec/examples/java-foundations");
const destination = resolve(root, "learnpack-spec/examples/java-foundations.learnpack");
await mkdir(dirname(destination), { recursive: true });

const zip = new yazl.ZipFile();
zip.addReadStream(createReadStream(resolve(source, "manifest.json")), "manifest.json");
zip.addReadStream(createReadStream(resolve(source, "content/01-arrays.json")), "content/01-arrays.json");
zip.end();

await new Promise((resolvePromise, reject) => {
  const output = createWriteStream(destination);
  zip.outputStream.pipe(output).once("close", resolvePromise).once("error", reject);
});

console.log(`Generated ${destination}`);
