import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ToastProvider } from './contexts/ToastContext.jsx';
import { Spinner } from './components/ui/Feedback.jsx';
import PublicLayout from './layouts/PublicLayout.jsx';
import PanelLayout from './layouts/PanelLayout.jsx';
import MasterLayout from './layouts/MasterLayout.jsx';
import ViewerLayout from './layouts/ViewerLayout.jsx';
import { RequireMaster, RequireProfile, RequireRole, RequireViewer } from './routes/guards.jsx';
import Landing from './pages/public/Landing.jsx';
import Login from './pages/public/Login.jsx';
import Register from './pages/public/Register.jsx';
import Activate from './pages/public/Activate.jsx';
import ForgotPassword from './pages/public/ForgotPassword.jsx';
import ResetPassword from './pages/public/ResetPassword.jsx';
import LegalPage from './pages/public/LegalPage.jsx';
import AcceptableUse from './pages/public/AcceptableUse.jsx';
import NotFound from './pages/public/NotFound.jsx';

// Áreas carregadas sob demanda (painel, master e espectador) para manter o carregamento inicial leve.
const PanelOverview = lazy(() => import('./pages/panel/Overview.jsx'));
const BrandPage = lazy(() => import('./pages/panel/Brand.jsx'));
const CustomizationPage = lazy(() => import('./pages/panel/Customization.jsx'));
const ServersPage = lazy(() => import('./pages/panel/Servers.jsx'));
const PlayerSettingsPage = lazy(() => import('./pages/panel/PlayerSettings.jsx'));
const SubscriptionPage = lazy(() => import('./pages/panel/Subscription.jsx'));
const PaymentsPage = lazy(() => import('./pages/panel/Payments.jsx'));
const HelpPage = lazy(() => import('./pages/panel/Help.jsx'));
const TermsPage = lazy(() => import('./pages/panel/Terms.jsx'));

const MasterDashboard = lazy(() => import('./pages/master/Dashboard.jsx'));
const TenantsPage = lazy(() => import('./pages/master/Tenants.jsx'));
const TenantDetailPage = lazy(() => import('./pages/master/TenantDetail.jsx'));
const MasterSettingsPage = lazy(() => import('./pages/master/Settings.jsx'));
const MercadoPagoPage = lazy(() => import('./pages/master/MercadoPago.jsx'));
const MasterPaymentsPage = lazy(() => import('./pages/master/Payments.jsx'));
const MasterTermsPage = lazy(() => import('./pages/master/Terms.jsx'));
const MasterSupportPage = lazy(() => import('./pages/master/Support.jsx'));
const AuditPage = lazy(() => import('./pages/master/Audit.jsx'));
const AdminsPage = lazy(() => import('./pages/master/Admins.jsx'));
const SystemPage = lazy(() => import('./pages/master/System.jsx'));

const ViewerRoot = lazy(() => import('./pages/viewer/ViewerRoot.jsx'));
const ViewerLogin = lazy(() => import('./pages/viewer/ViewerLogin.jsx'));
const ViewerRegister = lazy(() => import('./pages/viewer/ViewerRegister.jsx'));
const ViewerForgot = lazy(() => import('./pages/viewer/ViewerForgot.jsx'));
const ViewerReset = lazy(() => import('./pages/viewer/ViewerReset.jsx'));
const ProfileSelect = lazy(() => import('./pages/viewer/ProfileSelect.jsx'));
const ViewerHome = lazy(() => import('./pages/viewer/ViewerHome.jsx'));
const Browse = lazy(() => import('./pages/viewer/Browse.jsx'));
const SearchPage = lazy(() => import('./pages/viewer/SearchPage.jsx'));
const Favorites = lazy(() => import('./pages/viewer/Favorites.jsx'));
const History = lazy(() => import('./pages/viewer/History.jsx'));
const Watch = lazy(() => import('./pages/viewer/Watch.jsx'));
const Account = lazy(() => import('./pages/viewer/Account.jsx'));

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Suspense fallback={<Spinner className="min-h-screen" />}>
          <Routes>
            {/* Site público da plataforma */}
            <Route element={<PublicLayout />}>
              <Route index element={<Landing />} />
              <Route path="entrar" element={<Login />} />
              <Route path="cadastro" element={<Register />} />
              <Route path="ativar" element={<Activate />} />
              <Route path="esqueci-senha" element={<ForgotPassword />} />
              <Route path="redefinir-senha" element={<ResetPassword />} />
              <Route path="termos" element={<LegalPage type="terms" />} />
              <Route path="privacidade" element={<LegalPage type="privacy" />} />
              <Route path="uso-aceitavel" element={<AcceptableUse />} />
              <Route path="aviso-legal" element={<LegalPage type="legal" />} />
            </Route>

            {/* Painel do assinante */}
            <Route path="painel" element={<RequireRole role="tenant_owner" />}>
              <Route element={<PanelLayout />}>
                <Route index element={<PanelOverview />} />
                <Route path="marca" element={<BrandPage />} />
                <Route path="personalizacao" element={<CustomizationPage />} />
                <Route path="servidores" element={<ServersPage />} />
                <Route path="player" element={<PlayerSettingsPage />} />
                <Route path="assinatura" element={<SubscriptionPage />} />
                <Route path="pagamentos" element={<PaymentsPage />} />
                <Route path="ajuda" element={<HelpPage />} />
                <Route path="termos" element={<TermsPage />} />
              </Route>
            </Route>

            {/* Painel master / administradores */}
            <Route path="master" element={<RequireRole role="staff" />}>
              <Route element={<MasterLayout />}>
                <Route index element={<MasterDashboard />} />
                <Route path="assinantes" element={<TenantsPage />} />
                <Route path="assinantes/:id" element={<TenantDetailPage />} />
                <Route path="configuracoes" element={<RequireMaster><MasterSettingsPage /></RequireMaster>} />
                <Route path="mercado-pago" element={<RequireMaster><MercadoPagoPage /></RequireMaster>} />
                <Route path="pagamentos" element={<MasterPaymentsPage />} />
                <Route path="termos" element={<MasterTermsPage />} />
                <Route path="suporte" element={<MasterSupportPage />} />
                <Route path="auditoria" element={<AuditPage />} />
                <Route path="administradores" element={<RequireMaster><AdminsPage /></RequireMaster>} />
                <Route path="sistema" element={<SystemPage />} />
              </Route>
            </Route>

            {/* Página white-label de cada assinante: /<slug> (rotas fixas acima têm prioridade) */}
            <Route path=":slug" element={<ViewerRoot />}>
              <Route path="entrar" element={<ViewerLogin />} />
              <Route path="cadastro" element={<ViewerRegister />} />
              <Route path="esqueci-senha" element={<ViewerForgot />} />
              <Route path="redefinir-senha" element={<ViewerReset />} />
              <Route element={<RequireViewer />}>
                <Route path="perfis" element={<ProfileSelect />} />
                <Route element={<RequireProfile />}>
                  <Route element={<ViewerLayout />}>
                    <Route index element={<ViewerHome />} />
                    <Route path="canais" element={<Browse key="live" type="live" />} />
                    <Route path="filmes" element={<Browse key="vod" type="vod" />} />
                    <Route path="series" element={<Browse key="series" type="series" />} />
                    <Route path="buscar" element={<SearchPage />} />
                    <Route path="favoritos" element={<Favorites />} />
                    <Route path="historico" element={<History />} />
                    <Route path="assistir/:type/:streamId" element={<Watch />} />
                    <Route path="conta" element={<Account />} />
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<NotFound to="/" />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </ToastProvider>
  );
}
