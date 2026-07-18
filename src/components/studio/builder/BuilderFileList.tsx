import { FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  files: Record<string, string>;
  activePath: string | null;
  onSelect: (path: string) => void;
}

/** A flat, sorted file list for the AI Builder's review pane. Unlike the
 *  Contract Editor's workspace, there's no create/rename/delete here — this
 *  is a read-only view of what the agent produced, so a simple list is
 *  enough (no nested-tree affordances to build/maintain for a review-only
 *  surface). */
export function BuilderFileList({ files, activePath, onSelect }: Props) {
  const paths = Object.keys(files).sort();

  if (paths.length === 0) {
    return <p className="p-3 font-mono text-xs text-meta">No files yet.</p>;
  }

  return (
    <div className="space-y-0.5 p-1">
      {paths.map((path) => (
        <button
          key={path}
          onClick={() => onSelect(path)}
          className={cn(
            "flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left font-mono text-[11px]",
            path === activePath
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
          )}
          title={path}
        >
          <FileCode2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{path}</span>
        </button>
      ))}
    </div>
  );
}
