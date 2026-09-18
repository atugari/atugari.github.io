import React from "react";
import ReactDOM from "react-dom/client";
import { GameApp } from "@/components/game-app";
import "@/styles.css";

const root = document.getElementById("app");

if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <GameApp />
    </React.StrictMode>,
  );
}
