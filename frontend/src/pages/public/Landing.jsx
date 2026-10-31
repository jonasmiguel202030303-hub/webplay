import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AppWindow, ArrowRight, Check, Globe2, Heart, ImageIcon, LayoutDashboard, Layers, MonitorSmartphone, Network, Palette,
  PlugZap, Rocket, Server, Settings2, Share2, ShieldCheck, Smartphone, Store, UserPlus, Users, UserCog,
} from 'lucide-react';
import Reveal from '../../components/landing/Reveal.jsx';
import BrandShowcase from '../../components/landing/BrandShowcase.jsx';
import { LEGAL_LINKS, LEGAL_PARAGRAPHS, LEGAL_SHORT } from '../../components/landing/legalCopy.js';
import { usePlatform } from '../../hooks/usePlatform.js';
import { useTitle } from '../../hooks/useTitle.js';
import { formatMoney } from '../../utils/format.js';

const HERO_HIGHLIGHTS = [
  { icon: Palette, text: 'Identidade própria' },
  { icon: LayoutDashboard, text: 'Gestão centralizada' },
  { icon: Smartphone, text: 'PWA instalável' },
  { icon: PlugZap, text: 'Fontes autorizadas' },
];

const AUDIENCE = [
  { icon: Server, title: 'Donos de servidores', text: 'Tenha sua própria plataforma personalizada para organizar e disponibilizar seus serviços.' },
  { icon: Network, title: 'Masters', text: 'Gerencie sua operação com uma experiência profissional e identidade visual própria.' },
  { icon: Store, title: 'Revendedores', text: 'Ofereça uma plataforma personalizada aos seus clientes e organize sua operação.' },
];

const FEATURES = [
  { icon: Palette, title: 'Personalização completa da marca', text: 'Nome, identidade visual e textos com a cara do seu negócio.' },
  { icon: ImageIcon, title: 'Logo, cores e banners', text: 'Envie seu logotipo, escolha as cores e publique banners próprios.' },
  { icon: Globe2, title: 'Página pública exclusiva', text: 'Um endereço só seu para compartilhar com os seus clientes.' },
  { icon: PlugZap, title: 'Fontes compatíveis e autorizadas', text: 'Conecte fontes compatíveis com o padrão Xtream Codes que você tem direito de utilizar.' },
  { icon: Users, title: 'Perfis de espectadores', text: 'Cada espectador organiza seus perfis dentro da sua página.' },
  { icon: Heart, title: 'Favoritos e histórico', text: 'Lista de favoritos, histórico e continuar de onde parou.' },
  { icon: MonitorSmartphone, title: 'Celular, tablet e computador', text: 'Layout adaptado a cada tela, do aparelho mais simples ao desktop.' },
  { icon: AppWindow, title: 'Instalação como PWA', text: 'Seus clientes instalam como aplicativo web, direto do navegador.' },
  { icon: Settings2, title: 'Painel administrativo', text: 'Gerencie marca, fontes, player e configurações em um só lugar.' },
  { icon: UserCog, title: 'Gerenciamento de assinantes', text: 'Acompanhe e administre os espectadores cadastrados na sua página.' },
  { icon: ShieldCheck, title: 'Segurança e privacidade', text: 'Credenciais criptografadas, isolamento entre contas e fluxos de privacidade (LGPD).' },
];

const STEPS = [
  { icon: UserPlus, title: 'Crie sua conta', text: 'Cadastre-se e entre direto, sem precisar ativar por e-mail.' },
  { icon: Palette, title: 'Personalize sua plataforma', text: 'Defina logotipo, cores e banners da sua marca.' },
  { icon: PlugZap, title: 'Configure sua fonte autorizada', text: 'Conecte a fonte que você tem direito de utilizar.' },
  { icon: Share2, title: 'Compartilhe sua página personalizada', text: 'Envie o link exclusivo para os seus clientes.' },
];

function SectionTitle({ id, eyebrow, title, children }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <span className="lp-eyebrow">{eyebrow}</span>
      <h2 id={id} className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {children && <p className="mt-3 text-fg/70">{children}</p>}
    </Reveal>
  );
}

