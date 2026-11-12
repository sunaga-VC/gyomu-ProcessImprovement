import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';

import { MainLayout } from '@/components/layout/MainLayout';
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <MainLayout>
      <Switch>
        <Route path="/" component={() => <Redirect to="/dashboard" />} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/processes/tree" component={() => <Redirect to="/processes" />} />
        <Route path="/processes" component={Processes} />
        <Route path="/processes/:id" component={ProcessDetail} />
        <Route path="/management-tasks" component={ManagementTasks} />
        <Route path="/hearings/calendar" component={HearingsCalendar} />
        <Route path="/hearings" component={Hearings} />
        <Route path="/issues" component={Issues} />
        <Route path="/improvements/board" component={ImprovementsBoard} />
        <Route path="/improvements/print" component={ImprovementsPrint} />
        <Route path="/improvements" component={Improvements} />
        <Route path="/system-candidates/print" component={SystemCandidatesPrint} />
        <Route path="/system-candidates" component={SystemCandidates} />
        <Route path="/system-gantt" component={SystemGantt} />
        <Route path="/documents" component={Documents} />
        <Route path="/systems" component={Systems} />
        <Route path="/divisions" component={Divisions} />
        <Route path="/departments" component={Departments} />
        <Route path="/users" component={Users} />
        <Route component={() => <div className="p-8">404 Not Found</div>} />
      </Switch>
    </MainLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
