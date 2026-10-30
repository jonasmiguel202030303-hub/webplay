import { useCallback, useEffect, useRef, useState } from 'react';
import { tenantService } from '../services/tenantService.js';
import { fieldErrors } from '../services/api.js';
import { useToast } from '../contexts/ToastContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

const toForm = (slug, b) => ({
  slug,
  displayName: b.displayName ?? '',
  shortName: b.shortName ?? '',
  colorPrimary: b.colors.primary,
  colorSecondary: b.colors.secondary,
  colorButton: b.colors.button,
  colorBackground: b.colors.background,
  bannerTitle: b.bannerTitle ?? '',
  bannerSubtitle: b.bannerSubtitle ?? '',
  welcomeText: b.welcomeText ?? '',
  supportText: b.supportText ?? '',
  whatsapp: b.whatsapp ?? '',
  externalLinks: b.externalLinks ?? [],
  notice: b.notice ?? '',
  footerText: b.footerText ?? '',
});

/** Carrega e salva a marca do assinante. Usado pelas páginas Marca e Personalização. */
export function useBrandEditor() {
  const toast = useToast();
  const { refresh } = useAuth();
  const [state, setState] = useState({ loading: true, error: null });
  const [form, setForm] = useState(null);
  const [brand, setBrand] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const baseSlug = useRef('');

  const load = useCallback(async () => {
    setState({ loading: true, error: null });
    try {
      const data = await tenantService.brand();
      baseSlug.current = data.slug;
      setBrand(data.brand);
      setForm(toForm(data.slug, data.brand));
      setDirty(false);
      setState({ loading: false, error: null });
    } catch (error) {
      setState({ loading: false, error });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Avisa ao tentar sair com alterações não salvas
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = useCallback((patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setErrors({});
    try {
      const payload = { ...form, slug: form.slug || undefined };
      const data = await tenantService.saveBrand(payload);
      baseSlug.current = data.slug;
      setBrand(data.brand);
      setForm(toForm(data.slug, data.brand));
      setDirty(false);
      toast.success('Alterações salvas.');
      refresh();
      return true;
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [form, toast, refresh]);

  const upload = useCallback(async (kind, file) => {
    const data = await tenantService.uploadAsset(kind, file);
    setBrand(data.brand);
    return data.brand;
  }, []);

  const removeAsset = useCallback(async (kind) => {
    const data = await tenantService.removeAsset(kind);
    setBrand(data.brand);
    return data.brand;
  }, []);

  return { ...state, form, brand, errors, saving, dirty, set, save, upload, removeAsset, reload: load, slugChanged: form && form.slug !== baseSlug.current };
}
