import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, FileText, CalendarDays, BarChart3, LogOut, Link2, Users, Menu, X, MessageCircle, Bot, Instagram, ArrowUpRight } from 'lucide-react';
const groups = [
  { label: 'ESPACIO DE TRABAJO', items: [['/dashboard','Resumen',LayoutDashboard], ['/whatsapp','WhatsApp',MessageCircle], ['/instagram','Instagram',Instagram]] },
  { label: 'MARKETING Y VENTAS', items: [['/content','Estudio de contenido',FileText], ['/calendar','Calendario',CalendarDays], ['/analytics','Resultados',BarChart3], ['/ai-manager','Agentes Keloke',Bot]] },
  { label: 'ADMINISTRACIÓN', items: [['/connections','Conexiones',Link2], ['/whatsapp-ai','Asistente de WhatsApp',Bot], ['/users','Equipo',Users]] }
];
export default function Sidebar(){
  const {user, signOut}=useAuth(); const [open,setOpen]=useState(false); const {pathname}=useLocation();
  useEffect(()=>{setOpen(false)},[pathname]);
  useEffect(()=>{if(!open)return; const close=e=>{if(e.key==='Escape')setOpen(false)};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[open]);
  return <>
    <button className="mobile-menu" aria-label={open?'Cerrar menú':'Abrir menú'} aria-expanded={open} aria-controls="workspace-navigation" onClick={()=>setOpen(!open)}>{open?<X size={21}/>:<Menu size={21}/>}</button>
    {open&&<button className="sidebar-scrim" aria-label="Cerrar menú" onClick={()=>setOpen(false)}/>}
    <aside id="workspace-navigation" className={`workspace-sidebar ${open?'is-open':''}`}>
      <NavLink className="brand" to="/dashboard"><span className="brand-symbol">k<span>•</span></span><span>keloke<span className="brand-period">.</span><small>MARKETING WORKSPACE</small></span></NavLink>
      <div className="workspace-label"><span className="workspace-avatar">K</span><span>Keloke SpA<small>Tu centro de operaciones</small></span></div>
      <nav aria-label="Navegación principal">{groups.map(group=><div className="nav-group" key={group.label}><p>{group.label}</p>{group.items.filter(([path])=>path!='/users'||user?.role==='admin').map(([path,title,Icon])=><NavLink key={path} to={path} className={({isActive})=>`nav-item ${isActive?'active':''}`}><Icon size={18}/><span>{title}</span></NavLink>)}</div>)}</nav>
      <div className="sidebar-foot"><div className="sidebar-note"><ArrowUpRight size={18}/><span>Conecta. Crea. Vende.<small>Menos ruido, más foco.</small></span></div><div className="user-profile"><span className="profile-avatar">{(user?.full_name||'K').slice(0,1)}</span><span>{user?.full_name||'Mi cuenta'}<small>{user?.role==='admin'?'Administrador':'Equipo Keloke'}</small></span><button onClick={signOut} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={17}/></button></div></div>
    </aside>
  </>;
}
