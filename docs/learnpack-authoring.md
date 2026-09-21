# LearnPack authoring

LearnLocal's prompt generator is designed for AI assistants that can produce individual JSON files but cannot create a complete archive. The AI generates one file per response. You save each file at the exact relative path it announces, then package the files yourself.

## Generate the JSON files

1. Open **Generate prompt** in LearnLocal, choose the course details, and copy the generated prompt.
2. Paste it into your AI assistant. Its first response should announce `manifest.json` and contain only that file's JSON in one code block.
3. Save the JSON as `manifest.json` in a new empty course folder. Do not copy the `SAVE AS:` line or Markdown code fences into the file.
4. Reply `next file` and save every later response at the exact path announced by the AI, such as `content/module-01.json` or `projects/final-project.json`.
5. Continue until the AI says generation is complete. Check that every path referenced by `manifest.json` exists and that no extra files are present.

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
Rename-Item ..\my-course.zip my-course.learnpack
```

On macOS or Linux, run this from inside the course folder:

```bash
zip -r ../my-course.learnpack manifest.json content projects
```

Import the resulting file from **My courses > Import LearnPack**. LearnLocal validates the archive, paths, schema, language metadata, exercises, and tests before installing it.

If the import fails, correct the named JSON file or path, rebuild the archive, and import it again. Keep the original JSON folder as the editable source; the `.learnpack` is its distributable copy.
