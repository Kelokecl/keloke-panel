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
} from "lucide-react";

const UsersModule = ({ currentUser }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");

  // ✅ Solo campos que existen en tu public.users
  const [formData, setFormData] = useState({
    email: "",
    role: "community_manager",
    is_active: true,
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const roles = [
    { value: "admin", label: "Administrador" },
    { value: "community_manager", label: "Community Manager" },
    { value: "analyst", label: "Analista" },
    { value: "ai_module", label: "Módulo IA" },
  ];

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      await loadUsers(mounted);
    };
    run();

    // Realtime: ok, pero si causa ruido puedes quitarlo
    const channel = supabase
      .channel("users_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        async () => {
          await loadUsers(mounted);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadUsers(mounted = true) {
    const timeout = setTimeout(() => {
      if (!mounted) return;
      setError("La carga está tardando más de lo esperado. Verifica tu conexión.");
      setLoading(false);
    }, 8000);

    try {
      setLoading(true);
      setError("");

      // ✅ Selecciona solo columnas reales (evita errores por columnas inexistentes)
      const { data, error: qErr } = await supabase
        .from("users")
        .select("id,email,role,is_active,created_at,instance_id")
        .order("created_at", { ascending: false });

      if (qErr) throw qErr;

      if (!mounted) return;
      setUsers(data || []);
      clearTimeout(timeout);
    } catch (err) {
      console.error("Error loading users:", err);
      if (!mounted) return;
      setError(err?.message || "Error al cargar usuarios. Reintenta.");
      clearTimeout(timeout);
    } finally {
      if (mounted) setLoading(false);
    }
  }

  function openEdit(user) {
    setEditingUser(user);
    setFormData({
      email: user.email || "",
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
      if (!editingUser?.id) {
        // ✅ En este módulo NO creamos usuarios Auth (requiere service role / Edge Function)
        throw new Error(
          "Creación de usuarios (Auth) deshabilitada en el frontend. Debe hacerse vía Edge Function (service role)."
        );
      }

      // ✅ Solo actualiza columnas reales
      const updateData = {
        role: formData.role,
        is_active: !!formData.is_active,
      };

      const { error: uErr } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", editingUser.id);

      if (uErr) throw uErr;

      setSuccess("Usuario actualizado correctamente");
      setShowModal(false);
      setEditingUser(null);
      await loadUsers(true);
    } catch (err) {
      console.error("Error saving user:", err);
      setError(err?.message || "Error al guardar usuario");
    }
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
      await loadUsers(true);
    } catch (err) {
      console.error("Error toggling user status:", err);
      setError(err?.message || "Error al cambiar estado del usuario");
    }
  }

  const filteredUsers = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    return (users || []).filter((u) => {
      const email = (u.email || "").toLowerCase();
      const role = u.role || "";
      const matchesSearch = !s || email.includes(s);
      const matchesRole = filterRole === "all" || role === filterRole;
      return matchesSearch && matchesRole;
    });
  }, [users, searchTerm, filterRole]);

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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Users className="w-8 h-8 text-[#FF6B35]" />
              Gestión de Usuarios
            </h1>
            <p className="text-gray-600 mt-2">Administra roles y estado (public.users)</p>
          </div>

          {/* ✅ Creación deshabilitada por seguridad (service role requerido) */}
          <button
            onClick={() => {
              setError(
                "Creación de usuarios desde el frontend está deshabilitada. Debe hacerse vía Edge Function con service role."
              );
              setSuccess("");
            }}
            className="bg-gray-200 text-gray-800 px-6 py-3 rounded-lg hover:bg-gray-300 transition-colors shadow"
            title="Creación de usuarios requiere Edge Function"
          >
            Crear usuario (deshabilitado)
          </button>
        </div>

        {/* Alertas */}
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

        {/* Filtros */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar por email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B35] focus:border-transparent"
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="pl-10 pr-8 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B35] focus:border-transparent appearance-none bg-white"
            >
              <option value="all">Todos los roles</option>
              {roles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B35] mx-auto" />
          <p className="text-gray-600 mt-4">Cargando usuarios...</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredUsers.map((u) => (
            <div key={u.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#FF6B35] to-[#ff5722] rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {(u.email || "?").charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">{u.email || "—"}</h3>

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
                      u.is_active ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200" : "bg-green-100 text-green-700 hover:bg-green-200"
                    }`}
                    title={u.is_active ? "Desactivar usuario" : "Activar usuario"}
                  >
                    {u.is_active ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>

                  <button
                    onClick={() => openEdit(u)}
                    className="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                    title="Editar usuario"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filteredUsers.length === 0 && (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No se encontraron usuarios</p>
            </div>
          )}
        </div>
      )}

      {/* Modal editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Editar Usuario</h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  disabled
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rol</label>
                <select
                  required
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B35] focus:border-transparent"
                >
                  {roles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={!!formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
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
                    setError("");
                    setSuccess("");
                  }}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button type="submit" className="flex-1 px-6 py-3 bg-[#FF6B35] text-white rounded-lg hover:bg-[#ff5722] transition-colors">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersModule;
