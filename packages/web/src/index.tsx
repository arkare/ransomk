import React from "react";

import { createRoot } from "react-dom/client";
import { RouterProvider, createHashRouter } from "react-router-dom";
import { EncryptPage } from "./pages/Encrypt";
import { DecryptPage } from "./pages/Decrypt";

const container = document.getElementById("app");
const root = createRoot(container!);

const router = createHashRouter([
  {
    path: "/",
    element: <EncryptPage />,
  },
  {
    path: "/decrypt",
    element: <DecryptPage />,
  },
]);

root.render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
