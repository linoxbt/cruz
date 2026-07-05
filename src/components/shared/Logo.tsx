import { cn } from "@/lib/utils";

// CRUZ brand mark: two crossing arcs inside a rounded square — a stylized
// cross suggesting cross-chain traversal, in the violet accent with a mint
// counter-arc. Pure SVG so it scales crisply. Distinct from DevStation's
// terminal-chevron mark — no amber, no teal underscore.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("h-7 w-7", className)}
      role="img"
      aria-label="CRUZ"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="#7c3aed" fillOpacity="0.12" />
      <rect x="1.5" y="1.5" width="29" height="29" rx="9" stroke="#7c3aed" strokeWidth="1.5" />
      {/* upper-left → lower-right arc (violet) */}
      <path
        d="M8 8C12 9 14.5 12 16 16C17.5 20 20 23 24 24"
        stroke="#7c3aed"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* lower-left → upper-right arc (mint) */}
      <path
        d="M8 24C12 23 14.5 20 16 16C17.5 12 20 9 24 8"
        stroke="#2dd4bf"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
