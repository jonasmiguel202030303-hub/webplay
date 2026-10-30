import { Plus, Save, Trash2 } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card.jsx';
import { Field } from '../../components/ui/Field.jsx';
import { Alert, ErrorState, PageSkeleton } from '../../components/ui/Feedback.jsx';
import Button from '../../components/ui/Button.jsx';
import ImageUpload from '../../components/ImageUpload.jsx';
import { useBrandEditor } from '../../hooks/useBrandEditor.js';
import { useTitle } from '../../hooks/useTitle.js';

export default function BrandPage() {
  useTitle('Marca — Painel');
  const ed = useBrandEditor();
  if (ed.loading && !ed.form) return <PageSkeleton />;
  if (ed.error && !ed.form) return <ErrorState error={ed.error} onRetry={ed.reload} />;
  const { form, errors, brand } = ed;
  const links = form.externalLinks;
  const setLink = (i, patch) => ed.set({ externalLinks: links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) });

  const submit = (e) => {
    e.preventDefault();
    ed.save();
  };

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        title="Marca"
        description="Nome, endereço, logotipos e canais de contato exibidos para os seus espectadores."
        actions={<Button type="submit" icon={Save} loading={ed.saving} disabled={!ed.dirty}>Salvar alterações</Button>}
      />

      <div className="space-y-6">
        <Card title="Identidade">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da plataforma" required value={form.displayName} onChange={(e) => ed.set({ displayName: e.target.value })} error={errors.displayName} />
            <Field label="Nome curto" required maxLength={20} value={form.shortName} onChange={(e) => ed.set({ shortName: e.target.value })} error={errors.shortName} hint="Usado no ícone do aplicativo instalado." />
            <div className="sm:col-span-2">
              <Field label="Endereço da página" required value={form.slug} onChange={(e) => ed.set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} error={errors.slug} hint={`Seu link: ${window.location.origin}/${form.slug}`} />
              {ed.slugChanged && <Alert tone="warning" className="mt-2">Ao mudar o endereço, o link antigo deixa de funcionar e seus espectadores precisarão do novo link.</Alert>}
            </div>
          </div>
        </Card>

        <Card title="Logotipos" description="PNG, JPG ou WebP de até 2 MB. As imagens são otimizadas automaticamente.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ImageUpload label="Logo principal" hint="Quadrada, 512×512 recomendado. Gera o ícone do app." value={brand.assets.logo} onUpload={(f) => ed.upload('logo', f)} onRemove={() => ed.removeAsset('logo')} aspect="aspect-square" contain />
            <ImageUpload label="Favicon" hint="64×64." value={brand.assets.favicon} onUpload={(f) => ed.upload('favicon', f)} onRemove={() => ed.removeAsset('favicon')} aspect="aspect-square" contain />
            <ImageUpload label="Logo do menu" hint="Horizontal, até 400×160." value={brand.assets.menuLogo} onUpload={(f) => ed.upload('menu-logo', f)} onRemove={() => ed.removeAsset('menu-logo')} aspect="aspect-[5/2]" contain />
            <ImageUpload label="Logo sobre conteúdo" hint="Para fundos escuros/imagens." value={brand.assets.contentLogo} onUpload={(f) => ed.upload('content-logo', f)} onRemove={() => ed.removeAsset('content-logo')} aspect="aspect-[5/2]" contain />
          </div>
        </Card>

        <Card title="Contato e suporte">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="WhatsApp de suporte" inputMode="tel" value={form.whatsapp} onChange={(e) => ed.set({ whatsapp: e.target.value })} error={errors.whatsapp} hint="DDI + DDD + número. Ex.: 5511999999999" />
            <Field label="Texto de suporte" value={form.supportText} onChange={(e) => ed.set({ supportText: e.target.value })} error={errors.supportText} hint="Exibido na página de ajuda do espectador." />
            <div className="sm:col-span-2">
              <Field label="Rodapé da sua página" value={form.footerText} onChange={(e) => ed.set({ footerText: e.target.value })} error={errors.footerText} />
            </div>
          </div>
        </Card>

        <Card title="Links externos" description="Até 5 links (site, redes sociais, etc.).">
          <div className="space-y-3">
            {links.map((l, i) => (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <Field label="Rótulo" value={l.label} maxLength={40} onChange={(e) => setLink(i, { label: e.target.value })} />
                <Field label="URL" type="url" placeholder="https://" value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} />
                <Button variant="ghost" icon={Trash2} onClick={() => ed.set({ externalLinks: links.filter((_, idx) => idx !== i) })} aria-label="Remover link" />
              </div>
            ))}
            {errors.externalLinks && <p className="field-error">{errors.externalLinks}</p>}
            {links.length < 5 && <Button variant="secondary" size="sm" icon={Plus} onClick={() => ed.set({ externalLinks: [...links, { label: '', url: '' }] })}>Adicionar link</Button>}
          </div>
        </Card>
      </div>
    </form>
  );
}
