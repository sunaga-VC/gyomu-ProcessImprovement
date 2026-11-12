import { useMemo, useRef, useState } from "react";
import { Button, Label } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseCsv, downloadCsvTemplate } from "@/lib/csv";
import { Upload, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";

const UNMAPPED = "__unmapped__";

export type CsvField = {
  key: string;
  label: string;
  required?: boolean;
};

export type CsvImportIssue = {
  row: number;
  message: string;
  level: "error" | "warning";
};

export type CsvImportResult = {
  successCount: number;
  issues: CsvImportIssue[];
};

type Step = "select" | "map" | "result";

/**
 * Generic CSV import flow: pick a file, map its columns to target fields (auto-matched by
 * header name where possible), preview a few resolved rows, then hand the full mapped row set
 * to `onImport` (which resolves names like 部署/部門/管理業務 to ids and calls the create API).
 */
export function CsvImportDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: CsvField[];
  onImport: (rows: Record<string, string>[]) => Promise<CsvImportResult>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("select");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [parseError, setParseError] = useState("");

  function reset() {
    setStep("select");
    setFileName("");
    setHeaders([]);
    setRecords([]);
    setMapping({});
    setImporting(false);
    setResult(null);
    setParseError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setParseError("");
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      setParseError("CSVにデータがありません。");
      return;
    }
    const [headerRow, ...dataRows] = rows;
    const autoMapping: Record<string, string> = {};
    for (const f of fields) {
      const idx = headerRow.findIndex((h) => h.trim() === f.label);
      autoMapping[f.key] = idx >= 0 ? String(idx) : UNMAPPED;
    }
    setFileName(file.name);
    setHeaders(headerRow);
    setRecords(dataRows);
    setMapping(autoMapping);
    setStep("map");
  }

  function mapRows(rows: string[][]): Record<string, string>[] {
    return rows.map((row) => {
      const obj: Record<string, string> = {};
      for (const f of fields) {
        const idx = mapping[f.key];
        obj[f.key] = idx && idx !== UNMAPPED ? (row[Number(idx)] ?? "").trim() : "";
      }
      return obj;
    });
  }

  const preview = useMemo(() => mapRows(records.slice(0, 5)), [records, mapping, fields]);
  const missingRequired = fields.filter((f) => f.required && (!mapping[f.key] || mapping[f.key] === UNMAPPED));

  async function handleImport() {
    setImporting(true);
    try {
      const mapped = mapRows(records);
      const res = await onImport(mapped);
      setResult(res);
      setStep("result");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {step === "select" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-md p-8 text-center space-y-3">
              <Upload className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm text-muted-foreground">CSVファイル（UTF-8）を選択してください。1行目は項目名の見出し行として扱われます。</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                ファイルを選択
              </Button>
              {parseError && <p className="text-sm text-red-600">{parseError}</p>}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => downloadCsvTemplate("template.csv", fields.map((f) => f.label))}
            >
              <FileText className="w-3.5 h-3.5" />サンプルCSVをダウンロード
            </Button>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <span className="font-medium">{fileName}</span>（{records.length}件） — CSVの列を項目に対応付けてください。
            </p>
            <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
              {fields.map((f) => (
                <div key={f.key} className="flex items-center gap-3 px-3 py-2">
                  <Label className="w-48 shrink-0 text-sm">
                    {f.label}
                    {f.required && <span className="text-red-500 ml-0.5">*</span>}
                  </Label>
                  <Select value={mapping[f.key] ?? UNMAPPED} onValueChange={(v) => setMapping((p) => ({ ...p, [f.key]: v }))}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNMAPPED}>-- 使用しない --</SelectItem>
                      {headers.map((h, i) => <SelectItem key={i} value={String(i)}>{h || `(列${i + 1})`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {missingRequired.length > 0 && (
              <p className="text-xs text-amber-700 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />必須項目が未対応です: {missingRequired.map((f) => f.label).join("、")}</p>
            )}
            {preview.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">プレビュー（先頭{preview.length}件）</Label>
                <div className="border rounded-md overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead className="bg-slate-50">
                      <tr>{fields.map((f) => <th key={f.key} className="text-left px-2 py-1.5 font-medium text-slate-600 whitespace-nowrap">{f.label}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y">
                      {preview.map((row, i) => (
                        <tr key={i}>{fields.map((f) => <td key={f.key} className="px-2 py-1.5 text-slate-700 whitespace-nowrap max-w-[160px] truncate">{row[f.key] || "-"}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{records.length}件中 {result.successCount}件を登録しました。</span>
            </div>
            {result.issues.length > 0 && (
              <div className="max-h-56 overflow-y-auto border rounded-md divide-y">
                {result.issues.map((issue, i) => (
                  <div key={i} className={`px-3 py-2 text-xs flex items-start gap-1.5 ${issue.level === "error" ? "text-red-700" : "text-amber-700"}`}>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{issue.row}行目: {issue.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "map" && (
            <>
              <Button type="button" variant="outline" onClick={reset}>やり直す</Button>
              <Button type="button" onClick={handleImport} disabled={importing || missingRequired.length > 0 || records.length === 0}>
                {importing ? "登録中..." : `${records.length}件をインポート`}
              </Button>
            </>
          )}
          {step === "result" && (
            <Button type="button" onClick={() => onOpenChange(false)}>閉じる</Button>
          )}
          {step === "select" && (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
