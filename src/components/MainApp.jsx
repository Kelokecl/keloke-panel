import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

import Sidebar from './Sidebar';
import Dashboard from './Dashboard';
import ContentGenerator from './ContentGenerator';
import CalendarModule from './CalendarModule';
import AnalyticsModule from './AnalyticsModule';
import SocialConnections from './SocialConnections';
import UsersModule from './UsersModule';
import OAuthCallback from './OAuthCallback';
import WhatsAppModule from './WhatsAppModule';
import WhatsAppAIConfig from './WhatsAppAIConfig';
import InstagramModule from './InstagramModule';

// ✅ IMPORTA EL AUTO-GERENTE (tu chat IA)
import AIManagerModule from './AIManagerModule';

// ✅ IMPORTA Trends si existe como componente (si no existe, usamos placeholder)
// Si tú NO tienes un archivo Trends.jsx, NO importes nada aquí.
 // import Trends from './Trends';

// Placeholders para los otros módulos
function WinningProductsModule() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold" style={{ color: '#2D5016' }}>
        Productos Ganadores IA
      </h1>
      <p className="text-gray-600 mt-1">Top productos (Chile) y oportunidades de catálogo</p>

      <div className="mt-6 bg-white p-8 rounded-xl shadow-sm border border-gray-100">
        <p className="text-gray-700 font-medium mb-2">Estado</p>
        <p className="text-gray-500">
          Este módulo se alimenta desde la tabla <span className="font-mono">winning_products</span> y/o tu función de “trends-scan”.
        </p>

        <div className="mt-4 p-4 rounded-lg border border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-600">
            Próximo paso: conectar el scanner + guardar resultados en DB para que el dashboard muestre el Top automáticamente.
          </p>
        </div>
      </div>
    </div>
  );
}

function AutomationsModule() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold" style={{ color: '#2D5016' }}>
        Automatizaciones
      </h1>
      <p className="text-gray-600 mt-1">Gestión de reglas automáticas y engagement WhatsApp</p>
      <div className="mt-6 bg-white p-8 rounded-xl shadow-sm border border-gray-100">
        <p className="text-gray-500">Módulo de automatizaciones en desarrollo...</p>
      </div>
    </div>
  );
}

function SettingsModule() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold" style={{ color: '#2D5016' }}>
        Configuración del Sistema
      </h1>
      <p className="text-gray-600 mt-1">Roles, integraciones y configuración general</p>
      <div className="mt-6 bg-white p-8 rounded-xl shadow-sm border border-gray-100">
        <p className="text-gray-500">Módulo de configuración en desarrollo...</p>
      </div>
    </div>
  );
}

export default function MainApp() {
  const { user } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F5E6D3' }}>
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <Routes>
          {/* ✅ Landing interna */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* ✅ Módulos existentes */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/connections" element={<SocialConnections />} />
          <Route path="/content" element={<ContentGenerator />} />
          <Route path="/calendar" element={<CalendarModule />} />
          <Route path="/analytics" element={<AnalyticsModule />} />
          <Route path="/users" element={<UsersModule currentUser={user} />} />
          <Route path="/whatsapp" element={<WhatsAppModule />} />
          <Route path="/whatsapp-ai" element={<WhatsAppAIConfig />} />
          <Route path="/instagram" element={<InstagramModule />} />

          {/* ✅ CALLBACK (mantengo tu ruta) */}
          <Route path="/oauth-callback" element={<OAuthCallback />} />

          {/* ✅ NUEVOS: Auto-Gerente IA y Trends/Ganadores */}
          <Route path="/ai-manager" element={<AIManagerModule />} />
          <Route path="/trends" element={<WinningProductsModule />} />

          {/* ✅ Opcionales: automatizaciones / settings si después los agregas al sidebar */}
          <Route path="/automations" element={<AutomationsModule />} />
          <Route path="/settings" element={<SettingsModule />} />

          {/* ✅ Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </div>
  );
}
