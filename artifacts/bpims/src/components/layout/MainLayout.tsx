import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ReactNode } from "react";

export function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 print:block print:h-auto print:overflow-visible">
      <div className="print:hidden">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col min-w-0 print:block">
        <div className="print:hidden">
          <Header />
        </div>
        <main className="flex-1 overflow-y-auto print:overflow-visible print:h-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