function PlanBenefits({ items }) {
  return (
    <ul className="mt-6 space-y-3 text-sm">
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2.5">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
          <span className="text-fg/85">{t}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Landing() {
  useTitle('WebPlay Brasil — Plataforma white label de streaming para donos de servidores');
  const platform = usePlatform();
  const { hash, key } = useLocation();
  const trialLabel = platform ? `Testar grátis por ${platform.trialHours} horas` : 'Testar grátis';

  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, key]);

  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden" aria-labelledby="hero-title">
        <img
          src="/landing/hero-1280.webp"
          srcSet="/landing/hero-640.webp 640w, /landing/hero-1280.webp 1280w, /landing/hero-1920.webp 1920w"
          sizes="100vw"
          width="1920"
          height="1080"
          alt=""
          aria-hidden="true"
          fetchpriority="high"
          decoding="async"
          className="absolute inset-0 -z-30 h-full w-full object-cover object-[75%_center]"
        />
        <div className="absolute inset-0 -z-20 bg-gradient-to-r from-bg via-bg/85 to-bg/20 sm:via-bg/70" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-bg to-transparent" aria-hidden />
        <div className="pointer-events-none absolute -left-32 top-10 -z-10 h-96 w-96 rounded-full bg-primary/25 blur-[120px]" aria-hidden />
        <div className="pointer-events-none absolute -right-20 bottom-10 -z-10 h-80 w-80 rounded-full bg-secondary/25 blur-[120px]" aria-hidden />

        <div className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:pb-28 sm:pt-24 lg:pt-32">
          <div className="max-w-2xl">
            <Reveal>
              <span className="lp-eyebrow"><Layers className="h-3.5 w-3.5" aria-hidden />Plataforma white label</span>
            </Reveal>
            <Reveal delay={80}>
              <h1 id="hero-title" className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                Sua estrutura de streaming.{' '}
                <span className="gradient-text">Sua marca. Sua plataforma.</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 text-base leading-relaxed text-fg/75 sm:text-lg">
                Uma plataforma white label desenvolvida para donos de servidores, masters e revendedores que desejam oferecer uma experiência profissional aos seus clientes, com identidade visual própria e gerenciamento centralizado.
              </p>
            </Reveal>
            <Reveal delay={240} className="mt-8 flex flex-wrap gap-3">
              <Link to="/cadastro" className="btn btn-primary btn-glow group px-6 py-3 text-base">
                {trialLabel}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden />
              </Link>
              <Link to="/entrar" className="btn btn-secondary px-6 py-3 text-base backdrop-blur">Já tenho uma conta</Link>
            </Reveal>
            <Reveal delay={300}>
              <p className="mt-3 text-xs text-fg/60">Sem cartão de crédito para começar o teste.</p>
            </Reveal>
            <Reveal delay={360}>
              <ul className="mt-8 flex flex-wrap gap-2" aria-label="Destaques da plataforma">
                {HERO_HIGHLIGHTS.map(({ icon: Icon, text }) => (
                  <li key={text} className="inline-flex items-center gap-2 rounded-full border border-fg/10 bg-fg/5 px-3 py-1.5 text-xs font-medium text-fg/80 backdrop-blur">
                    <Icon className="h-3.5 w-3.5 text-violet-300" aria-hidden />{text}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Faixa legal curta */}
      <div className="border-y border-fg/10 bg-fg/[0.03]">
        <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-4 text-center text-xs text-fg/70 sm:text-sm">
          <ShieldCheck className="h-4 w-4 shrink-0 text-violet-300" aria-hidden />
          <span>Solução tecnológica para quem possui suas próprias fontes autorizadas. O WebPlay Brasil não fornece conteúdo audiovisual.</span>
          <a href="#aviso-legal" className="font-semibold text-violet-300 underline-offset-4 hover:underline">Leia o aviso legal</a>
        </p>
      </div>

      {/* Público */}
      <section id="para-quem" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20" aria-labelledby="titulo-publico">
        <SectionTitle id="titulo-publico" eyebrow="Para quem é" title="Desenvolvido para quem trabalha com servidores">
          O WebPlay é uma solução tecnológica para empresas e profissionais que possuem suas próprias fontes autorizadas.
        </SectionTitle>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {AUDIENCE.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 100} className="lp-card">
              <div className="lp-icon"><Icon className="h-5 w-5" aria-hidden /></div>
              <h3 className="mt-5 text-sm font-bold uppercase tracking-wider text-violet-200">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg/70">{text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="relative scroll-mt-20 border-t border-fg/10 bg-gradient-to-b from-primary/[0.06] to-transparent py-20" aria-labelledby="titulo-recursos">
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle id="titulo-recursos" eyebrow="Recursos" title="Tudo para lançar a sua plataforma">
            Ferramentas de personalização, gerenciamento e integração em um só lugar.
          </SectionTitle>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={(i % 3) * 80} className="lp-card">
                <div className="lp-icon"><Icon className="h-5 w-5" aria-hidden /></div>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-fg/65">{text}</p>
              </Reveal>
            ))}
            <Reveal delay={160} className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/30 via-primary/10 to-secondary/20 p-6">
              <div>
                <Rocket className="h-6 w-6 text-violet-200" aria-hidden />
                <h3 className="mt-4 text-lg font-bold">Pronto para começar?</h3>
                <p className="mt-1.5 text-sm text-fg/75">Crie sua conta e monte sua plataforma.</p>
              </div>
              <Link to="/cadastro" className="btn btn-primary mt-6 self-start">Criar conta<ArrowRight className="h-4 w-4" aria-hidden /></Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20" aria-labelledby="titulo-passos">
        <SectionTitle id="titulo-passos" eyebrow="Como funciona" title="Quatro passos até a sua página no ar" />
        <ol className="relative mt-14 grid gap-8 md:grid-cols-4 md:gap-6">
          <div className="pointer-events-none absolute left-[12%] right-[12%] top-6 hidden h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent md:block" aria-hidden />
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <Reveal as="li" key={title} delay={i * 100} className="relative text-center md:px-2">
              <span className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-primary/50 bg-gradient-to-br from-primary to-secondary text-base font-extrabold text-white shadow-[0_0_30px_-6px_rgb(var(--c-primary)/0.8)]">
                {i + 1}
              </span>
              <Icon className="mx-auto mt-4 h-5 w-5 text-violet-300" aria-hidden />
              <h3 className="mt-2 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-fg/65">{text}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* Demonstração */}
      <section id="demonstracao" className="scroll-mt-20 overflow-hidden border-t border-fg/10 py-20" aria-labelledby="titulo-demo">
        <div className="mx-auto max-w-6xl px-4">
          <SectionTitle id="titulo-demo" eyebrow="Sua página" title="Com a sua marca, nas suas cores">
            Ilustração de como a página do seu cliente pode ficar no computador e no celular.
          </SectionTitle>
          <Reveal className="mx-auto mt-12 max-w-4xl">
            <BrandShowcase />
          </Reveal>
          <p className="mt-8 text-center text-xs text-fg/55">
            Imagem ilustrativa da interface. O WebPlay Brasil não possui catálogo próprio de filmes, séries ou canais.
          </p>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="scroll-mt-20 border-t border-fg/10 bg-gradient-to-b from-transparent via-primary/[0.06] to-transparent py-20" aria-labelledby="titulo-planos">
        <div className="mx-auto max-w-5xl px-4">
          <SectionTitle id="titulo-planos" eyebrow="Planos" title="Comece no teste, continue no plano">
            Valores e regras comerciais conforme configurados na plataforma.
          </SectionTitle>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <Reveal className="lp-card flex flex-col">
              <p className="text-sm font-semibold uppercase tracking-wider text-fg/60">Teste gratuito</p>
              {platform ? (
                <p className="mt-3 text-4xl font-extrabold">{platform.trialHours} horas<span className="text-base font-medium text-fg/60"> grátis</span></p>
              ) : (
                <div className="skeleton mt-3 h-10 w-40" aria-hidden />
              )}
              <p className="mt-1 text-sm text-fg/65">Para conhecer a plataforma antes de contratar.</p>
              <PlanBenefits items={['Crie sua conta e ative pelo e-mail', 'Personalize marca, cores e página', 'Sem cartão de crédito para começar', 'Um teste gratuito por conta']} />
              <Link to="/cadastro" className="btn btn-secondary mt-8 w-full">{trialLabel}</Link>
            </Reveal>

            <Reveal delay={100} className="relative flex flex-col overflow-hidden rounded-2xl border border-primary/50 bg-gradient-to-b from-primary/20 to-fg/[0.03] p-6 shadow-[0_0_60px_-20px_rgb(var(--c-primary)/0.7)]">
              <span className="absolute right-4 top-4 rounded-full bg-primary px-3 py-1 text-xs font-bold text-on-button">Plano anual</span>
              <p className="text-sm font-semibold uppercase tracking-wider text-violet-200">Plano completo</p>
              {platform ? (
                <>
                  <p className="mt-3 text-4xl font-extrabold">
                    {formatMoney(platform.priceCents)}
                    <span className="text-base font-medium text-fg/60"> / {platform.subscriptionMonths === 12 ? 'ano' : `${platform.subscriptionMonths} meses`}</span>
                  </p>
                  <p className="mt-1 text-sm text-fg/65">equivale a {formatMoney(Math.round(platform.priceCents / platform.subscriptionMonths))} por mês</p>
                </>
              ) : (
                <>
                  <div className="skeleton mt-3 h-10 w-48" aria-hidden />
                  <p className="mt-1 text-sm text-fg/50">Carregando valores…</p>
                </>
              )}
              <PlanBenefits items={['Marca e página personalizadas', 'Espectadores e perfis', 'Painel administrativo', 'Atualizações incluídas']} />
              <Link to="/cadastro" className="btn btn-primary btn-glow mt-8 w-full">Começar agora</Link>
            </Reveal>
          </div>
          <p className="mt-6 text-center text-xs text-fg/55">
            O WebPlay Brasil fornece apenas a plataforma tecnológica. O conteúdo exibido é de responsabilidade de cada cliente.
          </p>
        </div>
      </section>

      {/* Aviso legal */}
      <section id="aviso-legal" className="mx-auto max-w-4xl scroll-mt-20 px-4 py-20" aria-labelledby="titulo-aviso">
        <Reveal className="rounded-2xl border border-fg/10 bg-gradient-to-b from-fg/[0.05] to-fg/[0.02] p-6 sm:p-10">
          <div className="flex items-center gap-3">
            <div className="lp-icon"><ShieldCheck className="h-5 w-5" aria-hidden /></div>
            <h2 id="titulo-aviso" className="text-2xl font-extrabold tracking-tight">Aviso legal</h2>
          </div>
          <div className="mt-5 space-y-3 text-sm leading-relaxed text-fg/75">
            {LEGAL_PARAGRAPHS.map((p) => <p key={p}>{p}</p>)}
          </div>
          <nav className="mt-6 flex flex-wrap gap-2" aria-label="Documentos legais">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="btn btn-secondary btn-sm">{l.label}</Link>
            ))}
          </nav>
        </Reveal>
      </section>

      {/* CTA final */}
      <section className="px-4 pb-20" aria-labelledby="titulo-cta">
        <Reveal className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/30 via-bg to-secondary/25 px-6 py-14 text-center sm:px-12">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-primary/40 blur-[90px]" aria-hidden />
          <h2 id="titulo-cta" className="relative text-3xl font-extrabold tracking-tight sm:text-4xl">Tenha a sua própria plataforma</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-fg/75">Monte sua página com identidade visual própria e gerencie tudo em um painel centralizado.</p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/cadastro" className="btn btn-primary btn-glow px-6 py-3 text-base">{trialLabel}</Link>
            <Link to="/entrar" className="btn btn-secondary px-6 py-3 text-base">Já tenho uma conta</Link>
          </div>
          <p className="relative mx-auto mt-6 max-w-xl text-xs text-fg/55">{LEGAL_SHORT}</p>
        </Reveal>
      </section>
    </>
  );
}
