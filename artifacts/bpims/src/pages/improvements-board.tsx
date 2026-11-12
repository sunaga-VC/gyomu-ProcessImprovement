import { useState } from "react";
import { Button } from "@/components/ui";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImprovementFormDialog } from "@/components/improvement-form-dialog";
import { ImprovementsBoardView, type BoardAxisMode } from "@/components/improvements-board-view";
import { Plus } from "lucide-react";

export default function ImprovementsBoard() {
  const [open, setOpen] = useState(false);
  const [axisMode, setAxisMode] = useState<BoardAxisMode>("management");

  return (
    <div className="p-8 mx-auto max-w-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">改善ボード</h1>
          <p className="text-sm text-muted-foreground mt-1">ヒアリング・タスク・システム化候補を改善案件のブロックにドラッグ＆ドロップで割り当てます。</p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={axisMode} onValueChange={v => setAxisMode(v as BoardAxisMode)}>
            <TabsList>
              <TabsTrigger value="management">一覧</TabsTrigger>
              <TabsTrigger value="department">部署ごと</TabsTrigger>
              <TabsTrigger value="division">部門ごと</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button className="gap-2" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4" />新規改善案件
          </Button>
        </div>
      </div>

      <ImprovementsBoardView axisMode={axisMode} />

      <ImprovementFormDialog open={open} onOpenChange={setOpen} editingImprovement={null} />
    </div>
  );
}
