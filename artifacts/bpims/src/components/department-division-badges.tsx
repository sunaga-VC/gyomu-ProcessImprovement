import { Badge } from "@/components/ui";

type Ref = { id: number; name: string };

export function DepartmentBadges({ departments }: { departments?: Ref[] | null }) {
  if (!departments || departments.length === 0) {
    return <span className="text-xs text-slate-400">未設定</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {departments.map((d) => (
        <Badge key={d.id} variant="outline" className="bg-black text-white border-black font-normal">
          {d.name}
        </Badge>
      ))}
    </div>
  );
}

/** Shows 主担当部署 (dark) and 関連部署 (light) together, so the two roles read apart at a glance. */
export function DepartmentBadgeGroup({ primary, related }: { primary?: Ref[] | null; related?: Ref[] | null }) {
  const hasPrimary = !!primary && primary.length > 0;
  const hasRelated = !!related && related.length > 0;
  if (!hasPrimary && !hasRelated) {
    return <span className="text-xs text-slate-400">未設定</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {primary?.map((d) => (
        <Badge key={`primary-${d.id}`} variant="outline" className="bg-black text-white border-black font-medium">
          {d.name}
        </Badge>
      ))}
      {related?.map((d) => (
        <Badge key={`related-${d.id}`} variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 font-normal">
          {d.name}
        </Badge>
      ))}
    </div>
  );
}

export function DivisionBadges({ divisions }: { divisions?: Ref[] | null }) {
  if (!divisions || divisions.length === 0) {
    return <span className="text-xs text-slate-400">未設定</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {divisions.map((d) => (
        <Badge
          key={d.id}
          variant="outline"
          className={d.name === "全社共通" ? "bg-slate-50 text-slate-500 border-slate-200 font-normal" : "bg-blue-50 text-blue-700 border-blue-200 font-normal"}
        >
          {d.name}
        </Badge>
      ))}
    </div>
  );
}
