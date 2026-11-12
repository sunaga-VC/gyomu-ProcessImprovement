import { MonitorCog, Settings } from "lucide-react";

export function systemCandidateIcon(status: string) {
  return status === "released" ? Settings : MonitorCog;
}
