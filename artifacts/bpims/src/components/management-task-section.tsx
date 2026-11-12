import { useListManagementTasks, useListProcesses } from "@workspace/api-client-react";
import { ProcessHierarchyTree } from "@/components/process-hierarchy-tree";
import { expandWithDescendants } from "@/lib/group-by-department";
import { Link } from "wouter";

export function ManagementTaskSection({ keyword, showDetails = false }: { keyword: string; showDetails?: boolean }) {
  const { data: tasks, isLoading: tasksLoading } = useListManagementTasks();
  const { data: processes = [], isLoading: processesLoading } = useListProcesses();
  const isLoading = tasksLoading || processesLoading;
  const kw = keyword.toLowerCase();

  const sections = (tasks ?? [])
    .map(t => {
      const taskProcessIds = new Set((t.processes ?? []).map(p => p.id));
      const expandedIds = expandWithDescendants(taskProcessIds, processes);
      const allItems = processes.filter(p => expandedIds.has(p.id));
      const items = allItems.filter(p => !kw || p.name.toLowerCase().includes(kw) || t.name.toLowerCase().includes(kw));
      return { id: t.id, name: t.name, items };
    })
    .filter(t => !kw || t.name.toLowerCase().includes(kw) || t.items.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return (
    <div className="p-4 space-y-4">
      {isLoading ? (
        <div className="text-center text-muted-foreground py-8">読み込み中...</div>
      ) : sections.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 text-sm space-y-2">
          <p>{kw ? "該当する管理業務がありません" : "管理業務がまだ登録されていません。"}</p>
          {!kw && <Link href="/management-tasks" className="text-primary hover:underline">管理業務管理から登録する</Link>}
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map(task => (
            <div key={task.id} className="border rounded-md overflow-hidden">
              <div className="px-3 py-2 border-b bg-slate-50 font-semibold text-sm text-slate-700">
                {task.name}
                <span className="font-normal text-slate-400 ml-1">（{task.items.length}件）</span>
              </div>
              <div className="p-2">
                <ProcessHierarchyTree items={task.items} allProcesses={processes} emptyLabel="紐づく業務がありません" showDetails={showDetails} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end">
        <Link href="/management-tasks" className="text-sm text-primary hover:underline">管理業務を追加・編集する</Link>
      </div>
    </div>
  );
}
