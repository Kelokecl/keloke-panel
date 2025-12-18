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

// Placeholders para los otros módulos

function WinningProductsModule() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold" style={{ color: '#2D5016' }}>Productos Ganadores IA</h1>
      <p className="text-gray-600 mt-1">Top 10 productos actualizados cada 15 días</p>
      <div className="mt-6 bg-white p-8 rounded-xl shadow-sm border border-gray-100">
        <p className="text-gray-500">Módulo de productos ganadores en desarrollo...</p>
      </div>
    </div>
  );
}

function AutomationsModule() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold" style={{ color: '#2D5016' }}>Automatizaciones</h1>
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
      <h1 className="text-3xl font-bold" style={{ color: '#2D5016' }}>Configuración del Sistema</h1>
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
          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/connections" element={<SocialConnections />} />
          <Route path="/content" element={<ContentGenerator />} />
          <Route path="/calendar" element={<CalendarModule />} />
          <Route path="/analytics" element={<AnalyticsModule />} />
          <Route path="/users" element={<UsersModule currentUser={user} />} />
          <Route path="/whatsapp" element={<WhatsAppModule />} />
          <Route path="/whatsapp-ai" element={<WhatsAppAIConfig />} />
          <Route path="/instagram" element={<InstagramModule />} />
          <Route path="/oauth-callback" element={<OAuthCallback />} />
        </Routes>
      </div>
    </div>
  );
}