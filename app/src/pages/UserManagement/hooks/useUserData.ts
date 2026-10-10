import React, { useState, useEffect, useRef } from "react";
import api from "@/application";
import toast from "react-hot-toast";
import { syncEngine } from "@/infrastructure/sync/sync-engine";
import { useSyncRefetch } from "@/hooks/useSyncRefetch";
import { UserItem, UserFormData, SyncStatusData, RoleOption } from "../types";
import { DEFAULT_FORM } from "../constants";
import { friendlyError } from '@/lib/errors';

export const useUserData = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [formData, setFormData] = useState<UserFormData>({ ...DEFAULT_FORM });
  const [authMode, setAuthMode] = useState<"password" | "pin">("password");
  const [syncStatus, setSyncStatus] = useState<SyncStatusData>({
    online: true,
    syncing: false,
    unsyncedCount: 0,
  });
  const [roles, setRoles] = useState<RoleOption[]>([]);

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((status) => {
      setSyncStatus(status);
    });
    return () => unsubscribe();
  }, []);

  // Only the first load shows the full-screen spinner; background refetches
  // (every sync cycle) refresh the list in place without flashing it.
  const hasLoadedRef = useRef(false);

  const fetchUsers = async () => {
    try {
      if (!hasLoadedRef.current) setLoading(true);
      const response = await api.users.getAll();
      setUsers((response as any).data?.data?.users || []);
    } catch {
      toast.error("Couldn't load staff. Please try again.");
    } finally {
      setLoading(false);
      hasLoadedRef.current = true;
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await api.settings.getRoles();
      const list =
        (response as any).data?.data?.roles ??
        (response as any).data?.roles ??
        [];
      setRoles(Array.isArray(list) ? list : []);
    } catch {
      console.error("Failed to load roles");
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  // Refresh once background hydration / reconnect / manual sync completes.
  useSyncRefetch(() => {
    fetchUsers();
    fetchRoles();
  });

  const handleManualSync = async () => {
    if (syncStatus.syncing) return;
    if (!syncStatus.online) {
      toast.error("No internet. Connect and try again.");
      return;
    }
    toast.loading("Updating staff…", { id: "manual-sync-progress" });
    const success = await syncEngine.sync(['users_pull', 'roles_pull']);
    if (success) {
      toast.success("Staff list is up to date", {
        id: "manual-sync-progress",
      });
      fetchUsers();
    } else {
      toast.error("Couldn't update staff, or there was nothing new. Please try again.", {
        id: "manual-sync-progress",
      });
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchSearch =
      !searchTerm ||
      (u.full_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.username || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.username || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchRole = filterRole === "all" || u.role === filterRole;
    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "active" ? u.is_active : !u.is_active);
    return matchSearch && matchRole && matchStatus;
  });

  const openAdd = () => {
    setSelectedUser(null);
    setFormData({ ...DEFAULT_FORM });
    setAuthMode("password");
    setDialogOpen(true);
  };

  const openEdit = (user: UserItem) => {
    setSelectedUser(user);
    setFormData({
      full_name: user.full_name,
      username: user.username,
      role: user.role,
      is_active: user.is_active,
      password: "",
      pin: "",
      cancel_password: user.cancel_password || "",
    });
    setAuthMode("password");
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data: any = { ...formData };
      if (authMode === "password") delete data.pin;
      else delete data.password;

      if (data.role !== "admin") {
        delete data.cancel_password;
      } else if (!data.cancel_password) {
        delete data.cancel_password;
      }

      if (selectedUser) {
        if (!data.password) delete data.password;
        if (!data.pin) delete data.pin;
        await api.users.update(selectedUser.id, data);
        toast.success("Staff account saved");
      } else {
        await api.users.create(data);
        toast.success("Staff account added");
      }
      setDialogOpen(false);
      fetchUsers();
    } catch (err: any) {
      toast.error(
        friendlyError(err, "Couldn't save the account. Please try again."),
      );
    }
  };

  const toggleStatus = async (userId: number) => {
    try {
      await api.users.toggleStatus(userId);
      toast.success("Status updated");
      fetchUsers();
    } catch {
      toast.error("Couldn't change it. Please try again.");
    }
  };

  const deleteUser = async (userId: number) => {
    if (!window.confirm("Delete this staff account?")) return;
    try {
      await api.users.delete(userId);
      toast.success("Staff account deleted");
      fetchUsers();
    } catch {
      toast.error("Couldn't delete the account. Please try again.");
    }
  };

  return {
    loading,
    users,
    searchTerm,
    setSearchTerm,
    filterRole,
    setFilterRole,
    filterStatus,
    setFilterStatus,
    dialogOpen,
    setDialogOpen,
    selectedUser,
    formData,
    setFormData,
    authMode,
    setAuthMode,
    syncStatus,
    handleManualSync,
    filteredUsers,
    openAdd,
    openEdit,
    handleSubmit,
    toggleStatus,
    deleteUser,
    roles,
  };
};

export default useUserData;
