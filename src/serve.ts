import { installDependencies } from "./install";
import { exec } from "node:child_process";
import path from "node:path";

export async function setupAndStartServer(dev: boolean = true) {
  console.log(`Starting server`);

  const childProcess = exec(`yarn ${dev ? `serve` : `serve:prod`}`, {
    cwd: path.join(__dirname, `..`, `packages`, `api`),
  });

  childProcess.stdout?.on("data", console.log);
  childProcess.stderr?.on("data", console.log);
}

(async () => {
  if (require.main === module) {
    await setupAndStartServer();
  }
})();
