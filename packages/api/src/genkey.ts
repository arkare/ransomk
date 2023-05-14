import { SAFE_RANSOM_DIR_MODE, asymmetric } from "ransomkcommon";
import {
  RootKeyPair,
  modifyCurrentRootConfig,
  readCurrentRootConfig,
  setCurrentActiveRootKeyPair,
  withDefaultConfig,
} from "./config";

export async function generateKeyPair(): Promise<RootKeyPair> {
  const keyPair = await asymmetric.generateKeyPair();

  const rootKeyPair: RootKeyPair = {
    rootPrivateKey: keyPair.privateKey.toString("base64"),
    rootPublicKey: keyPair.publicKey.toString("base64"),
  };

  return rootKeyPair;
}

export function keyExists(publicKey: string): boolean {
  const { keys: keyPairs } = readCurrentRootConfig();

  if (keyPairs === null || keyPairs === undefined) {
    return false;
  }

  return Object.keys(keyPairs).some((pKey) => pKey === publicKey);
}

export function firstAvailableKeyPair(): RootKeyPair | undefined {
  const { keys: keyPairs } = readCurrentRootConfig();

  if (keyPairs === null || keyPairs === undefined) {
    return undefined;
  }

  if (Object.values(keyPairs).length > 0) {
    return Object.values(keyPairs)[0];
  }

  return undefined;
}

export async function deleteKeyPair(publicKey: string): Promise<void> {
  async function normalizeActiveKeyPair() {
    await modifyCurrentRootConfig(async (getCurrentConfig) => {
      const activeRootKeyPair = getCurrentConfig().active;

      if (activeRootKeyPair === undefined || activeRootKeyPair === null) {
        return getCurrentConfig();
      }

      if (keyExists(activeRootKeyPair.rootPublicKey)) {
        return getCurrentConfig();
      }

      const availableKeyPair = firstAvailableKeyPair();

      await setCurrentActiveRootKeyPair(
        availableKeyPair,
        getCurrentConfig().mode
      );

      return getCurrentConfig();
    });
  }

  await modifyCurrentRootConfig(async (getCurrentConfig) => {
    const keys = { ...getCurrentConfig().keys };

    delete keys[publicKey];

    return {
      ...getCurrentConfig(),
      keys: keys,
    };
  });

  await normalizeActiveKeyPair();
}

export async function generateKeyPairAndSave(): Promise<RootKeyPair> {
  const globalKeyPair: RootKeyPair = await generateKeyPair();

  await modifyCurrentRootConfig(
    withDefaultConfig(async (getCurrentConfig) => {
      await setCurrentActiveRootKeyPair(
        globalKeyPair,
        getCurrentConfig().mode!
      );

      return {
        ...getCurrentConfig(),
        keys: {
          ...(getCurrentConfig().keys ?? {}),
          [globalKeyPair.rootPublicKey]: globalKeyPair,
        },
      };
    })
  );

  return globalKeyPair;
}

(async () => {
  const runningFromCli = require.main === module;

  if (runningFromCli) {
    await generateKeyPairAndSave();
  }
})();
