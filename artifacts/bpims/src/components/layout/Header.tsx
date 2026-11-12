import { Bell, LogOut, Search } from "lucide-react";
import { Input } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function Header() {
  const { user, configured, signOut } = useAuth();
  const label = user?.email?.split("@")[0] ?? "ユーザー";

  return (
    <header className="h-14 border-b bg-card flex items-center px-6 justify-between flex-shrink-0 z-10 shadow-sm relative">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative w-96 hidden md:block">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="業務、タスク、ヒアリングを検索..."
            className="pl-9 bg-slate-50/50 border-slate-200 h-8 text-sm focus-visible:bg-white"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="text-muted-foreground hover:text-foreground relative">
          <Bell className="w-5 h-5" />
          <span className="absolute 0 top-0 right-0 w-2 h-2 bg-destructive rounded-full border border-card"></span>
        </button>
        <div
          className="h-8 max-w-[10rem] truncate rounded-full bg-primary px-3 flex items-center justify-center text-primary-foreground font-semibold text-xs shadow-sm"
          title={user?.email ?? undefined}
        >
          {label}
        </div>
        {configured ? (
          <Button type="button" variant="ghost" size="sm" className="gap-1 text-slate-600" onClick={() => void signOut()}>
            <LogOut className="w-4 h-4" />
            ログアウト
          </Button>
        ) : null}
      </div>
    </header>
  );
}
