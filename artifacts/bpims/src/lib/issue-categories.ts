import { CheckCircle2, HelpCircle, TrendingUp, FilePlus2, Lightbulb, type LucideIcon } from "lucide-react";

export const ISSUE_CATEGORIES = ["課題解決", "確認事項", "改善対応", "作成・更新", "検討事項"] as const;

export const ISSUE_CATEGORY_ICONS: Record<string, LucideIcon> = {
  "課題解決": CheckCircle2,
  "確認事項": HelpCircle,
  "改善対応": TrendingUp,
  "作成・更新": FilePlus2,
  "検討事項": Lightbulb,
};
