import NodeRSA from "node-rsa";
import _sodium from "libsodium-wrappers";

export type AsymmetricKeyPair = {
  publicKey: Buffer;
  privateKey: Buffer;
};

abstract class AsymmetricCrypto {
  abstract decrypt(cypher: Buffer, privateKey: Buffer): Promise<Buffer>;
  abstract encrypt(message: Buffer, publicKey: Buffer): Promise<Buffer>;
  abstract generateKeyPair(): Promise<AsymmetricKeyPair>;
  abstract getPublicKeyFromPrivateKey(privateKey: Buffer): Promise<Buffer>;
}

export type SymmetricSecret = {
  key: SymmetricKey;
  nonce: SymmetricNonce;
};

export type SymmetricKey = Buffer;

export type SymmetricNonce = Buffer;

abstract class SymmetricCrypto {
  abstract decrypt(
    cypher: Buffer,
    key: SymmetricKey,
    nonce: SymmetricNonce
  ): Promise<Buffer>;

  abstract encrypt(
    message: Buffer,
    key: SymmetricKey,
    nonce: SymmetricNonce
  ): Promise<Buffer>;

  abstract generateKey(): Promise<SymmetricKey>;
  abstract generateNonce(): Promise<SymmetricNonce>;

  async generateOneTimeSecret(): Promise<SymmetricSecret> {
    return {
      key: await this.generateKey(),
      nonce: await this.generateNonce(),
    };
  }
}

/**
 * NodeRSA impl. is also available, but libsodium is preferred.
 */
class NodeRSACrypto implements AsymmetricCrypto {
  async generateNodeRSAKeyPair(): Promise<AsymmetricKeyPair> {
    const keyPair = new NodeRSA({ b: 2048 });

    return {
      privateKey: Buffer.from(keyPair.exportKey("private"), "utf8"),
      publicKey: Buffer.from(keyPair.exportKey("public"), "utf8"),
    };
  }

  async getPublicKeyFromPrivateKey(privateKey: Buffer): Promise<Buffer> {
    const nodePrivateKey = new NodeRSA();

    nodePrivateKey.importKey(privateKey.toString("utf8"), "private");

    return Buffer.from(nodePrivateKey.exportKey("public"), "utf8");
  }

  async generateKeyPair(): Promise<AsymmetricKeyPair> {
    return this.generateNodeRSAKeyPair();
  }

  async encrypt(message: Buffer, publicKey: Buffer): Promise<Buffer> {
    const nodePublicKey = new NodeRSA();

    nodePublicKey.importKey(publicKey.toString("utf8"), "public");

    return nodePublicKey.encrypt(message, "buffer");
  }

  async decrypt(cypher: Buffer, privateKey: Buffer): Promise<Buffer> {
    const nodePrivateKey = new NodeRSA();

    nodePrivateKey.importKey(privateKey.toString("utf8"), "private");

    return nodePrivateKey.decrypt(cypher);
  }
}

/**
 * https://www.privateinternetaccess.com/blog/libsodium-audit-results/
 */
class LibsodiumPublicKeyCrypto extends AsymmetricCrypto {
  async decrypt(cypher: Buffer, privateKey: Buffer): Promise<Buffer> {
    await _sodium.ready;

    const messageBase64 = _sodium.crypto_box_seal_open(
      cypher,
      await this.getPublicKeyFromPrivateKey(privateKey),
      privateKey,
      "base64"
    );

    return Buffer.from(messageBase64, "base64");
  }
  async encrypt(message: Buffer, publicKey: Buffer): Promise<Buffer> {
    await _sodium.ready;

    return Buffer.from(
      _sodium.crypto_box_seal(message, publicKey, "base64"),
      "base64"
    );
  }
  async generateKeyPair(): Promise<AsymmetricKeyPair> {
    await _sodium.ready;

    const keyPairBase64 = _sodium.crypto_box_keypair("base64");

    return {
      privateKey: Buffer.from(keyPairBase64.privateKey, "base64"),
      publicKey: Buffer.from(keyPairBase64.publicKey, "base64"),
    };
  }
  async getPublicKeyFromPrivateKey(privateKey: Buffer): Promise<Buffer> {
    await _sodium.ready;

    return Buffer.from(
      _sodium.crypto_scalarmult_base(privateKey, "base64"),
      "base64"
    );
  }
}

class LibsodiumSecretKeyCrypto extends SymmetricCrypto {
  async decrypt(
    cypher: Buffer,
    key: SymmetricKey,
    nonce: SymmetricNonce
  ): Promise<Buffer> {
    await _sodium.ready;

    const message = _sodium.crypto_secretbox_open_easy(
      cypher,
      nonce,
      key,
      "base64"
    );

    return Buffer.from(message, "base64");
  }

  async encrypt(
    message: Buffer,
    key: SymmetricKey,
    nonce: SymmetricNonce
  ): Promise<Buffer> {
    await _sodium.ready;

    const cypher = _sodium.crypto_secretbox_easy(message, nonce, key, "base64");

    return Buffer.from(cypher, "base64");
  }

  async generateKey(): Promise<SymmetricKey> {
    await _sodium.ready;

    return Buffer.from(
      _sodium.randombytes_buf(_sodium.crypto_secretbox_KEYBYTES, "base64"),
      "base64"
    );
  }

  async generateNonce(): Promise<SymmetricKey> {
    await _sodium.ready;

    return Buffer.from(
      _sodium.randombytes_buf(_sodium.crypto_secretbox_NONCEBYTES, "base64"),
      "base64"
    );
  }
}

export const asymmetric: AsymmetricCrypto = new LibsodiumPublicKeyCrypto();

export const symmetric: SymmetricCrypto = new LibsodiumSecretKeyCrypto();
