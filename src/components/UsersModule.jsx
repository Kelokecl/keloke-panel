// src/components/UsersModule.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  Lock,
  Eye,
  EyeOff,
  Search,
  Filter,
  CheckCircle,
  XCircle,
} from "lucide-react";

const UsersModule = ({ currentUser }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");

  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    role: "community_manager",
    is_active: true,
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const roles = [
    { value: "admin", label: "Administrador", description: "Acceso total al sistema" },
    { value: "community_manager", label: "Community Manager", description: "Gestión de contenido y redes" },
    { value: "analyst", label: "Analista", description: "Solo acceso a Analytics" },
    { value: "ai_module", label: "Módulo IA", description: "Solo automatizaciones" },
  ];

  // Columns “seguras”: NO uses instance_id aquí.
  // Si tu tabla tiene full_name/updated_at, perfecto. Si no, no revienta.
  async function loadUsers() {
    const timeout = setTimeout(() => {
      setError("La carga está tardando más de lo esperado. Verifica tu conexión.");
      setLoading(false);
    }, 8000);

    try {
      setLoading(true);
      setError("");

      // Selecciona SOLO columnas razonables (evita 42703 por columnas inexistentes)
      const { data, error: qErr } = await supabase
        .from("users")
        .select("id,email,role,is_active,created_at,updated_at,full_name,last_login")
        .order("created_at", { ascending: false });

      // Si last_login/full_name/updated_at no existen en tu tabla,
      // PostgREST puede rechazar el select. En ese caso, reintenta con un select mínimo.
      if (qErr) {
        const msg = String(qErr?.message || "");
        if (msg.includes("does not exist")) {
          const { data: d2, error: e2 } = await supabase
            .from("users")
            .select("id,email,role,is_active,created_at")
            .order("created_at", { ascending: false });

          if (e2) throw e2;
          setRows(d2 || []);
          clearTimeout(timeout);
          return;
        }
        throw qErr;
      }

      setRows(data || []);
      clearTimeout(timeout);
    } catch (err) {
      console.error("Error loading users:", err);
      setError(err?.message || "Error al cargar usuarios. Intenta recargar.");
      clearTimeout(timeout);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();

    const ch = supabase
      .channel("users_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => {
        loadUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return (rows || []).filter((u) => {
      const full = String(u?.full_name || "").toLowerCase();
      const mail = String(u?.email || "").toLowerCase();
      const matchesSearch = !term || full.includes(term) || mail.includes(term);
      const matchesRole = filterRole === "all" || u?.role === filterRole;
      return matchesSearch && matchesRole;
    });
  }, [rows, searchTerm, filterRole]);

  const getRoleBadgeColor = (role) => {
    const colors = {
      admin: "bg-purple-100 text-purple-800 border-purple-200",
      community_manager: "bg-blue-100 text-blue-800 border-blue-200",
      analyst: "bg-green-100 text-green-800 border-green-200",
      ai_module: "bg-gray-100 text-gray-800 border-gray-200",
    };
    return colors[role] || "bg-gray-100 text-gray-800 border-gray-200";
  };

  const getRoleLabel = (role) => {
    const roleObj = roles.find((r) => r.value === role);
    return roleObj ? roleObj.label : role;
  };

  if (currentUser?.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600">Solo los administradores pueden gestionar usuarios</p>
        </div>
      </div>
    );
  }

  async function toggleUserStatus(userId, currentStatus) {
    try {
      setError("");
      setSuccess("");

      const { error: uErr } = await supabase
        .from("users")
        .update({ is_active: !currentStatus })
        .eq("id", userId);

      if (uErr) throw uErr;

      setSuccess(`Usuario ${!currentStatus ? "activado" : "desactivado"} correctamente`);
      loadUsers();
    } catch (err) {
      console.error("Error toggling user status:", err);
      setError(err?.message || "Error al cambiar estado del usuario");
    }
  }

  function handleEdit(user) {
    setEditingUser(user);
    setFormData({
      email: user.email || "",
      full_name: user.full_name || "",
      role: user.role || "community_manager",
      is_active: !!user.is_active,
    });
    setShowModal(true);
    setError("");
    setSuccess("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      if (!editingUser) {
        // No creamos usuarios auth desde el cliente. Evita romper.
        setError("Crear usuarios requiere Edge Function (Service Role). Por ahora usa Supabase Auth dashboard.");
        return;
      }

      // Update “seguro”: solo campos típicos
      const payload = {
        full_name: formData.full_name || null,
        role: formData.role,
        is_active: !!formData.is_active,
      };

      const { error: upErr } = await supabase.from("users").update(payload).eq("id", editingUser.id);
      if (upErr) throw upErr;

      setSuccess("Usuario actualizado correctamente");
      setShowModal(false);
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      console.error("Error saving user:", err);
      setError(err?.message || "Error al guardar usuario");
    }
  }

  async function handleDelete() {
    setError("Eliminar usuarios auth requiere Edge Function (Service Role). No se ejecuta desde el navegador.");
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Users className="w-8 h-8 text-[#FF6B35]" />
              Gestión de Usuarios
            </h1>
            <p className="text-gray-600 mt-2">Administra roles y estado (public.users)</p>
          </div>

          <button
            onClick={() => {
              setEditingUser(null);
              setFormData({ email: "", full_name: "", role: "community_manager", is_active: true });
              setShowModal(true);
              setError("");
              setSuccess("");
            }}
            className="bg-gray-200 text-gray-500 px-6 py-3 rounded-lg cursor-not-allowed flex items-center gap-2"
            title="Crear usuarios requiere Edge Function"
            disabled
          >
            <Plus className="w-5 h-5" />
            Nuevo Usuario (requiere Edge)
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
            <XCircle className="w-5 h-5" />
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            {success}
          </div>
        )}

        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar por nombre o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="pl-10 pr-8 py-3 border border-gray-300 rounded-lg appearance-none bg-white"
            >
              <option value="all">Todos los roles</option>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B35] mx-auto" />
          <p className="text-gray-600 mt-4">Cargando usuarios...</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredUsers.map((u) => {
            const name = u?.full_name || u?.email || "Usuario";
            return (
              <div key={u.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-12 h-12 bg-gradient-to-br from-[#FF6B35] to-[#ff5722] rounded-full flex items-center justify-center text-white font-bold text-lg">
                      {String(name).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(u.role)}`}>
                          {getRoleLabel(u.role)}
                        </span>
                        {u.is_active ? (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                            Activo
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                            Inactivo
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 text-sm">{u.email}</p>
                      <p className="text-gray-400 text-xs mt-1">
                        Creado: {u.created_at ? new Date(u.created_at).toLocaleDateString("es-CL") : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleUserStatus(u.id, u.is_active)}
                      className={`p-2 rounded-lg transition-colors ${
                        u.is_active ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200" : "bg-green-100 text-green-700 hover:bg-green-200"
                      }`}
                      title={u.is_active ? "Desactivar usuario" : "Activar usuario"}
                    >
                      {u.is_active ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>

                    <button
                      onClick={() => handleEdit(u)}
                      className="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                      title="Editar usuario"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>

                    <button
                      onClick={handleDelete}
                      className="p-2 bg-gray-200 text-gray-500 rounded-lg cursor-not-allowed"
                      title="Eliminar requiere Edge Function"
                      disabled
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredUsers.length === 0 && (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No se encontraron usuarios</p>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">{editingUser ? "Editar Usuario" : "Nuevo Usuario"}</h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nombre Completo</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData((s) => ({ ...s, full_name: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  placeholder="Ej: Juan Pérez"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  disabled
                  value={formData.email}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg disabled:bg-gray-100"
                />
                <p className="text-xs text-gray-500 mt-1">El email no se modifica desde aquí.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rol</label>
                <select
                  required
                  value={formData.role}
                  onChange={(e) => setFormData((s) => ({ ...s, role: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                >
                  {roles.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label} - {r.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData((s) => ({ ...s, is_active: e.target.checked }))}
                  className="w-5 h-5"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                  Usuario activo
                </label>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingUser(null);
                    setError("");
                    setSuccess("");
                  }}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button type="submit" className="flex-1 px-6 py-3 bg-[#FF6B35] text-white rounded-lg hover:bg-[#ff5722]">
                  Guardar
                </button>
              </div>

              {!editingUser ? (
                <p className="text-xs text-gray-500">
                  Crear usuarios “de login” requiere Edge Function con Service Role o hacerlo desde Supabase Auth Dashboard.
                </p>
              ) : null}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersModule;
