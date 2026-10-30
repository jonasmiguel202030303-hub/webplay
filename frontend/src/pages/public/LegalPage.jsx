import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicService } from '../../services/authService.js';
import { ErrorState, Spinner } from '../../components/ui/Feedback.jsx';
import { formatDate } from '../../utils/format.js';
import { useTitle } from '../../hooks/useTitle.js';

/** Exibe a versão vigente do documento, sempre buscada do servidor (texto versionado pelo master). */
export default function LegalPage({ type, backTo = '/' }) {
  const [state, setState] = useState({ loading: true, doc: null, error: null });
  useTitle('Documentos legais — WebPlay Brasil');

  useEffect(() => {
    let alive = true;
    setState({ loading: true, doc: null, error: null });
    publicService
      .terms(type)
      .then((doc) => alive && setState({ loading: false, doc, error: null }))
      .catch((error) => alive && setState({ loading: false, doc: null, error }));
    return () => {
      alive = false;
    };
  }, [type]);

  useEffect(() => {
    if (state.doc) document.title = `${state.doc.title} — WebPlay Brasil`;
  }, [state.doc]);

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <Link to={backTo} className="text-sm text-fg/60 hover:text-fg">&larr; Voltar</Link>
      {state.loading && <Spinner />}
      {state.error && <ErrorState error={state.error} />}
      {state.doc && (
        <>
          <h1 className="mt-4 text-3xl font-bold">{state.doc.title}</h1>
          <p className="mt-1 text-xs text-fg/50">Versão {state.doc.version} — publicada em {formatDate(state.doc.publishedAt)}</p>
          <div className="mt-6 whitespace-pre-wrap break-words text-sm leading-7 text-fg/85">{state.doc.content}</div>
        </>
      )}
    </article>
  );
}
