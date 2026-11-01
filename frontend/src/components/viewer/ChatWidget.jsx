import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X, EyeOff } from 'lucide-react';
import ProfileAvatar from './ProfileAvatar.jsx';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { setChatPref, useChatPref } from '../../utils/chatPref.js';

const POLL_MS = 3000;
const MAX_KEPT = 200;
const time = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const QUICK = [
  'Oi, pessoal!',
  'Me recomendem um filme bom de ação',
  'Quem joga hoje?',
  'Qual série vocês recomendam?',
  'Alguém sabe de um bom canal de esportes?',
  'Qual filme de comédia vocês indicam?',
];

/** Chat em tempo real entre os espectadores da mesma página (consulta a cada 3 s enquanto aberto). */
export default function ChatWidget() {
  const { slug, tenant, profile, svc } = useViewer();
  const pref = useChatPref(slug);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [meId, setMeId] = useState(null);
  const [off, setOff] = useState(null); // motivo quando o servidor diz que o chat não está disponível
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const lastId = useRef(0);
  const busy = useRef(false);
  const listRef = useRef(null);
  const stick = useRef(true);

  const merge = useCallback((incoming) => {
    if (!incoming.length) return;
    setMessages((cur) => {
      const known = new Set(cur.map((m) => m.id));
      const next = [...cur, ...incoming.filter((m) => !known.has(m.id))];
      return next.length > MAX_KEPT ? next.slice(-MAX_KEPT) : next;
    });
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id));
  }, []);

  const poll = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await svc.chat(lastId.current);
      setMeId(res.meId);
      if (res.enabled === false) setOff(res.reason ?? 'off');
      else {
        setOff(null);
        merge(res.messages);
      }
    } catch {
      /* falha de rede: tenta de novo no próximo ciclo */
    } finally {
      busy.current = false;
      setLoaded(true);
    }
  }, [svc, merge]);

  useEffect(() => {
    if (!open || off) return undefined;
    poll();
    const timer = setInterval(() => { if (!document.hidden) poll(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [open, off, poll]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, open, loaded]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = async (e, quick) => {
    e?.preventDefault();
    const body = (quick ?? text).trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    try {
      const res = await svc.sendChat(body);
      if (quick === undefined) setText('');
      stick.current = true;
      merge([res.message]);
    } catch (err) {
      if (err.code === 'CHAT_DISABLED') setOff('off');
      else setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (tenant.chatEnabled === false || profile.isKids || !pref) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir chat"
        title="Chat"
        className={`fixed bottom-20 left-4 z-40 h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-black/40 ring-2 ring-white/20 transition hover:scale-110 md:bottom-6 md:left-6 ${open ? 'hidden' : 'flex'}`}
      >
        <MessageCircle className="h-7 w-7" aria-hidden />
      </button>

      {open && (
        <section aria-label="Chat" className="fixed inset-x-3 bottom-20 z-50 flex h-[min(34rem,70vh)] animate-fade-in flex-col overflow-hidden rounded-xl border border-fg/15 bg-bg shadow-2xl md:bottom-6 md:left-6 md:right-auto md:w-96">
          <header className="flex items-center justify-between border-b border-fg/10 px-4 py-2.5">
            <div>
              <h2 className="text-sm font-semibold">Chat</h2>
              <p className="text-[11px] text-fg/50">Converse com outros espectadores</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setOpen(false); setChatPref(slug, false); }}
                title="Desativar o chat (reative no menu do perfil)"
                aria-label="Desativar o chat"
                className="rounded-md p-1.5 text-fg/60 hover:bg-fg/10 hover:text-fg"
              >
                <EyeOff className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar chat" className="rounded-md p-1.5 text-fg/60 hover:bg-fg/10 hover:text-fg">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </header>

          {off ? (
            <p className="flex flex-1 items-center justify-center px-6 text-center text-sm text-fg/60">
              {off === 'kids' ? 'O chat não está disponível em perfis infantis.' : 'O chat está desativado.'}
            </p>
          ) : (
            <>
              <div ref={listRef} onScroll={onScroll} className="flex-1 space-y-3 overflow-y-auto px-3 py-3" aria-live="polite">
                {!loaded && <p className="py-6 text-center text-sm text-fg/60">Carregando...</p>}
                {loaded && messages.length === 0 && <p className="py-6 text-center text-sm text-fg/60">Nenhuma mensagem ainda. Pergunte qual filme assistir, peça indicações de ação e mais.</p>}
                {messages.map((m) => {
                  const mine = m.profileId === meId;
                  return (
                    <div key={m.id} className="flex items-start gap-2">
                      <ProfileAvatar name={m.name} avatar={m.avatar} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-baseline gap-2 text-xs">
                          <span className={`truncate font-semibold ${mine ? 'text-primary' : 'text-fg/90'}`}>{mine ? `${m.name} (você)` : m.name}</span>
                          <span className="shrink-0 text-fg/40">{time(m.at)}</span>
                        </p>
                        <p className={`mt-0.5 inline-block max-w-full whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-sm ${mine ? 'bg-primary/20' : 'bg-fg/10'}`}>{m.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <form onSubmit={send} className="border-t border-fg/10 p-2.5">
                <div className="-mx-0.5 mb-2 flex gap-1.5 overflow-x-auto pb-1" aria-label="Perguntas prontas">
                  {QUICK.map((q) => (
                    <button key={q} type="button" disabled={sending} onClick={() => send(null, q)} className="shrink-0 rounded-full border border-fg/15 bg-fg/5 px-3 py-1 text-xs text-fg/80 transition hover:bg-fg/10 hover:text-fg disabled:opacity-50">
                      {q}
                    </button>
                  ))}
                </div>
                {error && <p role="alert" className="mb-1.5 text-xs text-red-300">{error}</p>}
                <div className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    value={text}
                    onChange={(e) => { setText(e.target.value); if (error) setError(''); }}
                    maxLength={300}
                    placeholder="Escreva uma mensagem"
                    aria-label="Mensagem"
                    autoComplete="off"
                  />
                  <button type="submit" disabled={sending || !text.trim()} aria-label="Enviar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition hover:opacity-90 disabled:opacity-50">
                    <Send className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      )}
    </>
  );
}
