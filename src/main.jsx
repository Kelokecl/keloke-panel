// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// ✅ Quitar StrictMode para evitar dobles montajes/requests en algunos flujos
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
