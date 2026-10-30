// Textos iniciais publicados na primeira migração. A Lumo Tecnologia deve revisá-los com assessoria jurídica
// antes da operação comercial; novas versões são publicadas pelo painel master (cada versão fica registrada).

export const INITIAL_TERMS_VERSION = '1.0';

export const initialDocuments = [
  {
    doc_type: 'terms',
    title: 'Termos de Uso',
    content: `# Termos de Uso — WebPlay Brasil

Versão 1.0. Operado pela Lumo Tecnologia ("Lumo").

## 1. O que é a WebPlay Brasil
A WebPlay Brasil é uma plataforma de software (SaaS) que oferece ferramentas de personalização e reprodução de webplayers. A plataforma **não fornece, não vende e não licencia conteúdo audiovisual, canais ou direitos de transmissão**.

## 2. Conta e responsabilidades do assinante
- O assinante deve informar dados verdadeiros e manter a confidencialidade de suas credenciais.
- O assinante é o único responsável pelas fontes de conteúdo que cadastrar, pelos espectadores que administrar e pela marca que publicar.
- O assinante declara possuir direitos, licenças e autorização para acessar, reproduzir e disponibilizar o conteúdo das fontes cadastradas.
- É proibido utilizar a plataforma para distribuir ou acessar conteúdo sem autorização, violar direitos de terceiros ou contornar medidas técnicas de proteção.

## 3. Teste gratuito e assinatura
- Cada conta tem direito a um único teste gratuito, com duração definida pela plataforma (inicialmente 48 horas), contada pelos relógios do servidor a partir da ativação da conta.
- O teste gratuito da plataforma não representa assinatura de canais ou de conteúdo.
- O plano comercial inicial é anual. O valor vigente é exibido antes da contratação e pode ser alterado para novas contratações.
- A assinatura é ativada somente após a confirmação do pagamento pelo meio de pagamento. A renovação antecipada acrescenta o período contratado ao vencimento vigente, sem perder dias já pagos.
- Com o término do teste ou da assinatura, o acesso aos recursos protegidos do player é bloqueado; o painel do assinante, suas configurações e seus dados permanecem disponíveis para renovação.

## 4. Suspensão e encerramento
A Lumo pode suspender ou encerrar contas em caso de uso ilícito, violação destes termos, fraude ou determinação legal ou judicial, assegurando-se ao assinante as garantias previstas em lei.

## 5. Dados e privacidade
O tratamento de dados pessoais segue a Política de Privacidade e a Lei Geral de Proteção de Dados (Lei 13.709/2018).

## 6. Limites de responsabilidade
A Lumo emprega esforços razoáveis para manter a plataforma disponível, mas não garante funcionamento ininterrupto nem compatibilidade com todas as fontes, navegadores ou dispositivos. Nada nestes termos exclui responsabilidades que a legislação, inclusive o Código de Defesa do Consumidor, torne obrigatórias.

## 7. Alterações
Novas versões destes termos serão publicadas na plataforma, com registro de versão e data de aceite.
`,
  },
  {
    doc_type: 'privacy',
    title: 'Política de Privacidade',
    content: `# Política de Privacidade — WebPlay Brasil

Versão 1.0. Controlador: Lumo Tecnologia, para os dados de contas de assinantes. Em relação aos espectadores de cada marca, o assinante atua como controlador e a Lumo como operadora.

## Dados tratados
- **Assinantes:** nome, e-mail, dados da marca, registros de acesso, aceite de termos, histórico de pagamentos (sem dados completos de cartão, que ficam com o Mercado Pago).
- **Espectadores:** nome, e-mail, perfis, favoritos, histórico e progresso de reprodução.
- **Credenciais de fontes:** armazenadas criptografadas e nunca exibidas após o cadastro.
- **Registros técnicos:** endereço IP (armazenado como código de verificação irreversível para prevenção de abuso do teste gratuito) e dados de auditoria.

## Finalidades e bases legais
Execução do contrato, cumprimento de obrigação legal, prevenção a fraudes e legítimo interesse na segurança do serviço.

## Direitos do titular (LGPD)
Você pode solicitar confirmação de tratamento, acesso, correção, portabilidade e eliminação dos dados pelos canais de atendimento ou pela área de privacidade da plataforma. Solicitações são registradas e respondidas nos prazos legais.

## Retenção
Dados são mantidos enquanto a conta existir e pelo prazo necessário a obrigações legais e fiscais. Tokens expirados, sessões antigas e registros técnicos são eliminados periodicamente.

## Segurança
Senhas armazenadas com hash, comunicação por HTTPS, controle de acesso por função, isolamento entre assinantes e registro de auditoria.

## Contato
Utilize a Central de Ajuda da plataforma.
`,
  },
  {
    doc_type: 'legal',
    title: 'Aviso Legal',
    content: `# Aviso Legal — WebPlay Brasil

- A WebPlay Brasil fornece ferramentas de personalização e reprodução. **Não fornece direitos de transmissão nem conteúdo.**
- O assinante deve possuir direitos e autorização para acessar e reproduzir o conteúdo das fontes que cadastrar e é responsável pela legalidade dessas fontes.
- É proibido utilizar o sistema para distribuir conteúdo sem autorização.
- A plataforma pode suspender usos ilícitos conforme seus termos e a legislação aplicável.
- A reprodução ocorre, por padrão, diretamente entre o navegador do espectador e a fonte autorizada; o servidor da WebPlay Brasil não retransmite vídeo.
- Marcas de terceiros citadas pertencem aos seus titulares. Este serviço não é afiliado a plataformas de streaming de terceiros.
- Aplicativo web instalável (PWA) não equivale a aplicativo nativo publicado em lojas de aplicativos.
`,
  },
];

export const defaultPlatformSettings = {
  product_name: 'WebPlay Brasil',
  price_cents: 9700,
  subscription_months: 12,
  trial_hours: 48,
  renewal_window_days: 365,
  mp_mode: 'test',
  support_whatsapp: '',
  support_email: '',
  support_hours_text: '',
  commercial_headline: 'Seu webplayer com a sua marca',
  commercial_description:
    'Personalize logotipo, cores e página pública, conecte suas fontes autorizadas e ofereça uma experiência de streaming moderna aos seus espectadores.',
  footer_text: 'WebPlay Brasil — Plataforma de personalização de webplayers. Desenvolvido por Lumo Tecnologia.',
};
