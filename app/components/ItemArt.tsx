import { Icon } from "./ui";

const art = {
  0: { icon: "ticket", bg: "from-till-400 to-till-700", ring: "shadow-[0_10px_24px_-12px_rgba(10,116,72,.8)]" },
  1: { icon: "shirt", bg: "from-brass-300 to-brass-600", ring: "shadow-[0_10px_24px_-12px_rgba(185,131,26,.8)]" },
  2: { icon: "star", bg: "from-sky-400 to-[#2f6fd6]", ring: "shadow-[0_10px_24px_-12px_rgba(47,111,214,.8)]" },
} as const;

export function ItemArt({ kind, size = "h-14 w-14" }: { kind: number; size?: string }) {
  const a = art[(kind as 0 | 1 | 2) in art ? (kind as 0 | 1 | 2) : 2];
  return (
    <span className={`grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white ${a.bg} ${a.ring} ${size}`}>
      <Icon name={a.icon} className="h-7 w-7" />
    </span>
  );
}
