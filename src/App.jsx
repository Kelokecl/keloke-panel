// src/App.jsx
import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider, useAuth } from "./contexts/AuthContext";

import Login from "./components/Login";
import OAuthCallback from "./components/OAuthCallback";
import OAuthTikTokStart from "./components/OAuthTikTokStart";

import Dashboard from "./pages/Dashboard";
import AIManagerPage from "./pages/AIManager";
import Trends from "./pages/Trends";

import { initWhatsAppStorage } from "./lib/initStorage";

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
      {/* ✅ RUTAS PÚBLICAS */}
      <Route path="/oauth/callback" element={<OAuthCallback />} />
      <Route path="/oauth/tiktok-start" element={<OAuthTikTokStart />} />

      {/* ✅ LOGIN */}
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <Login />}
      />

      {/* ✅ ROOT */}
      <Route
        path="/"
        element={<Navigate to={user ? "/dashboard" : "/login"} replace />}
      />

      {/* ✅ RUTAS PROTEGIDAS (AQUÍ ESTABA EL PROBLEMA) */}
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />

      <Route
        path="/ai-manager"
        element={
          <PrivateRoute>
            <AIManagerPage />
          </PrivateRoute>
        }
      />

      <Route
        path="/trends"
        element={
          <PrivateRoute>
            <Trends />
          </PrivateRoute>
        }
      />

      {/* ✅ FALLBACK */}
      <Route
        path="*"
        element={<Navigate to={user ? "/dashboard" : "/login"} replace />}
      />
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    initWhatsAppStorage().then((result) => {
      if (result?.success) {
        console.log("✅ Storage inicializado correctamente");
      } else {
        console.warn("⚠️ No se pudo inicializar storage:", result?.error);
      }
    });
  }, []);

  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
