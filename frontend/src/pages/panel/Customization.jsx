import { Save } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card.jsx';
import { Field } from '../../components/ui/Field.jsx';
import { ErrorState, PageSkeleton } from '../../components/ui/Feedback.jsx';
import Button from '../../components/ui/Button.jsx';
import ImageUpload from '../../components/ImageUpload.jsx';
import ColorField from '../../components/ColorField.jsx';
import BrandPreview from '../../components/BrandPreview.jsx';
import { useBrandEditor } from '../../hooks/useBrandEditor.js';
import { useTitle } from '../../hooks/useTitle.js';

export default function CustomizationPage() {
  useTitle('Personalização — Painel');
  const ed = useBrandEditor();
  if (ed.loading && !ed.form) return <PageSkeleton />;
  if (ed.error && !ed.form) return <ErrorState error={ed.error} onRetry={ed.reload} />;
  const { form, errors, brand } = ed;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        ed.save();
      }}
      noValidate
    >
      <PageHeader
        title="Personalização"
        description="Cores, banner e textos da página dos seus espectadores. A prévia ao lado muda em tempo real."
        actions={<Button type="submit" icon={Save} loading={ed.saving} disabled={!ed.dirty}>Salvar alterações</Button>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card title="Cores">
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField label="Cor principal" value={form.colorPrimary} onChange={(v) => ed.set({ colorPrimary: v })} error={errors.colorPrimary} />
              <ColorField label="Cor secundária" value={form.colorSecondary} onChange={(v) => ed.set({ colorSecondary: v })} error={errors.colorSecondary} />
              <ColorField label="Cor dos botões" value={form.colorButton} onChange={(v) => ed.set({ colorButton: v })} error={errors.colorButton} />
              <ColorField label="Cor de fundo" value={form.colorBackground} onChange={(v) => ed.set({ colorBackground: v })} error={errors.colorBackground} />
            </div>
            <p className="hint mt-3">O texto muda automaticamente entre claro e escuro para manter a leitura.</p>
          </Card>

          <Card title="Banner e textos">
            <div className="grid gap-4">
              <Field label="Título do banner" value={form.bannerTitle} onChange={(e) => ed.set({ bannerTitle: e.target.value })} error={errors.bannerTitle} />
              <Field label="Subtítulo do banner" value={form.bannerSubtitle} onChange={(e) => ed.set({ bannerSubtitle: e.target.value })} error={errors.bannerSubtitle} />
              <Field as="textarea" rows={3} label="Texto de boas-vindas" value={form.welcomeText} onChange={(e) => ed.set({ welcomeText: e.target.value })} error={errors.welcomeText} hint="Aparece nas telas de login e cadastro do espectador." />
              <Field as="textarea" rows={2} label="Aviso (opcional)" value={form.notice} onChange={(e) => ed.set({ notice: e.target.value })} error={errors.notice} hint="Faixa de destaque no topo da página. Deixe vazio para ocultar." />
            </div>
          </Card>

          <Card title="Imagens" description="PNG, JPG ou WebP de até 2 MB.">
            <div className="grid gap-4 sm:grid-cols-3">
              <ImageUpload label="Banner" hint="1920×1080 recomendado." value={brand.assets.banner} onUpload={(f) => ed.upload('banner', f)} onRemove={() => ed.removeAsset('banner')} />
              <ImageUpload label="Fundo" hint="Fundo das telas de acesso." value={brand.assets.background} onUpload={(f) => ed.upload('background', f)} onRemove={() => ed.removeAsset('background')} />
              <ImageUpload label="Imagem de login" hint="Lateral da tela de login." value={brand.assets.loginImage} onUpload={(f) => ed.upload('login-image', f)} onRemove={() => ed.removeAsset('login-image')} aspect="aspect-square" />
            </div>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <p className="mb-2 text-sm font-semibold">Pré-visualização</p>
          <BrandPreview form={form} brand={brand} />
        </aside>
      </div>
    </form>
  );
}
