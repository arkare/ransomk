import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

export async function clearDependencies() {
  const cwd = path.join(__dirname, "..", "packages");

  for (const entry of fs.readdirSync(cwd)) {
    console.log(`Clearing project: ${entry}`);
    try {
      const projectPath = path.join(__dirname, "..", "packages", entry);

      [
        "dist",
        ".parcel-cache",
        "build",
        "node_modules",
        "bin",
        ".tmp",
        ".tmpbin",
        "jsout",
        "tsconfig.tsbuildinfo",
      ]
        .map((folderToDelete) => path.join(projectPath, folderToDelete))
        .forEach((folderToDelete) => {
          if (fs.existsSync(folderToDelete)) {
            fs.rmSync(folderToDelete, { recursive: true });
          }
        });
    } catch (e) {
      console.log(`(${entry}) Error: ${e}`);
      continue;
    }
  }
}

(async () => {
  if (require.main === module) {
    await clearDependencies();
  }
})();
