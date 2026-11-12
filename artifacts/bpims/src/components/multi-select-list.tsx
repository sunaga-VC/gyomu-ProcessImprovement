import { useState } from "react";
import { Badge } from "@/components/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";

export function MultiSelectList({
  options,
  selectedIds,
  onChange,
  emptyLabel = "選択肢がありません",
  placeholder = "選択してください",
}: {
  options: { id: number; name: string }[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  emptyLabel?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  function toggle(id: number) {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(x => x !== id));
    else onChange([...selectedIds, id]);
  }

  const selectedNames = options.filter(o => selectedIds.includes(o.id)).map(o => o.name);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <span className={`truncate text-left ${selectedNames.length === 0 ? "text-muted-foreground" : "text-slate-700"}`}>
            {selectedNames.length === 0 ? placeholder : selectedNames.join("、")}
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            {selectedIds.length > 0 && (
              <Badge className="h-5 min-w-5 justify-center rounded-full px-1">{selectedIds.length}</Badge>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="max-h-52 overflow-y-auto divide-y">
          {options.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground text-center">{emptyLabel}</p>
          ) : options.map(o => (
            <label key={o.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={selectedIds.includes(o.id)}
                onChange={() => toggle(o.id)}
                className="w-4 h-4 rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">{o.name}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
