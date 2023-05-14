import React from "react";
import { Link } from "react-router-dom";

export function Layout({ children }: React.PropsWithChildren): JSX.Element {
  function clearBinaryCache() {
    return fetch(`/clear-cache`, { method: "DELETE" });
  }

  return (
    <>
      <div>
        <header
          style={{
            display: "flex",
            width: "100%",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              padding: "1rem",
            }}
          >
            <Link to="/">Encryption</Link>
          </div>
          <div
            style={{
              padding: "1rem",
            }}
          >
            <Link to="/decrypt">Decryption</Link>
          </div>
        </header>
        <header
          style={{
            display: "flex",
            width: "100%",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <button onClick={clearBinaryCache}>
            Clear Cache (Delete builded binaries)
          </button>
        </header>

        <hr />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
          height: "100%",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "600px",
          }}
        >
          {children}
        </div>
      </div>

      <div style={{ margin: "4rem" }}></div>

      <hr />

      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h4 style={{ textAlign: "center", maxWidth: "750px" }}>
          Liability Disclaimer
        </h4>
        <p style={{ textAlign: "center", maxWidth: "750px" }}>
          <b>
            To the maximum extent permitted by applicable law, I shall not be
            held liable for any indirect, incidental, special, consequential or
            punitive damages, or any loss of profits or revenue, whether
            incurred directly or indirectly, or any loss of data, use, goodwill,
            or other intangible losses, resulting from (i) your access to this
            resource and/or inability to access this resource; (ii) any conduct
            or content of any third party referenced by this resource, including
            without limitation, any defamatory, offensive or illegal conduct or
            other users or third parties; (iii) any content obtained from this
            resource.
          </b>
        </p>
      </div>

      <div style={{ margin: "2rem" }}></div>
    </>
  );
}
