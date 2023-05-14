import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

export function projExec(command: string, projectDirname: string) {
  const projectPath = path.join(__dirname, "..", "packages", projectDirname);

  const stdout = execSync(command, { cwd: projectPath });

  const hasError = (e: any) =>
    (typeof e !== "undefined" && e !== null) ||
    (typeof e === "string" && e.length > 0);

  if (hasError(stdout)) {
    console.log(`(${projectDirname}) Subtask stdout: ${stdout}`);
  }
}

export async function installDependencies() {
  const cwd = path.join(__dirname, "..", "packages");

  // Core lib, needs to be built before everything else.
  projExec(`yarn install`, `common`);
  projExec(`yarn build`, `common`);

  for (const entry of fs.readdirSync(cwd)) {
    if (entry === "common") continue;

    console.log(`Entry: ${entry}`);
    try {
      const projectFolder = path.join(cwd, entry);

      const projectFolderStat = fs.statSync(projectFolder);

      if (projectFolderStat.isDirectory()) {
        if (!fs.existsSync(path.join(projectFolder, "bin"))) {
          fs.mkdirSync(path.join(projectFolder, "bin"));
        }

        const packageJsonFilePath = path.join(projectFolder, "package.json");

        const packageJsonStat = fs.statSync(packageJsonFilePath);

        if (packageJsonStat.isFile()) {
          try {
            JSON.parse(
              fs.readFileSync(packageJsonFilePath, { encoding: "utf8" })
            );
          } catch (e) {
            continue;
          }

          projExec(`yarn install`, entry);

          const commonjsProjects = [`web`];

          if (commonjsProjects.includes(entry)) {
            console.log(`[${entry}] is a commonjs project, building it...`);
            projExec(`yarn build`, entry);
          }
        }
      }
    } catch (e) {
      console.log(`(${entry}) Error: ${e}`);
      continue;
    }
  }
}

(async () => {
  if (require.main === module) {
    await installDependencies();
  }
})();
