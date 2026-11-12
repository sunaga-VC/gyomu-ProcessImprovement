export const PROCESS_STATUS = {
  draft: '仮登録',
  improving: '要改善',
  confirmed: '最適済',
  discontinued: '廃止',
};

export const HEARING_STATUS = {
  not_started: '未着手',
  scheduled: '調整済',
  conducted: '実施済',
};

export const ISSUE_STATUS = {
  not_started: '未対応',
  in_progress: '対応中',
  resolved: '対応済',
  on_hold: '保留',
};

export const IMPROVEMENT_STATUS = {
  not_started: '未着手',
  in_progress: '進行中',
  completed: '完了',
  on_hold: '保留',
};

export const SYSTEM_CANDIDATE_STATUS = {
  candidate: '候補',
  requirements: '要件定義',
  in_development: '開発中',
  testing: 'ﾃｽﾄ中',
  released: 'ﾘﾘｰｽ済',
  cancelled: '保留'
};

export const getStatusColor = (status: string, map: Record<string, string>) => {
  const label = map[status] ?? status;
  if (map === SYSTEM_CANDIDATE_STATUS) {
    if (label === '候補') return 'bg-lime-50 text-lime-700 border-lime-200';
    if (label === '保留') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (label === '要件定義') return 'bg-purple-50 text-purple-700 border-purple-200';
    if (label === '開発中') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (label === 'ﾃｽﾄ中') return 'bg-pink-50 text-pink-700 border-pink-200';
    if (label === 'ﾘﾘｰｽ済') return 'bg-slate-100 text-slate-700 border-slate-200';
  }
  if (status.includes('completed') || status.includes('resolved') || status.includes('confirmed') || status.includes('conducted') || status.includes('released')) return 'bg-slate-100 text-slate-700 border-slate-200';
  if (((map === HEARING_STATUS || map === IMPROVEMENT_STATUS) && label === '未着手') || (map === ISSUE_STATUS && label === '未対応')) return 'bg-lime-50 text-lime-700 border-lime-200';
  if (label === '調整済' || label === '対応中' || status.includes('progress') || status.includes('investigating') || status.includes('reviewing') || status.includes('improving') || status.includes('scheduled')) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (status.includes('pending') || status.includes('waiting') || status.includes('on_hold') || status.includes('organizing')) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status.includes('cancelled') || status.includes('discontinued') || status.includes('no_action')) return 'bg-slate-100 text-slate-700 border-slate-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

export const getPriorityBadgeClass = (priority?: string | null) => {
  if (priority === '高') return 'bg-red-50 text-red-700 border-red-200';
  if (priority === '中') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
};

/** plannedEndDate is a "YYYY-MM-DD" string; compared against the local date so today's deadline isn't overdue yet. */
export const isPastDue = (plannedEndDate: string | null | undefined, isDone: boolean) => {
  if (!plannedEndDate || isDone) return false;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return plannedEndDate.slice(0, 10) < today;
};

export const formatPriorityLabel = (priority?: string | null) => {
  if (priority === '高') return '◎';
  if (priority === '中') return '○';
  if (priority === '低') return '△';
  return priority ?? '';
};
