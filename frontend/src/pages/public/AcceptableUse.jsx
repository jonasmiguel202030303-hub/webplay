import { Link } from 'react-router-dom';
import { useTitle } from '../../hooks/useTitle.js';
import { LEGAL_LINKS } from '../../components/landing/legalCopy.js';

const SECTIONS = [
  {
    title: '1. Objetivo',
    body: ['Esta política define como a plataforma WebPlay Brasil pode ser utilizada. Ela complementa os Termos de Uso e o Aviso Legal e vale para todos os clientes, administradores e espectadores.'],
  },
  {
    title: '2. Natureza da plataforma',
    body: ['O WebPlay Brasil é uma plataforma tecnológica white label que oferece ferramentas de personalização, gerenciamento e integração de players com fontes externas compatíveis. A plataforma não comercializa, fornece, hospeda ou distribui filmes, séries, canais de televisão ou qualquer outro conteúdo audiovisual.'],
  },
  {
    title: '3. Uso permitido',
    list: [
      'Personalizar a identidade visual e a página pública do seu negócio.',
      'Conectar fontes de conteúdo que você possui, administra ou tem autorização, licença ou direito para disponibilizar.',
      'Gerenciar os espectadores cadastrados na sua página e oferecer suporte a eles.',
      'Utilizar o painel e o player de acordo com a legislação aplicável.',
    ],
  },
  {
    title: '4. Uso proibido',
    list: [
      'Disponibilizar, por meio da plataforma, conteúdo protegido por direitos autorais ou conexos sem a devida autorização do titular.',
      'Conectar fontes obtidas ou operadas de forma ilícita, ou cuja legalidade o cliente não possa comprovar.',
      'Utilizar a plataforma para fraude, phishing, disseminação de malware ou qualquer atividade ilegal.',
      'Tentar acessar contas, dados ou áreas de outros clientes, ou burlar mecanismos de segurança, limites de uso e controles de acesso.',
      'Sobrecarregar a infraestrutura de forma abusiva ou realizar ataques automatizados.',
      'Coletar ou tratar dados pessoais de espectadores em desacordo com a Lei Geral de Proteção de Dados (LGPD).',
      'Exibir conteúdo ilegal, que viole direitos de terceiros ou que explore menores de idade.',
    ],
  },
  {
    title: '5. Responsabilidade do cliente',
    body: ['O cliente é responsável pela origem, legalidade, utilização e distribuição dos conteúdos que conecta à plataforma, bem como por possuir as autorizações, licenças e direitos necessários. O WebPlay Brasil não autoriza o uso da plataforma para disponibilização de conteúdos protegidos por direitos autorais sem a devida autorização.'],
  },
  {
    title: '6. Medidas em caso de violação',
    body: ['Diante de indícios de violação desta política, o WebPlay Brasil poderá solicitar esclarecimentos e comprovações, restringir funcionalidades, suspender ou encerrar contas e cooperar com autoridades competentes, nos termos da legislação aplicável e dos Termos de Uso.'],
  },
  {
    title: '7. Denúncias e contato',
    body: ['Titulares de direitos e demais interessados podem comunicar uso indevido da plataforma pelos canais de suporte indicados no rodapé do site. Informe, sempre que possível, os dados necessários para identificar o conteúdo e a página envolvidos.'],
  },
  {
    title: '8. Atualizações',
    body: ['Esta política pode ser atualizada para refletir mudanças legais ou operacionais. A versão vigente é a publicada nesta página.'],
  },
];

export default function AcceptableUse() {
  useTitle('Política de Uso Aceitável — WebPlay Brasil');
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/" className="text-sm text-fg/60 hover:text-fg">&larr; Voltar</Link>
      <h1 className="mt-4 text-3xl font-bold">Política de Uso Aceitável</h1>
      <div className="mt-8 space-y-8 text-sm leading-7 text-fg/85">
        {SECTIONS.map((s, i) => (
          <section key={s.title} aria-labelledby={`sec-${i}`}>
            <h2 id={`sec-${i}`} className="text-lg font-semibold text-fg">{s.title}</h2>
            {s.body?.map((p) => <p key={p} className="mt-2">{p}</p>)}
            {s.list && (
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                {s.list.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
          </section>
        ))}
      </div>
      <nav className="mt-10 flex flex-wrap gap-2 border-t border-fg/10 pt-6" aria-label="Outros documentos">
        {LEGAL_LINKS.filter((l) => l.to !== '/uso-aceitavel').map((l) => (
          <Link key={l.to} to={l.to} className="btn btn-secondary btn-sm">{l.label}</Link>
        ))}
      </nav>
    </article>
  );
}
