# LearnPack authoring

LearnLocal's prompt generator asks an AI assistant to produce every required JSON file in one response. You save `manifest.json` first, let LearnLocal create its referenced file paths, paste the remaining JSON blocks into those files, and package them yourself.

## Generate the JSON files

1. Open **Generate prompt** in LearnLocal. Enter any programming language, its safe lowercase identifier, version, source extension, descriptive runtime/toolchain requirements, required topics, and topics to exclude. Then copy the generated prompt.
2. Paste it into your AI assistant. Its response should begin with `manifest.json`, then contain every referenced module and project as a separate labeled JSON block.
3. Save the JSON as `manifest.json` in a new empty course folder. Do not copy the `SAVE AS:` line or Markdown code fences into the file.
4. In LearnLocal's prompt generator, select **Create files from manifest** and choose the saved manifest. During development the file picker opens in `learnpack-spec/examples`; otherwise it opens in Documents. LearnLocal creates every referenced path and preserves any file that already exists.
5. Paste each remaining JSON block into the matching file, such as `content/module-01.json` or `projects/final-project.json`. Check that every manifest reference is filled before packaging.

Your folder should resemble:

```text
my-course/
  manifest.json
  content/
    module-01.json
    module-02.json
  projects/
    final-project.json
```

## Create the `.learnpack`

Compress the **contents** of the course folder, not the course folder itself. `manifest.json` must be at the archive root.

On Windows, select `manifest.json`, `content`, and `projects` in File Explorer, choose **Compress to ZIP file**, then rename `my-course.zip` to `my-course.learnpack`. If Windows hides extensions, enable **View > Show > File name extensions** first.

PowerShell can do the same from inside the course folder:

```powershell
Compress-Archive -Path manifest.json,content,projects -DestinationPath ..\my-course.zip
Move-Item ..\my-course.zip ..\my-course.learnpack
```

On macOS or Linux, run this from inside the course folder:

```bash
zip -r ../my-course.learnpack manifest.json content projects
```

Import the resulting file from **My courses > Import LearnPack**. LearnLocal validates the archive, paths, schema, language metadata, exercises, and tests before installing it.

Any valid language can be imported and followed through the learning path. Java and Python currently have trusted local execution adapters. Other languages open in study mode: lessons, quizzes, hints, completion state, starter code, and projects remain available, while Run and Submit stay disabled until LearnLocal ships a trusted adapter. The descriptive `runtime.containerRequirements` field does not authorize a course to choose an image or execute installation commands.

If the import fails, correct the named JSON file or path, rebuild the archive, and import it again. Keep the original JSON folder as the editable source; the `.learnpack` is its distributable copy.
