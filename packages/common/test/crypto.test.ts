import test from "node:test";
import assert from "node:assert";

import { asymmetric, symmetric } from "../src/crypto";

test("SymmetricCrypto", async () => {
  for (let i = 0; i < 100; i++) {
    const secret = await symmetric.generateOneTimeSecret();

    const cypher = await symmetric.encrypt(
      Buffer.from("Hello World", "utf8"),
      secret.key,
      secret.nonce
    );

    const cypher2 = await symmetric.encrypt(
      Buffer.from("Hello World", "utf8"),
      secret.key,
      secret.nonce
    );

    const cypherOtherNonce = await symmetric.encrypt(
      Buffer.from("Hello World", "utf8"),
      secret.key,
      await symmetric.generateNonce()
    );

    const message = await symmetric.decrypt(cypher, secret.key, secret.nonce);

    assert.strictEqual(message.toString("utf8"), "Hello World");
    assert.notEqual(cypher.toString("utf8"), "Hello World");

    assert.strictEqual(cypher.toString("binary"), cypher2.toString("binary"));
    assert.notEqual(
      cypher.toString("binary"),
      cypherOtherNonce.toString("binary")
    );
  }
});

test("AsymmetricCrypto", async () => {
  for (let i = 0; i < 100; i++) {
    const keyPair = await asymmetric.generateKeyPair();

    const cypher = await asymmetric.encrypt(
      Buffer.from("Hello World", "utf8"),
      keyPair.publicKey
    );

    const message = await asymmetric.decrypt(cypher, keyPair.privateKey);

    assert.strictEqual(message.toString("utf8"), "Hello World");
    assert.notEqual(cypher.toString("utf8"), "Hello World");
  }
});
