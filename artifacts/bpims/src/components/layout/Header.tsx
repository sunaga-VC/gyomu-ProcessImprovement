import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui";

export function Header() {
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
      <div className="flex items-center gap-4">
        <button className="text-muted-foreground hover:text-foreground relative">
          <Bell className="w-5 h-5" />
          <span className="absolute 0 top-0 right-0 w-2 h-2 bg-destructive rounded-full border border-card"></span>
        </button>
        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold text-sm shadow-sm cursor-pointer hover:bg-primary/90 transition-colors">
          山田
        </div>
      </div>
    </header>
  );
}
