// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Connections from "./pages/Connections";
import OAuthCallback from "./pages/oauth/callback";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/connections" element={<Connections />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />

        {/* default */}
        <Route path="*" element={<Navigate to="/connections" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
