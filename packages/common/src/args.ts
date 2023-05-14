import { exit } from "node:process";

function exitWithMessage(message: string): never {
  console.log(message);
  exit(1);
}

export function parseUnsafeIntegerArg(
  arg: string | undefined,
  defaultValue?: number,
  errorMessage?: string
): number {
  if (typeof arg === "string") {
    const parsedInt = parseInt(arg);

    if (
      Number.isInteger(parsedInt) &&
      parsedInt >= 0 &&
      parsedInt < Number.MAX_SAFE_INTEGER
    ) {
      return parsedInt;
    }
  }

  if (typeof defaultValue !== "undefined") {
    return defaultValue;
  }

  return exitWithMessage(errorMessage ?? `Error parsing integer argument`);
}

export function parseUnsafeStringArg(
  arg: string | undefined,
  defaultValue?: string,
  errorMessage?: string
): string {
  if (typeof arg === "string") {
    return arg;
  }

  if (typeof defaultValue !== "undefined") {
    return defaultValue;
  }

  return exitWithMessage(errorMessage ?? `Error parsing string argument`);
}

export function parseUnsafeChoiceStringArg<T>(
  arg: string | undefined,
  choices: string[],
  defaultValue?: T,
  errorMessage?: string
): T {
  if (typeof arg === "string") {
    if (choices.includes(arg)) {
      return arg as T;
    }
  }

  if (typeof defaultValue !== "undefined") {
    return defaultValue;
  }

  return exitWithMessage(
    errorMessage ?? `Error parsing choice string argument`
  );
}
