import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Target, Activity, FileText, Settings, Users, Server, Box, Layers, Building2, KanbanSquare, ChartGantt, SquareChartGantt, ClipboardList, MonitorCog, UsersRoundCollaboration } from "lucide-react";

export function Sidebar() {
  const [location] = useLocation();

  const navGroups = [
    {
      title: "メイン",
      items: [
        { href: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard },
        { href: "/hearings/calendar", label: "ガントチャート", icon: ChartGantt },
        { href: "/improvements/board", label: "改善ボード", icon: KanbanSquare },
        { href: "/improvements", label: "改善プロジェクト", icon: Activity },
      ]
    },
    {
      title: "ヒアリング",
      items: [
        { href: "/hearings", label: "ヒアリング一覧", icon: UsersRoundCollaboration },
        { href: "/issues", label: "タスク一覧", icon: Target },
      ]
    },
    {
      title: "システム化",
      items: [
        { href: "/system-gantt", label: "システムガントチャート", icon: SquareChartGantt },
        { href: "/system-candidates", label: "システム化一覧", icon: MonitorCog },
      ]
    },
    {
      title: "資産管理",
      items: [
        { href: "/documents", label: "関連書類", icon: FileText },
        { href: "/systems", label: "利用システム", icon: Server },
      ]
    },
    {
      title: "業務管理",
      items: [
        { href: "/processes", label: "業務一覧", icon: Box },
        { href: "/management-tasks", label: "管理業務一覧", icon: ClipboardList },
      ]
    },
    {
      title: "組織管理",
      items: [
        { href: "/divisions", label: "部門管理", icon: Building2 },
        { href: "/departments", label: "部署管理", icon: Building2 },
        { href: "/users", label: "ユーザー管理", icon: Users },
      ]
    }
  ];

  return (
    <aside className="w-[260px] border-r bg-sidebar text-sidebar-foreground flex flex-col h-screen flex-shrink-0">
      <div className="h-14 flex items-center px-5 border-b border-sidebar-border bg-sidebar-primary/5">
        <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center mr-3 shadow-sm">
          <Layers className="text-primary-foreground w-4 h-4" />
        </div>
        <h1 className="font-bold text-sm tracking-tight truncate text-sidebar-primary">BPIMS <span className="text-sidebar-foreground/50 font-normal">v1.0</span></h1>
      </div>
      <div className="flex-1 overflow-y-auto py-5">
        {navGroups.map((group, i) => (
          <div key={i} className="mb-6 px-3">
            <h2 className="mb-2 px-3 text-[11px] font-bold text-sidebar-foreground/50 tracking-widest uppercase">
              {group.title}
            </h2>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = location === item.href || (item.href !== '/dashboard' && location.startsWith(item.href + '/'));
                return (
                  <Link key={item.href} href={item.href} className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
                    isActive ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm" : "hover:bg-sidebar-accent/50 hover:text-sidebar-primary text-sidebar-foreground/80"
                  )}>
                    <item.icon className={cn("h-4 w-4", isActive ? "text-primary-foreground" : "text-sidebar-foreground/60")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
