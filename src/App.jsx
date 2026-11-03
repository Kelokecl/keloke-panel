// src/App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider, useAuth } from "./contexts/AuthContext";

import Login from "./components/Login";
import MainApp from "./components/MainApp";

import OAuthCallback from "./components/OAuthCallback";
import OAuthTikTokStart from "./components/OAuthTikTokStart";



function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="w-full h-screen flex items-center justify-center"
        style={{ backgroundColor: "#f3f6f5" }}
      >
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto"
            style={{ borderColor: "#173d31" }}
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
      {/* PUBLICAS */}
      <Route path="/oauth/callback" element={<OAuthCallback />} />
      <Route path="/oauth/tiktok-start" element={<OAuthTikTokStart />} />

      {/* LOGIN */}
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <Login />}
      />

      {/* ROOT */}
      <Route
        path="/"
        element={<Navigate to={user ? "/dashboard" : "/login"} replace />}
      />

      {/* TODO lo protegido pasa por MainApp (que contiene Sidebar/Layout) */}
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


  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}
