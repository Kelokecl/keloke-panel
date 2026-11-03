import React, {lazy, Suspense} from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

import Sidebar from './Sidebar';
import MessageAlerts from './MessageAlerts';
import WeeklyProducts from './WeeklyProducts';
import { useLocation, Link } from 'react-router-dom';
import { Plus, ArrowUpRight } from 'lucide-react';
import Dashboard from './Dashboard';
const ContentGenerator = lazy(()=>import('./ContentGenerator'));
const CalendarModule = lazy(()=>import('./CalendarModule'));
const AnalyticsModule = lazy(()=>import('./AnalyticsModule'));
const SocialConnections = lazy(()=>import('./SocialConnections'));
const UsersModule = lazy(()=>import('./UsersModule'));
import OAuthCallback from './OAuthCallback';
const WhatsAppModule = lazy(()=>import('./WhatsAppModule'));
const WhatsAppAIConfig = lazy(()=>import('./WhatsAppAIConfig'));
const InstagramModule = lazy(()=>import('./InstagramModule'));

// ✅ IMPORTA EL AUTO-GERENTE (tu chat IA)
const AIManagerModule = lazy(()=>import('./AIManagerModule'));

// ✅ IMPORTA Trends si existe como componente (si no existe, usamos placeholder)
// Si tú NO tienes un archivo Trends.jsx, NO importes nada aquí.
 // import Trends from './Trends';

export default function MainApp() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const labels = { '/dashboard':'Resumen', '/instagram':'Bandeja de Instagram', '/whatsapp':'Bandeja de WhatsApp', '/connections':'Conexiones', '/content':'Estudio de contenido', '/calendar':'Calendario editorial', '/analytics':'Resultados', '/trends':'Top 5 semanal', '/users':'Equipo', '/whatsapp-ai':'Asistente de WhatsApp', '/ai-manager':'Asistente de marketing' };
  const inbox = ['/instagram','/whatsapp'].includes(pathname);

  return (
    <div className="workspace-shell">
      <Sidebar />
      <div className="workspace-body">
        <header className="workspace-header"><div><span className="header-eyebrow">KELOKE WORKSPACE</span><h1>{labels[pathname] || 'Keloke'}</h1></div><Link className="header-action" aria-label="Crear contenido" to="/content"><Plus size={17}/><span>Crear contenido</span></Link></header>
        <MessageAlerts />
        <main id="main-content" className={`workspace-content ${inbox ? 'is-inbox' : ''}`} key={pathname}>
        <Suspense fallback={<div className="loading-state">Cargando tu espacio…</div>}>
        <Routes>
          {/* ✅ Landing interna */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* ✅ Módulos existentes */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/connections" element={<SocialConnections />} />
          <Route path="/content" element={<ContentGenerator />} />
          <Route path="/calendar" element={<CalendarModule />} />
          <Route path="/analytics" element={<AnalyticsModule />} />
          <Route path="/users" element={user?.role === 'admin' ? <UsersModule currentUser={user} /> : <Navigate to="/dashboard" replace />} />
          <Route path="/whatsapp" element={<WhatsAppModule />} />
          <Route path="/whatsapp-ai" element={<WhatsAppAIConfig />} />
          <Route path="/instagram" element={<InstagramModule />} />

          {/* ✅ CALLBACK (mantengo tu ruta) */}
          <Route path="/oauth-callback" element={<OAuthCallback />} />

          {/* ✅ NUEVOS: Auto-Gerente IA y Trends/Ganadores */}
          <Route path="/ai-manager" element={<AIManagerModule />} />
          <Route path="/trends" element={<WeeklyProducts />} />

          {/* ✅ Opcionales: automatizaciones / settings si después los agregas al sidebar */}
          <Route path="/automations" element={<Navigate to="/whatsapp-ai" replace />} />
          <Route path="/settings" element={<Navigate to="/connections" replace />} />

          {/* ✅ Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
        </main>
      </div>
    </div>
  );
}
