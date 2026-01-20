// src/App.jsx
import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./components/Login";
import MainApp from "./components/MainApp";
import OAuthCallback from "./components/OAuthCallback";
import OAuthTikTokStart from "./components/OAuthTikTokStart"; // ✅ NUEVO
import { initWhatsAppStorage } from "./lib/initStorage";

import Dashboard from "./pages/Dashboard";
import AIManagerPage from "./pages/AIManager";
import Trends from "./pages/Trends";

<Route path="/dashboard" element={<Dashboard />} />
<Route path="/ai-manager" element={<AIManagerPage />} />
<Route path="/trends" element={<Trends />} />
<Route path="/" element={<Dashboard />} />

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="w-full h-screen flex items-center justify-center"
        style={{ backgroundColor: "#F5E6D3" }}
      >
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto"
            style={{ borderColor: "#2D5016" }}
          />
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* ✅ PUBLICAS */}
      <Route path="/oauth/callback" element={<OAuthCallback />} />
      <Route path="/oauth/tiktok-start" element={<OAuthTikTokStart />} /> {/* ✅ NUEVO */}

      {/* Login */}
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <Login />}
      />

      {/* Root */}
      <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />

      {/* Protegidas */}
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <MainApp />
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    initWhatsAppStorage().then((result) => {
      if (result.success) {
        console.log("✅ Storage inicializado correctamente");
      } else {
        console.warn("⚠️ No se pudo inicializar storage:", result.error);
      }
    });
  }, []);

  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}
