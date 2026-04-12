import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="flex min-h-[100dvh] min-h-[100svh] flex-col">
      <App />
    </div>
  </React.StrictMode>
);
