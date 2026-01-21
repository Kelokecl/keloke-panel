// src/App.jsx
import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider, useAuth } from "./contexts/AuthContext";

import Login from "./components/Login";
import MainApp from "./components/MainApp";
import OAuthCallback from "./components/OAuthCallback";
import OAuthTikTokStart from "./components/OAuthTikTokStart";

import Dashboard from "./components/Dashboard"; // ✅ TU RUTA REAL
import AIManagerModule from "./components/AIManagerModule"; // ✅ TU RUTA REAL

// Si todavía NO tienes Trends como componente, lo dejamos inline para que NO rompa el build:
function TrendsPlaceholder() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold" style={{ color: "#2D5016" }}>
        Tendencias / Productos Ganadores
      </h1>
      <p className="text-gray-600 mt-2">
        Módulo en construcción. Aquí irá el scanner + Top semanal.
      </p>
    </div>
  );
}

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
      {/* ✅ PUBLICAS */}
      <Route path="/oauth/callback" element={<OAuthCallback />} />
      <Route path="/oauth/tiktok-start" element={<OAuthTikTokStart />} />

      {/* Login */}
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <Login />}
      />

      {/* ✅ RUTAS DIRECTAS (para que NO queden vacías) */}
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
            <AIManagerModule />
          </PrivateRoute>
        }
      />

      <Route
        path="/trends"
        element={
          <PrivateRoute>
            <TrendsPlaceholder />
          </PrivateRoute>
        }
      />

      {/* Root */}
      <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />

      {/* ✅ Mantén tu app principal protegida */}
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
