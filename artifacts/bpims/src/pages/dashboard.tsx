import { useGetDashboardSummary, useGetDashboardRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";
import { Target, Activity, AlertCircle, TrendingUp, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading, isError: summaryError, error: summaryErr, refetch: refetchSummary } = useGetDashboardSummary();
  const { data: activity, isLoading: isActivityLoading, isError: activityError, refetch: refetchActivity } = useGetDashboardRecentActivity();

  if (isSummaryLoading || isActivityLoading) return <div className="p-8 text-muted-foreground">読み込み中...</div>;

  if (summaryError || activityError) {
    return (
      <div className="p-8 space-y-3">
        <p className="text-sm text-red-600">データの取得に失敗しました。通信またはログイン状態をご確認ください。</p>
        <p className="text-xs text-slate-500">{summaryErr instanceof Error ? summaryErr.message : null}</p>
        <button
          type="button"
          className="text-sm underline text-slate-700"
          onClick={() => { void refetchSummary(); void refetchActivity(); }}
        >
          再読み込み
        </button>
      </div>
    );
  }

  const improvingProcesses = summary?.processStatusBreakdown?.find(s => s.label === "improving")?.count ?? 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-sm text-muted-foreground mt-1">業務改善の全体状況と直近のタスクを確認します。</p>
        </div>
        <div className="text-sm text-muted-foreground font-medium bg-white px-3 py-1.5 rounded-md border shadow-sm">
          最終更新: {format(new Date(), 'yyyy/MM/dd HH:mm')}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="要改善" value={improvingProcesses} icon={TrendingUp} />
        <StatCard title="タスク数" value={summary?.totalIssues || 0} icon={Target} />
        <StatCard title="改善案件" value={summary?.totalImprovements || 0} icon={Activity} />
        <StatCard title="期限超過" value={summary?.overdueCount || 0} icon={AlertCircle} className="border-red-200 bg-red-50 text-red-900" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card>
            <CardHeader className="border-b bg-slate-50/50 px-6 py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                直近のヒアリング予定
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {summary?.upcomingHearings?.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground text-center">予定されているヒアリングはありません。</p>
              ) : (
                <div className="divide-y">
                  {summary?.upcomingHearings?.map(h => (
                    <div key={h.id} className="flex justify-between items-center p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex gap-4 items-center">
                        <div className="w-12 text-center">
                          <div className="text-xs font-bold text-slate-500 uppercase">{h.scheduledAt ? format(new Date(h.scheduledAt), 'MMM') : '-'}</div>
                          <div className="text-xl font-black text-primary">{h.scheduledAt ? format(new Date(h.scheduledAt), 'dd') : '-'}</div>
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{h.title}</div>
                          <div className="text-xs text-muted-foreground mt-1 font-medium">{h.departmentName} <span className="mx-1 text-slate-300">|</span> {h.processName}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="bg-white">{h.intervieweeName}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <Card>
            <CardHeader className="border-b bg-slate-50/50 px-6 py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                最近のアクティビティ
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-3 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                {activity?.map(item => (
                  <div key={`${item.type}-${item.id}`} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-white bg-slate-200 text-slate-500 group-[.is-active]:bg-primary group-[.is-active]:text-primary-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                      <CheckCircle2 className="w-3 h-3" />
                    </div>
                    <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-lg border bg-white shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs text-slate-900">{item.userName}</span>
                        <time className="text-[10px] font-medium text-slate-500">{format(new Date(item.timestamp), 'MM/dd HH:mm')}</time>
                      </div>
                      <div className="text-xs text-slate-600">
                        <span className="font-medium text-slate-900">{item.title}</span> を {item.action}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, className }: { title: string, value: number, icon: any, className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
          <div className="p-2 bg-slate-100 rounded-md">
            <Icon className="w-4 h-4 text-slate-600" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl font-black text-slate-900 tracking-tight">{value}</span>
        </div>
      </CardContent>
    </Card>
  );
}
