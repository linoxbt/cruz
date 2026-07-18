import { useState } from "react";
import { Folder, ChevronRight, ChevronDown, Code2, FilePlus, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TreeNode } from "@/hooks/useWorkspace";

interface Props {
  node: TreeNode;
  depth?: number;
  activePath: string;
  onOpen: (p: string) => void;
  onDelete: (p: string, isDir: boolean) => void;
  onRename: (p: string) => void;
  onNewFile: (dir: string) => void;
  onNewFolder: (dir: string) => void;
}

export function FileTree({
  node,
  depth = 0,
  activePath,
  onOpen,
  onDelete,
  onRename,
  onNewFile,
  onNewFolder,
}: Props) {
  const [open, setOpen] = useState(depth < 2);
  const name = node.path.split("/").pop() ?? node.path;
  const isDir = node.type === "dir";
  const isRoot = isDir && node.path === "";
  const pad = { paddingLeft: depth * 12 + 4 };

  // The root is a transparent container — render only its children.
  if (isRoot) {
    return (
      <div>
        {(node.type === "dir" ? node.children : []).map((child) => (
          <FileTree
            key={child.path}
            node={child}
            depth={depth}
            activePath={activePath}
            onOpen={onOpen}
            onDelete={onDelete}
            onRename={onRename}
            onNewFile={onNewFile}
            onNewFolder={onNewFolder}
          />
        ))}
      </div>
    );
  }

  const iconBtn = "rounded p-0.5 text-meta hover:text-foreground";

  return (
    <div>
      <div
        className={cn(
          "group flex cursor-pointer items-center gap-1 rounded px-1 py-1 font-mono text-[11px] transition hover:bg-surface-2",
          node.path === activePath && "bg-primary/10",
        )}
        style={pad}
        onClick={() => (isDir ? setOpen((o) => !o) : onOpen(node.path))}
      >
        {isDir ? (
          open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-meta" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-meta" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {isDir ? (
          <Folder className="h-3 w-3 shrink-0 text-amber-500" />
        ) : (
          <Code2 className="h-3 w-3 shrink-0 text-primary" />
        )}
        <span className="flex-1 truncate text-foreground">{name}</span>

        {/* Per-node actions (revealed on hover) */}
        <div
          className="hidden items-center gap-0.5 group-hover:flex"
          onClick={(e) => e.stopPropagation()}
        >
          {isDir && (
            <>
              <button onClick={() => onNewFile(node.path)} title="New file" className={iconBtn}>
                <FilePlus className="h-3 w-3" />
              </button>
              <button onClick={() => onNewFolder(node.path)} title="New folder" className={iconBtn}>
                <FolderPlus className="h-3 w-3" />
              </button>
            </>
          )}
          <button onClick={() => onRename(node.path)} title="Rename" className={iconBtn}>
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={() => onDelete(node.path, isDir)}
            title="Delete"
            className="rounded p-0.5 text-meta hover:text-danger"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {open &&
        node.type === "dir" &&
        node.children.map((child) => (
          <FileTree
            key={child.path}
            node={child}
            depth={depth + 1}
            activePath={activePath}
            onOpen={onOpen}
            onDelete={onDelete}
            onRename={onRename}
            onNewFile={onNewFile}
            onNewFolder={onNewFolder}
          />
        ))}
    </div>
  );
}
