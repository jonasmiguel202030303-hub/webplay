import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Pencil, Plus } from 'lucide-react';
import BrandLogo from '../../components/viewer/BrandLogo.jsx';
import SoundToggle from '../../components/viewer/SoundToggle.jsx';
import { playProfileSound } from '../../utils/sound.js';
import ProfileAvatar, { AVATAR_GROUPS, DEFAULT_AVATAR } from '../../components/viewer/ProfileAvatar.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { fieldErrors } from '../../services/api.js';
import { useTitle } from '../../hooks/useTitle.js';

const AVATAR_BOX = 'h-24 w-24 sm:h-32 sm:w-32 lg:h-40 lg:w-40';
const OUTLINE_BTN = 'border border-fg/40 px-6 py-2 text-sm font-semibold uppercase tracking-widest text-fg/70 transition hover:border-fg hover:text-fg disabled:opacity-50';
const SOLID_BTN = 'bg-fg px-6 py-2 text-sm font-bold uppercase tracking-widest text-bg transition hover:bg-primary hover:text-on-button disabled:opacity-50';

/** Seletor de ícones em fileiras por categoria ("Escolha um ícone de perfil"). */
function AvatarPicker({ value, onPick, onBack }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16">
      <div className="flex items-center gap-4 py-6">
        <button type="button" onClick={onBack} className="rounded-full border border-fg/40 p-2 text-fg/70 hover:border-fg hover:text-fg" aria-label="Voltar">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs uppercase tracking-widest text-fg/50">Editar perfil</p>
          <h1 className="text-2xl font-bold sm:text-3xl">Escolha um ícone de perfil</h1>
        </div>
      </div>
      <div className="space-y-8">
        {AVATAR_GROUPS.map((g) => (
          <section key={g.id} aria-label={g.label}>
            <h2 className="mb-3 text-lg font-semibold text-fg/90">{g.label}</h2>
            <div className="flex flex-wrap gap-3">
              {g.keys.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onPick(k)}
                  aria-label={`Ícone ${k}`}
                  aria-pressed={value === k}
                  className={`rounded-md border-[3px] transition ${value === k ? 'border-fg' : 'border-transparent opacity-80 hover:scale-105 hover:opacity-100'}`}
                >
                  <ProfileAvatar name="?" avatar={k} className="!h-16 !w-16 sm:!h-24 sm:!w-24" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Tela "Editar perfil" / "Adicionar perfil". */
function ProfileEditor({ initial, kidsEnabled, canDelete, onCancel, onSaved, onDelete }) {
  const { svc } = useViewer();
  const [form, setForm] = useState(initial ? { name: initial.name, avatar: initial.avatar, isKids: initial.isKids } : { name: '', avatar: DEFAULT_AVATAR, isKids: false });
  const [picking, setPicking] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      if (initial) await svc.updateProfile(initial.id, form);
      else await svc.createProfile(form);
      await onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err);
      setBusy(false);
    }
  };

  if (picking) return <AvatarPicker value={form.avatar} onBack={() => setPicking(false)} onPick={(avatar) => { setForm({ ...form, avatar }); setPicking(false); }} />;

  return (
    <form onSubmit={submit} noValidate className="mx-auto w-full max-w-2xl px-4 pb-16">
      <h1 className="text-3xl font-bold sm:text-5xl">{initial ? 'Editar perfil' : 'Adicionar perfil'}</h1>
      {!initial && <p className="mt-2 text-fg/60">Adicione um perfil para outra pessoa que assiste.</p>}
      <div className="mt-6 flex flex-col gap-6 border-y border-fg/20 py-6 sm:flex-row sm:items-start">
        <button type="button" onClick={() => setPicking(true)} className="relative shrink-0 self-start" aria-label="Alterar ícone do perfil">
          <ProfileAvatar name={form.name || '?'} avatar={form.avatar} className="!h-28 !w-28 sm:!h-36 sm:!w-36" />
          <span className="absolute bottom-2 left-2 flex h-9 w-9 items-center justify-center rounded-full border border-fg/60 bg-black/70 text-white"><Pencil className="h-4 w-4" /></span>
        </button>
        <div className="min-w-0 flex-1 space-y-5">
          {error && !errors.name && <Alert tone="error">{error.message}</Alert>}
          <div>
            <label htmlFor="profile-name" className="sr-only">Nome do perfil</label>
            <input
              id="profile-name"
              className="w-full border border-fg/30 bg-fg/10 px-3 py-3 text-lg text-fg placeholder:text-fg/40 focus:border-fg focus:outline-none"
              placeholder="Nome"
              maxLength={40}
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name}</p>}
          </div>
          {kidsEnabled && (
            <label className="flex cursor-pointer items-center gap-3 text-fg/90">
              <input type="checkbox" className="h-5 w-5" checked={form.isKids} onChange={(e) => setForm({ ...form, isKids: e.target.checked })} />
              <span><span className="font-semibold">Perfil infantil</span><span className="block text-sm text-fg/60">Mostra somente categorias infantis.</span></span>
            </label>
          )}
        </div>
      </div>
      <div className="mt-8 flex flex-wrap gap-4">
        <button type="submit" disabled={busy || !form.name.trim()} className={SOLID_BTN}>{busy ? 'Salvando…' : 'Salvar'}</button>
        <button type="button" onClick={onCancel} className={OUTLINE_BTN}>Cancelar</button>
        {initial && canDelete && <button type="button" onClick={onDelete} className={OUTLINE_BTN}>Excluir perfil</button>}
      </div>
    </form>
  );
}

