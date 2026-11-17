import Link from "next/link";
import { DEPLOYMENT } from "@/lib/config";

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="pt-6">
        <p className="pill bg-till-100 text-till-800">Built on Till · written in Fe</p>
        <h1 className="mt-3 text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          Every wei
          <br />
          counted once.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-ink/75">
          Sell tickets and merch with one link. Buyers pay for the whole cart in one tap, one transaction, one exact payment — and the
          contract holds their money until the door scans their pass.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/new" className="btn-primary text-lg" data-testid="cta-sell">Sell tickets</Link>
          {DEPLOYMENT.demoShop && (
            <Link href={`/s/${DEPLOYMENT.demoShop}`} className="btn-ghost text-lg" data-testid="cta-demo">Browse the demo shop</Link>
          )}
          <Link href="/lab" className="btn-ghost text-lg">Security lab</Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["One payment, counted once", "A cart of tickets, merch and a tip is one batched transaction. Till draws every item from that single payment and rejects a cart that pays a wei too much or too little."],
          ["Money in escrow", "Each pass's price waits in the contract until the holder checks in, or until the release date. If the seller cancels, you get back exactly what you paid."],
          ["No wallet needed", "A test wallet appears on your device, the faucet tops it up, and there are no approvals or gas settings to think about."],
        ].map(([t, d]) => (
          <div key={t} className="card">
            <h2 className="font-bold">{t}</h2>
            <p className="mt-1 text-sm text-ink/70">{d}</p>
          </div>
        ))}
      </section>

      <section className="card bg-ink text-paper">
        <h2 className="text-lg font-bold">Why it matters</h2>
        <p className="mt-2 text-sm text-paper/80">
          Fe&apos;s standard multicall runs every batched call with the full <code>msg.value</code>. A shop that trusts it can be paid once and
          deliver five times. Till makes payable batching safe: business logic can only draw from a budget, and Fe&apos;s effect system proves
          it can neither read <code>msg.value</code> nor call out while the budget is live.
        </p>
        <Link href="/lab" className="mt-3 inline-block font-semibold text-till-200 underline">See the exploit and the fix side by side →</Link>
      </section>
      {!DEPLOYMENT.ready && (
        <p className="card border-brass-500 text-sm" role="alert">
          No deployment configured for this network. Run <code>make demo</code> for a local chain, or deploy to Sepolia.
        </p>
      )}
    </div>
  );
}
