import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  FileText,
  Calendar,
  TrendingUp,
  BarChart3,
  Zap,
  Settings,
  LogOut,
  User,
  Link2,
  Users,
  Menu,
  X,
  MessageCircle,
  Bot,
  Instagram
} from 'lucide-react';

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const modules = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { id: 'connections', name: 'Conexiones', icon: Link2, path: '/connections' },
    { id: 'whatsapp', name: 'WhatsApp', icon: MessageCircle, path: '/whatsapp' },
    { id: 'whatsapp-ai', name: 'IA WhatsApp', icon: Bot, path: '/whatsapp-ai' },
    { id: 'instagram', name: 'Instagram', icon: Instagram, path: '/instagram' },
    { id: 'content', name: 'Contenido', icon: FileText, path: '/content' },
    { id: 'calendar', name: 'Calendario', icon: Calendar, path: '/calendar' },
    { id: 'analytics', name: 'Analítica', icon: BarChart3, path: '/analytics' },
    { id: 'users', name: 'Usuarios', icon: Users, path: '/users', requiredRole: 'admin' },
  ];

  // Filtrar módulos según el rol del usuario
  const visibleModules = modules.filter(module => {
    if (module.requiredRole && user?.role !== module.requiredRole) {
      return false;
    }
    return true;
  });

  async function handleSignOut() {
    await signOut();
  }

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white shadow-lg"
        style={{ color: '#2D5016' }}
      >
        {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Sidebar */}
      <div className={`
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
        fixed lg:static
        w-64 h-screen flex flex-col
        transition-transform duration-300 ease-in-out
        z-40
      `} style={{ backgroundColor: '#2D5016' }}>
        {/* Logo */}
        <div className="p-6 border-b border-white border-opacity-10">
          <h1 className="text-2xl font-bold text-white">Keloke.cl</h1>
          <p className="text-xs text-white text-opacity-70 mt-1">Automatización IA</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {visibleModules.map((module) => {
            const Icon = module.icon;

            return (
              <NavLink
                key={module.id}
                to={module.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) => `
                  w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all
                  ${isActive
                    ? 'bg-white bg-opacity-20 text-white'
                    : 'text-white text-opacity-70 hover:bg-white hover:bg-opacity-10'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium text-sm">{module.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-white border-opacity-10">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white bg-opacity-10 mb-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#D4A017' }}>
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.full_name}</p>
              <p className="text-xs text-white text-opacity-60 truncate">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-white text-opacity-70 hover:bg-white hover:bg-opacity-10 transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium text-sm">Cerrar Sesión</span>
          </button>
        </div>
      </div>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </>
  );
}