export default function ProfileSelect() {
  const { slug, tenant, profiles, profile, svc, selectProfile, refreshProfiles } = useViewer();
  useTitle(`Quem está assistindo? — ${tenant.brand.displayName}`);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [manage, setManage] = useState(false);
  const [editing, setEditing] = useState(null); // null | 'new' | profile
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const from = location.state?.from;
  const target = from && from.startsWith(`/${slug}`) && !from.includes('/perfis') ? from : `/${slug}`;
  const canAdd = profiles.length < (tenant.maxProfilesPerViewer ?? 5);

  const choose = (p) => {
    playProfileSound();
    selectProfile(p.id);
    navigate(target, { replace: true });
  };

  const remove = async () => {
    setBusy(true);
    try {
      await svc.deleteProfile(removing.id);
      if (profile?.id === removing.id) selectProfile(null);
      await refreshProfiles();
      toast.success('Perfil removido.');
      setRemoving(null);
      setEditing(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex items-center justify-between gap-3 px-6 py-5 sm:px-10">
        <BrandLogo className="text-xl" imgClassName="h-10 max-w-[200px]" />
        <SoundToggle />
      </header>

      {editing !== null ? (
        <main className="flex flex-1 flex-col items-center pt-4">
          <ProfileEditor
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? null : editing}
            kidsEnabled={tenant.kidsProfilesEnabled}
            canDelete={profiles.length > 1}
            onCancel={() => setEditing(null)}
            onDelete={() => setRemoving(editing)}
            onSaved={async () => {
              await refreshProfiles();
              toast.success('Perfil salvo.');
              setEditing(null);
            }}
          />
        </main>
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
          <h1 className="text-3xl font-medium sm:text-5xl">{manage ? 'Gerenciar perfis:' : 'Quem está assistindo?'}</h1>
          <ul className="mt-8 flex flex-wrap justify-center gap-4 sm:gap-8">
            {profiles.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => (manage ? setEditing(p) : choose(p))}
                  className="group flex w-24 flex-col items-center gap-3 focus-visible:outline-offset-4 sm:w-32 lg:w-40"
                  aria-label={manage ? `Editar perfil ${p.name}` : `Assistir como ${p.name}`}
                >
                  <span className={`relative block overflow-hidden rounded-md border-[3px] border-transparent transition group-hover:border-fg group-focus-visible:border-fg ${AVATAR_BOX}`}>
                    <ProfileAvatar name={p.name} avatar={p.avatar} className={`!h-full !w-full !rounded-none ${manage ? 'opacity-50' : ''}`} />
                    {manage && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white text-white"><Pencil className="h-5 w-5" /></span>
                      </span>
                    )}
                  </span>
                  <span className="max-w-full truncate text-base text-fg/60 transition group-hover:text-fg sm:text-lg">{p.name}</span>
                  {p.isKids && <span className="-mt-2 text-[10px] font-bold uppercase tracking-widest text-fg/50">Infantil</span>}
                </button>
              </li>
            ))}
            {canAdd && (
              <li>
                <button type="button" onClick={() => setEditing('new')} className="group flex w-24 flex-col items-center gap-3 sm:w-32 lg:w-40" aria-label="Adicionar perfil">
                  <span className={`flex items-center justify-center rounded-md border-[3px] border-transparent transition group-hover:bg-fg group-hover:text-bg ${AVATAR_BOX}`}>
                    <Plus className="h-14 w-14 sm:h-16 sm:w-16" strokeWidth={1.5} />
                  </span>
                  <span className="text-base text-fg/60 transition group-hover:text-fg sm:text-lg">Adicionar perfil</span>
                </button>
              </li>
            )}
          </ul>
          <div className="mt-12 flex gap-4">
            {manage ? (
              <button type="button" onClick={() => setManage(false)} className={SOLID_BTN}>Concluído</button>
            ) : (
              <>
                <button type="button" onClick={() => setManage(true)} className={OUTLINE_BTN}>Gerenciar perfis</button>
                {profile && <button type="button" onClick={() => navigate(target, { replace: true })} className={OUTLINE_BTN}>Voltar</button>}
              </>
            )}
          </div>
        </main>
      )}

      <ConfirmDialog
        open={!!removing}
        title="Remover perfil"
        message={removing ? `Remover o perfil "${removing.name}"? Favoritos, histórico e progresso deste perfil serão apagados.` : ''}
        confirmLabel="Remover"
        danger
        loading={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
