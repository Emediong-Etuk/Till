import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-ink/[.06] bg-white/50">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-ink/55 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-semibold text-ink">Till</span> · every wei counted once · contracts written in Fe 26.6
        </p>
        <nav className="flex flex-wrap gap-4">
          <Link className="hover:text-ink" href="/lab">Security lab</Link>
          <Link className="hover:text-ink" href="/passes">My passes</Link>
          <a className="hover:text-ink" href="https://github.com/Emediong-Etuk/Till" target="_blank" rel="noreferrer">Source</a>
        </nav>
      </div>
    </footer>
  );
}
