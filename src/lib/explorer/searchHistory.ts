// Recent explorer searches (address, tx, or block), persisted so the
// SearchBar can offer them again on focus — Etherscan-style. For addresses we
// remember the resolved name (contract/token) once the detail page loads it.
// CRUZ is single-chain (Arbitrum One), so unlike DevStation's version there's
// no per-network scoping here.

const STORAGE_KEY = "cruz-explorer-searches-v1";
const MAX_SEARCHES = 12;

export interface SearchEntry {
  query: string;
  kind: "address" | "tx" | "block";
  name?: string;
  isContract?: boolean;
  ts: number;
}

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function read(): SearchEntry[] {
  if (!hasWindow()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SearchEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: SearchEntry[]) {
  if (!hasWindow()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export const searchHistory = {
  load(): SearchEntry[] {
    return read();
  },
  // Record a search, de-duped per query. Newest first, capped.
  add(entry: Omit<SearchEntry, "ts">) {
    const q = entry.query.trim();
    if (!q) return;
    const key = q.toLowerCase();
    const existing = read().filter((s) => s.query.toLowerCase() !== key);
    write([{ ...entry, query: q, ts: Date.now() }, ...existing].slice(0, MAX_SEARCHES));
  },
  // Attach/refresh the resolved name + contract flag for an address search,
  // once the address detail page has loaded it.
  updateName(query: string, name: string | undefined, isContract?: boolean) {
    const key = query.toLowerCase();
    const list = read();
    let changed = false;
    for (const s of list) {
      if (s.query.toLowerCase() === key) {
        if (name && s.name !== name) {
          s.name = name;
          changed = true;
        }
        if (isContract != null && s.isContract !== isContract) {
          s.isContract = isContract;
          changed = true;
        }
      }
    }
    if (changed) write(list);
  },
  clear() {
    if (hasWindow()) localStorage.removeItem(STORAGE_KEY);
  },
};
