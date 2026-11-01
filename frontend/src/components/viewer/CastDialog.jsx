import { useState } from 'react';
import { Airplay, ArrowLeft, Box, Cast, Check, Copy, Flame, Loader2, Monitor, Smartphone, Tv, Wifi, X } from 'lucide-react';

const UA = typeof navigator === 'undefined' ? '' : navigator.userAgent;
const IOS = /iPhone|iPad|iPod/.test(UA);
// Busca automática de TVs depende do Google Cast (Chrome/Edge); no iOS só o AirPlay do Safari funciona.
const CAN_CAST = !IOS && /Chrome|Chromium|Edg\//.test(UA) && !/OPR|Firefox/.test(UA);

const DEVICES = [
  { id: 'tv', icon: Tv, name: 'Smart TV', hint: 'Com Chromecast embutido' },
  { id: 'box', icon: Box, name: 'TV Box', hint: 'Android TV / Google TV' },
  { id: 'chromecast', icon: Cast, name: 'Chromecast', hint: 'Google Chromecast' },
  { id: 'fire', icon: Flame, name: 'Fire Stick', hint: 'Amazon Fire TV' },
];

const MIRROR = [
  { icon: Smartphone, name: 'Android', steps: 'Deslize a barra de atalhos e toque em Transmitir, Smart View ou Espelhar tela. Escolha a TV na lista.' },
  { icon: Smartphone, name: 'iPhone / iPad', steps: 'Abra a Central de Controle, toque em Espelhamento de Tela e escolha a Apple TV ou TV compatível com AirPlay.' },
  { icon: Monitor, name: 'Windows', steps: 'Pressione Windows + K, escolha a TV na lista e aguarde a conexão.' },
  { icon: Monitor, name: 'Mac', steps: 'Abra a Central de Controle, clique em Espelhamento de Tela e escolha a TV.' },
];

function Step({ n, children }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{n}</span>
      <span className="text-sm leading-relaxed text-white/80">{children}</span>
    </li>
  );
}

export default function CastDialog({ onClose, onSearch, busy, note, airplay, onAirplay }) {
  const [view, setView] = useState('home');
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* sem permissão de área de transferência */ }
  };

  const pick = (id) => (id === 'fire' ? setView('fire') : onSearch());

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Transmitir para a TV" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-neutral-950 text-white shadow-2xl ring-1 ring-white/10 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          {view !== 'home' && (
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10" onClick={() => setView('home')} aria-label="Voltar"><ArrowLeft className="h-5 w-5" aria-hidden /></button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{view === 'fire' ? 'Fire Stick' : view === 'mirror' ? 'Espelhar a tela' : 'Transmitir para a TV'}</h2>
            {view === 'home' && <p className="flex items-center gap-1.5 text-xs text-white/60"><Wifi className="h-3.5 w-3.5" aria-hidden /> Aparelho e TV na mesma rede Wi-Fi</p>}
          </div>
          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" aria-hidden /></button>
        </header>

        <div className="overflow-y-auto p-4">
          {view === 'home' && (
            <>
              <p className="mb-3 text-sm text-white/70">Escolha o seu aparelho. A busca lista automaticamente as TVs, TV Boxes e Chromecasts que estiverem ligados na sua rede.</p>
              <div className="grid grid-cols-2 gap-2.5">
                {DEVICES.map(({ id, icon: Icon, name, hint }) => (
                  <button key={id} type="button" disabled={busy && id !== 'fire'} onClick={() => pick(id)} className="flex flex-col items-start gap-2 rounded-xl border border-white/10 bg-white/5 p-3.5 text-left transition hover:border-primary/60 hover:bg-white/10 disabled:opacity-50">
                    <Icon className="h-7 w-7 text-primary" aria-hidden />
                    <span>
                      <span className="block text-sm font-semibold">{name}</span>
                      <span className="block text-xs text-white/55">{hint}</span>
                    </span>
                  </button>
                ))}
                {airplay && (
                  <button type="button" onClick={onAirplay} className="col-span-2 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3.5 text-left transition hover:border-primary/60 hover:bg-white/10">
                    <Airplay className="h-7 w-7 text-primary" aria-hidden />
                    <span>
                      <span className="block text-sm font-semibold">Apple TV / AirPlay</span>
                      <span className="block text-xs text-white/55">TVs e caixas compatíveis com AirPlay</span>
                    </span>
                  </button>
                )}
              </div>

              <button type="button" disabled={busy} onClick={onSearch} className="btn btn-primary mt-4 flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold disabled:opacity-60">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Cast className="h-5 w-5" aria-hidden />}
                {busy ? 'Procurando dispositivos...' : 'Procurar dispositivos'}
              </button>

              {!CAN_CAST && !airplay && (
                <p className="mt-3 rounded-lg bg-amber-500/15 px-3 py-2 text-xs text-amber-200">A busca automática funciona no Chrome ou Edge (Android e computador). Neste navegador, use o espelhamento de tela abaixo.</p>
              )}
              {note && <p className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200" role="alert">{note}</p>}

              <button type="button" onClick={() => setView('mirror')} className="mt-4 w-full rounded-lg py-2 text-center text-sm text-white/70 underline-offset-4 hover:text-white hover:underline">
                Não achou a TV? Espelhar a tela do celular ou PC
              </button>
            </>
          )}

          {view === 'fire' && (
            <div className="space-y-5">
              <p className="text-sm text-white/70">O Fire Stick não recebe transmissão direta de sites. Use uma das duas opções abaixo.</p>
              <section>
                <h3 className="mb-2 text-sm font-semibold">Opção 1 — Abrir o WebPlay na própria TV</h3>
                <ol className="space-y-2.5">
                  <Step n={1}>No Fire Stick, abra a loja de apps e instale o navegador <strong>Silk</strong> ou <strong>Firefox</strong>.</Step>
                  <Step n={2}>Abra o navegador e digite o endereço abaixo.</Step>
                  <Step n={3}>Entre com a sua conta e assista direto na TV.</Step>
                </ol>
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/5 p-2 pl-3 ring-1 ring-white/10">
                  <span className="min-w-0 flex-1 truncate text-sm text-white/90">{window.location.origin}</span>
                  <button type="button" onClick={copyLink} className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20">
                    {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </section>
              <section>
                <h3 className="mb-2 text-sm font-semibold">Opção 2 — Espelhar a tela</h3>
                <ol className="space-y-2.5">
                  <Step n={1}>No Fire Stick, segure o botão <strong>Início</strong> e escolha <strong>Espelhamento</strong> (ou vá em Configurações &gt; Tela e Sons &gt; Ativar espelhamento de tela).</Step>
                  <Step n={2}>No celular Android ou no Windows (Windows + K), procure por telas sem fio e escolha o Fire Stick.</Step>
                  <Step n={3}>Volte aqui e dê play; a imagem aparece na TV.</Step>
                </ol>
              </section>
            </div>
          )}

          {view === 'mirror' && (
            <div className="space-y-2.5">
              <p className="text-sm text-white/70">O espelhamento mostra na TV tudo o que está na tela do seu aparelho. Funciona com a maioria das Smart TVs, TV Boxes e com o Fire Stick.</p>
              {MIRROR.map(({ icon: Icon, name, steps }) => (
                <div key={name} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-3.5">
                  <Icon className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold">{name}</p>
                    <p className="text-xs leading-relaxed text-white/65">{steps}</p>
                  </div>
                </div>
              ))}
              <p className="text-xs text-white/50">Dica: no espelhamento, ative o modo tela cheia do player antes de começar.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
