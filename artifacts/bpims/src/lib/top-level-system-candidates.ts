import { useMemo } from "react";
import { useListSystemCandidates } from "@workspace/api-client-react";

/**
 * 子のシステム化（parentId あり）は システムガントチャート／システム化一覧 専用で、
 * 改善ボード・改善プロジェクト・ガントチャート・進捗率の計算には含めない。
 */
export function useTopLevelSystemCandidates() {
  const query = useListSystemCandidates();
  const data = useMemo(() => (query.data ?? []).filter((sc) => !sc.parentId), [query.data]);
  return { ...query, data };
}
