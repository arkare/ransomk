import { installDependencies } from "./install";
import { setupAndStartServer } from "./serve";
import fs from "node:fs";
import path from "node:path";

(async () => {
  try {
    const dev = process.argv.slice(2)[0] === "--dev";

    await installDependencies();
    await setupAndStartServer(dev);
  } catch (e) {
    fs.writeFileSync(
      path.join(process.cwd(), "ransomk.log.txt"),
      JSON.stringify({ e })
    );
  }
})();
