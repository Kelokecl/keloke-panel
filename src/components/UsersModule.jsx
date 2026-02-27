// src/components/UsersModule.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  Users,
  Edit2,
  Lock,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Trash2,
  Plus,
} from "lucide-react";

const roles = [
  { value: "admin", label: "Administrador" },
  { value: "community_manager", label: "Community Manager" },
  { value: "analyst", label: "Analista" },
  { value: "ai_module", label: "Módulo IA" },
];

function getRoleBadgeColor(role) {
  const colors = {
    admin: "bg-purple-100 text-purple-800 border-purple-200",
    community_manager: "bg-blue-100 text-blue-800 border-blue-200",
    analyst: "bg-green-100 text-green-800 border-green-200",
    ai_module: "bg-gray-100 text-gray-800 border-gray-200",
  };
  return colors[role] || "bg-gray-100 text-gray-800 border-gray-200";
}

function getRoleLabel(role) {
  const r = roles.find((x) => x.value === role);
  return r ? r.label : role || "—";
}

function displayNameFromEmail(email) {
  if (!email) return "Usuario";
  return email.split("@")[0] || email;
}

export default function UsersModule({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");

  const [formData, setFormData] = useState({
    // para editar
    role: "community_manager",
    is_active: true,

    // para crear
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ---------- Edge helpers ----------
  async function edgeInvoke(body) {
  const { data: { session }, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;

  const token = session?.access_token;
  if (!token) throw new Error("No hay sesión activa (token faltante). Vuelve a iniciar sesión.");

  const { data, error } = await supabase.functions.invoke("admin-users", {
    body,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return data;
}

  async function loadUsers() {
    const timeout = setTimeout(() => {
      setError("La carga está tardando más de lo esperado. Verifica tu conexión.");
      setLoading(false);
    }, 12000);

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const data = await edgeInvoke({ action: "list" });
      setUsers(data?.users || []);
      clearTimeout(timeout);
    } catch (err) {
      console.error("Error loading users:", err);
      setError(err?.message || "Error al cargar usuarios.");
      clearTimeout(timeout);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // no realtime aquí: tu tabla es mínima y así evitamos loops/eventos raros
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditingUser(null);
    setFormData({
      email: "",
      password: "",
      role: "community_manager",
      is_active: true,
    });
    setShowModal(true);
    setError("");
    setSuccess("");
  }

  function handleEdit(u) {
    setEditingUser(u);
    setFormData({
      email: u?.email || "",
      password: "",
      role: u?.role || "community_manager",
      is_active: !!u?.is_active,
    });
    setShowModal(true);
    setError("");
    setSuccess("");
  }

  async function handleSave(e) {
    e.preventDefault();

    try {
      setError("");
      setSuccess("");

      // EDITAR (solo profile)
      if (editingUser?.id) {
        await edgeInvoke({
          action: "update_profile",
          id: editingUser.id,
          role: formData.role,
          is_active: formData.is_active,
        });

        setSuccess("Usuario actualizado correctamente");
        setShowModal(false);
        setEditingUser(null);
        await loadUsers();
        return;
      }

      // CREAR
      const email = String(formData.email || "").trim().toLowerCase();
      const password = String(formData.password || "");
      const role = String(formData.role || "community_manager");
      const is_active = formData.is_active !== false;

      if (!email) throw new Error("Falta email");
      if (!password || password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");

      await edgeInvoke({ action: "create", email, password, role, is_active });

      setSuccess("Usuario creado correctamente");
      setShowModal(false);
      await loadUsers();
    } catch (err) {
      console.error("Error saving user:", err);
      setError(err?.message || "Error al guardar usuario");
    }
  }

  async function toggleUserStatus(userId, currentStatus) {
    try {
      setError("");
      setSuccess("");

      await edgeInvoke({
        action: "update_profile",
        id: userId,
        is_active: !currentStatus,
      });

      setSuccess(`Usuario ${!currentStatus ? "activado" : "desactivado"} correctamente`);
      await loadUsers();
    } catch (err) {
      console.error("Error toggling user status:", err);
      setError(err?.message || "Error al cambiar estado del usuario");
    }
  }

  async function handleDelete(userId) {
    if (!userId) return;
    if (userId === currentUser?.id) {
      setError("No puedes eliminar tu propio usuario.");
      return;
    }
    if (!window.confirm("¿Eliminar este usuario? Esto borrará también el usuario de Auth. No se puede deshacer.")) {
      return;
    }

    try {
      setError("");
      setSuccess("");

      await edgeInvoke({ action: "delete", id: userId });

      setSuccess("Usuario eliminado correctamente");
      await loadUsers();
    } catch (err) {
      console.error("Error deleting user:", err);
      setError(err?.message || "Error al eliminar usuario");
    }
  }

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return (users || []).filter((u) => {
      const name = displayNameFromEmail(u?.email).toLowerCase();
      const email = (u?.email || "").toLowerCase();
      const matchesSearch = !term || name.includes(term) || email.includes(term);
      const matchesRole = filterRole === "all" || u?.role === filterRole;
      return matchesSearch && matchesRole;
    });
  }, [users, searchTerm, filterRole]);

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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Users className="w-8 h-8 text-[#FF6B35]" />
          Gestión de Usuarios
        </h1>
        <p className="text-gray-600 mt-2">
          Tabla: <span className="font-semibold">public.users</span> (id, email, role, is_active, created_at)
        </p>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
          <XCircle className="w-5 h-5" />
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          {success}
        </div>
      ) : null}

      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B35] focus:border-transparent"
          />
        </div>

        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="pl-10 pr-8 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B35] focus:border-transparent appearance-none bg-white"
          >
            <option value="all">Todos los roles</option>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={openCreate}
          className="px-5 py-3 rounded-lg bg-[#FF6B35] text-white hover:bg-[#ff5722] transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nuevo Usuario
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B35] mx-auto" />
          <p className="text-gray-600 mt-4">Cargando usuarios...</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredUsers.map((u) => (
            <div key={u.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#FF6B35] to-[#ff5722] rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {displayNameFromEmail(u.email).charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">{u.email}</h3>

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

                    <p className="text-gray-400 text-xs mt-1">
                      Creado: {u.created_at ? new Date(u.created_at).toLocaleDateString("es-CL") : "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleUserStatus(u.id, u.is_active)}
                    className={`p-2 rounded-lg transition-colors ${
                      u.is_active
                        ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                        : "bg-green-100 text-green-700 hover:bg-green-200"
                    }`}
                    title={u.is_active ? "Desactivar usuario" : "Activar usuario"}
                  >
                    {u.is_active ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>

                  <button
                    onClick={() => handleEdit(u)}
                    className="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                    title="Editar rol/estado"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>

                  {u.id !== currentUser?.id ? (
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                      title="Eliminar usuario"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}

          {filteredUsers.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No se encontraron usuarios</p>
            </div>
          ) : null}
        </div>
      )}

      {/* Modal crear/editar */}
      {showModal ? (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingUser ? "Editar Usuario" : "Nuevo Usuario"}
              </h2>
              {editingUser ? <p className="text-sm text-gray-600 mt-1">{editingUser.email}</p> : null}
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-6">
              {!editingUser ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData((m) => ({ ...m, email: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B35] focus:border-transparent"
                      placeholder="usuario@ejemplo.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Contraseña *</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={formData.password}
                      onChange={(e) => setFormData((m) => ({ ...m, password: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B35] focus:border-transparent"
                      placeholder="mínimo 6 caracteres"
                    />
                  </div>
                </>
              ) : null}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rol</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData((m) => ({ ...m, role: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B35] focus:border-transparent"
                >
                  {roles.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData((m) => ({ ...m, is_active: e.target.checked }))}
                  className="w-5 h-5 text-[#FF6B35] border-gray-300 rounded focus:ring-[#FF6B35]"
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
                  }}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-[#FF6B35] text-white rounded-lg hover:bg-[#ff5722] transition-colors"
                >
                  {editingUser ? "Guardar" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
