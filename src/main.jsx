import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Nota: React.StrictMode en DEV puede duplicar ciertos efectos (doble mount).
// En PROD no aplica el doble-invoke, pero para estabilidad durante debug
// dejamos el render simple.
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
