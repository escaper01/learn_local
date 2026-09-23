import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { functionBodies, projectBodies, debugRepairs } from "./java-curriculum-reference-solutions.mjs";

// Only creates disposable Java verification fixtures, never curriculum content.
const root = resolve(import.meta.dirname, "../examples");
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const modules = await Promise.all(manifest.modules.map(async path =>
  JSON.parse(await readFile(resolve(root, path), "utf8"))));
const javaType = type => ({ string: "String", "string[]": "String[]" }[type] ?? type);
const literal = (value, type) => type.endsWith("[]")
  ? `new ${javaType(type.slice(0, -2))}[]{${value.map(v => literal(v, type.slice(0, -2))).join(",")}}`
  : type === "string" ? JSON.stringify(value) : type === "double" ? String(value) + "d" : String(value);
const declarations = [];
const checks = [];
let testCount = 0;
for (const [index, module] of modules.entries()) {
  const exercises = module.lessons.flatMap(lesson => lesson.exercises);
  const exercise = exercises.find(item => item.type === "function");
  const entry = exercise.entrypoint;
  const name = `Reference${index}`;
  const extra = index === 20 ? "record Task(long id,String title){} record Owner(String name){}" : "";
  declarations.push(`static class ${name} { ${extra}
    static ${javaType(entry.returns)} ${entry.name}(${entry.parameters.map(p => javaType(p.type)+" "+p.name).join(",")}) {
      ${functionBodies[index]}
    }
  }`);
  for (const test of exercise.tests) {
    checks.push(`check(${JSON.stringify(test.id)}, ${literal(test.expected, entry.returns)}, ${name}.${entry.name}(${test.arguments.map((v,i) => literal(v, entry.parameters[i].type)).join(",")}));`);
    testCount++;
  }
  const debug = exercises.find(item => item.type === "debug");
  const [before, after] = debugRepairs[index];
  const original = debug.starterFiles[0].content;
  if (!original.includes(before)) throw new Error("Repair target missing: " + debug.id);
  const debugName = `Debug${index}`;
  const repaired = original.replace(before, after).replace("public class Main", "static class "+debugName).replaceAll("Main::", debugName+"::");
  declarations.push(repaired);
  checks.push(`check(${JSON.stringify(debug.id)}, ${JSON.stringify(debug.tests[0].expected)}, capture(() -> ${debugName}.main(new String[0])));`);
  testCount++;
  for (const project of exercises.filter(item => item.type === "project")) {
    const className = project.starterFiles[1].path.replace(".java", "");
    if (!projectBodies[className]) throw new Error("Missing project reference: "+className);
    declarations.push(`static class ${className} { static String run(String input) { ${projectBodies[className]} } }`);
    for (const test of project.tests) {
      checks.push(`check(${JSON.stringify(test.id)}, ${JSON.stringify(test.expected)}, ${className}.run(${JSON.stringify(test.input)}));`);
      testCount++;
    }
  }
}
const source = `public class AcademyVerification {
  ${declarations.join("\n")}
  interface CheckedAction { void run() throws Exception; }
  static String capture(CheckedAction action) throws Exception {
    var original = System.out;
    var bytes = new java.io.ByteArrayOutputStream();
    try(var out = new java.io.PrintStream(bytes, true, java.nio.charset.StandardCharsets.UTF_8)) {
      System.setOut(out);
      action.run();
    } finally {
      System.setOut(original);
      Thread.interrupted();
    }
    return bytes.toString(java.nio.charset.StandardCharsets.UTF_8);
  }
  static void check(String id,Object expected,Object actual) {
    if(!java.util.Objects.deepEquals(expected,actual))
      throw new AssertionError(id + " expected=" + expected + " actual=" + actual);
  }
  public static void main(String[] args) throws Exception {
    ${checks.join("\n")}
    System.out.println("PASS: ${testCount} function, debug-repair, and project reference cases");
  }
}`;
const directory = await mkdtemp(join(tmpdir(), "learnlocal-academy-verify-"));
try {
  await writeFile(join(directory, "AcademyVerification.java"), source);
  const args = ["run", "--rm", "--network", "none", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--read-only", "--user", "1000:1000",
    "--memory", "768m", "--cpus", "2", "--pids-limit", "256",
    "--mount", `type=bind,source=${directory},target=/source,readonly`,
    "--tmpfs", "/work:rw,nosuid,nodev,size=64m,mode=1777",
    "--workdir", "/work", "eclipse-temurin:21-jdk-jammy",
    "sh", "-c", "javac --release 21 -d /work /source/AcademyVerification.java && java -cp /work AcademyVerification"];
  const output = execFileSync("docker", args, { encoding: "utf8", timeout: 120000 });
  process.stdout.write(output);
} finally {
  const fromTemp = relative(tmpdir(), directory);
  if (!fromTemp.startsWith("learnlocal-academy-verify-") || fromTemp.includes(".."))
    throw new Error("Unsafe verification cleanup path");
  await rm(directory, { recursive: true, force: true });
}
