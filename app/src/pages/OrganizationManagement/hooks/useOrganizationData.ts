import { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '@/application';
import { Organization, OrgFormState } from '../types';
import { EMPTY_FORM } from '../constants';

export const useOrganizationData = () => {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Organization | null>(null);
  const [form, setForm] = useState<OrgFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.organizations.getAll(true);
      const list = (res as any)?.data?.data?.organizations ?? [];
      setOrgs(Array.isArray(list) ? list : []);
    } catch {
      toast.error("Couldn't load company accounts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setSelected(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  
  const openEdit = (org: Organization) => {
    setSelected(org);
    setForm({ 
      name: org.name ?? '', 
      contact_name: org.contact_name ?? '', 
      phone: org.phone ?? '', 
      email: org.email ?? '', 
      address: org.address ?? '', 
      notes: org.notes ?? '' 
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('Enter the company name.'); return; }
    try {
      setSaving(true);
      if (selected && selected.id) { await api.organizations.update(selected.id, form); toast.success('Company account saved'); }
      else { await api.organizations.create(form); toast.success('Company account added'); }
      setDialogOpen(false); load();
    } catch { toast.error("Couldn't save the company account. Please try again."); }
    finally { setSaving(false); }
  };

  const handleDeactivate = async (org: Organization) => {
    if (!window.confirm(`Turn off "${org.name}"?`)) return;
    if (!org.id) { toast.error("We couldn't find that company account."); return; }
    try { await api.organizations.deactivate(org.id); toast.success('Turned off'); load(); }
    catch { toast.error("Couldn't turn it off. Please try again."); }
  };

  return {
    orgs,
    loading,
    dialogOpen,
    setDialogOpen,
    selected,
    form,
    setForm,
    saving,
    load,
    openAdd,
    openEdit,
    handleSubmit,
    handleDeactivate,
  };
};
