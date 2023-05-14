import md5 from "md5";

function hashMD5(buffer: Buffer): Buffer {
  return Buffer.from(md5(buffer), "hex");
}

export function hash(buffer: Buffer | string): Buffer {
  if (typeof buffer === "string") {
    buffer = Buffer.from(buffer, "utf8");
  }

  return hashMD5(buffer);
}
