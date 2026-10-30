import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { PageHeader, Card } from '../../components/ui/Card.jsx';
import { AsyncView, EmptyState } from '../../components/ui/Feedback.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useTitle } from '../../hooks/useTitle.js';
import { tenantService } from '../../services/tenantService.js';
import { formatDateTime } from '../../utils/format.js';

const DOCS = { terms: 'Termos de Uso', privacy: 'Política de Privacidade', legal: 'Aviso Legal' };

export default function TermsPage() {
  useTitle('Termos — Painel');
  const state = useAsync(() => tenantService.termsAcceptances(), []);
  return (
    <>
      <PageHeader title="Termos e privacidade" description="Documentos vigentes e o histórico dos seus aceites." />
      <Card title="Documentos">
        <ul className="space-y-2 text-sm">
          <li><Link className="underline" to="/termos" target="_blank">Termos de Uso</Link></li>
          <li><Link className="underline" to="/privacidade" target="_blank">Política de Privacidade</Link></li>
          <li><Link className="underline" to="/aviso-legal" target="_blank">Aviso Legal</Link></li>
        </ul>
      </Card>
      <Card title="Aceites registrados" className="mt-6">
        <AsyncView state={state}>
          {({ acceptances }) =>
            acceptances.length === 0 ? (
              <EmptyState icon={FileText} title="Nenhum aceite registrado" />
            ) : (
              <ul className="divide-y divide-fg/10 text-sm">
                {acceptances.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span>{DOCS[a.docType] ?? a.docType} <span className="text-fg/50">— versão {a.version}</span></span>
                    <span className="text-xs text-fg/50">{formatDateTime(a.acceptedAt)}</span>
                  </li>
                ))}
              </ul>
            )
          }
        </AsyncView>
      </Card>
    </>
  );
}
