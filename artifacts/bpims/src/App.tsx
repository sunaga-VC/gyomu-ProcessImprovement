import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { useState, type ComponentType } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { AuthProvider, useAuth } from '@/lib/auth';
import LoginPage from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import Processes from '@/pages/processes';
import ProcessDetail from '@/pages/process-detail';
import ManagementTasks from '@/pages/management-tasks';
import Hearings from '@/pages/hearings';
import HearingsCalendar from '@/pages/hearings-calendar';
import Issues from '@/pages/issues';
import Improvements from '@/pages/improvements';
import ImprovementsPrint from '@/pages/improvements-print';
import ImprovementsBoard from '@/pages/improvements-board';
import SystemCandidates from '@/pages/system-candidates';
import SystemGantt from '@/pages/system-gantt';
import SystemCandidatesPrint from '@/pages/system-candidates-print';
import Documents from '@/pages/documents';
import Systems from '@/pages/systems';
import Departments from '@/pages/departments';
import Divisions from '@/pages/divisions';
import Users from '@/pages/users';

function getErrorStatus(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error && typeof (error as { status: unknown }).status === 'number') {
    return (error as { status: number }).status;
  }
  return null;
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Avoid treating a one-off auth/network blip as a permanent empty list.
        retry: (count, error) => {
          const status = getErrorStatus(error);
          if (status === 401 || status === 403) return count < 2;
          return count < 1;
        },
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2000),
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

function RequireAuth({ component: Component }: { component: ComponentType }) {
  const { ready, session, configured } = useAuth();
  if (!ready) {
    return <div className="p-8 text-sm text-slate-500">読み込み中…</div>;
  }
  if (configured && !session) {
    return <Redirect to="/login" />;
  }
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route>
        <MainLayout>
          <Switch>
            <Route path="/" component={() => <Redirect to="/dashboard" />} />
            <Route path="/dashboard" component={() => <RequireAuth component={Dashboard} />} />
            <Route path="/processes/tree" component={() => <Redirect to="/processes" />} />
            <Route path="/processes" component={() => <RequireAuth component={Processes} />} />
            <Route path="/processes/:id" component={() => <RequireAuth component={ProcessDetail} />} />
            <Route path="/management-tasks" component={() => <RequireAuth component={ManagementTasks} />} />
            <Route path="/hearings/calendar" component={() => <RequireAuth component={HearingsCalendar} />} />
            <Route path="/hearings" component={() => <RequireAuth component={Hearings} />} />
            <Route path="/issues" component={() => <RequireAuth component={Issues} />} />
            <Route path="/improvements/board" component={() => <RequireAuth component={ImprovementsBoard} />} />
            <Route path="/improvements/print" component={() => <RequireAuth component={ImprovementsPrint} />} />
            <Route path="/improvements" component={() => <RequireAuth component={Improvements} />} />
            <Route path="/system-candidates/print" component={() => <RequireAuth component={SystemCandidatesPrint} />} />
            <Route path="/system-candidates" component={() => <RequireAuth component={SystemCandidates} />} />
            <Route path="/system-gantt" component={() => <RequireAuth component={SystemGantt} />} />
            <Route path="/documents" component={() => <RequireAuth component={Documents} />} />
            <Route path="/systems" component={() => <RequireAuth component={Systems} />} />
            <Route path="/divisions" component={() => <RequireAuth component={Divisions} />} />
            <Route path="/departments" component={() => <RequireAuth component={Departments} />} />
            <Route path="/users" component={() => <RequireAuth component={Users} />} />
            <Route component={() => <div className="p-8">404 Not Found</div>} />
          </Switch>
        </MainLayout>
      </Route>
    </Switch>
  );
}

function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
