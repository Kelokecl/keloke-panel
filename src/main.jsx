import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// En DEV, StrictMode puede duplicar efectos/render (y gatillar bugs “fantasma”).
// Dejamos StrictMode solo si realmente lo quieres en dev.
// Si prefieres mantenerlo, cambia RootWrapper a React.StrictMode siempre.
const RootWrapper = import.meta.env.DEV ? React.Fragment : React.Fragment;

ReactDOM.createRoot(document.getElementById("root")).render(
  <RootWrapper>
    <App />
  </RootWrapper>
);
