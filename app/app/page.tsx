import Link from "next/link";
import { DEPLOYMENT } from "@/lib/config";
import { BatchSimulator } from "@/components/BatchSimulator";
import { HeroCopy } from "@/components/HeroCopy";
import { Icon, Reveal, Ticker } from "@/components/ui";

const features = [
  { icon: "coins", title: "One payment, counted once", body: "A cart of tickets, merch and a tip is one batched transaction. Till draws every item from that single payment and rejects a cart that pays a wei too much or too little." },
  { icon: "lock", title: "Money held in escrow", body: "Each pass's price waits in the contract until the holder checks in, or until the release date. If the seller cancels, buyers get back exactly what they paid." },
  { icon: "bolt", title: "No wallet to install", body: "A test wallet appears on the device, the faucet tops it up in one tap, and there are no approvals or gas settings to think about." },
];

const steps = [
  { icon: "ticket", title: "Ada opens a shop", body: "One transaction creates her shop; one more lists every ticket tier and T-shirt." },
  { icon: "coins", title: "Tobi pays once", body: "Two tickets, a shirt and a tip: one tap, one transaction, one exact payment." },
  { icon: "door", title: "The door checks in", body: "Tobi's pass shows a code signed by his key. Only then does his money move to Ada." },
];

export default function Home() {
  return (
    <div className="space-y-20 sm:space-y-28">
      <section className="grain relative -mx-4 overflow-hidden rounded-b-[2rem] bg-ink px-4 pb-10 pt-10 text-paper sm:mx-0 sm:rounded-[2rem] sm:px-10 sm:pb-12 sm:pt-14">
        <div aria-hidden className="absolute -left-20 -top-24 h-80 w-80 animate-drift rounded-full bg-till-500/35 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 right-0 h-96 w-96 animate-drift-slow rounded-full bg-lime-400/20 blur-3xl" />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.1fr_.9fr]">
          <HeroCopy demoShop={DEPLOYMENT.demoShop} />
          <Reveal delay={0.25}>
            <BatchSimulator />
          </Reveal>
        </div>
        <div className="relative mt-10 grid grid-cols-3 gap-3 border-t border-white/10 pt-6 text-center sm:max-w-xl sm:text-left">
          <div><p className="num text-2xl font-bold text-lime-300 sm:text-3xl"><Ticker value={249} /></p><p className="text-xs text-paper/55">Fe tests</p></div>
          <div><p className="num text-2xl font-bold text-lime-300 sm:text-3xl"><Ticker value={960} /></p><p className="text-xs text-paper/55">random batches</p></div>
          <div><p className="num text-2xl font-bold text-lime-300 sm:text-3xl"><Ticker value={1.2} decimals={1} suffix="k" /></p><p className="text-xs text-paper/55">gas per entry</p></div>
        </div>
      </section>

      <section className="space-y-8">
        <Reveal>
          <p className="kicker">Why Till</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">Checkout that can&apos;t be paid once and delivered twice.</h2>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.08}>
              <div className="card group h-full transition-shadow duration-300 hover:shadow-lift">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-till-50 text-till-700 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                  <Icon name={f.icon} className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink/65">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="space-y-8">
        <Reveal>
          <p className="kicker">How it works</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">From link to door in three taps.</h2>
        </Reveal>
        <ol className="relative grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.1}>
              <li className="card h-full">
                <div className="flex items-center gap-3">
                  <span className="num grid h-8 w-8 place-items-center rounded-full bg-ink text-sm font-bold text-lime-300">{i + 1}</span>
                  <Icon name={s.icon} className="h-5 w-5 text-till-700" />
                </div>
                <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink/65">{s.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      <Reveal>
        <section className="grain relative overflow-hidden rounded-[2rem] bg-ink p-6 text-paper sm:p-10">
          <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 animate-drift rounded-full bg-till-500/25 blur-3xl" />
          <div className="relative grid items-center gap-8 lg:grid-cols-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-lime-300">The Fe guarantee</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">The compiler proves the money rules.</h2>
              <p className="mt-3 text-paper/70">
                Purchase logic declares a <code className="rounded bg-white/10 px-1.5">Till</code> effect and nothing that can read <code className="rounded bg-white/10 px-1.5">msg.value</code> or call out. Break that rule and Fe refuses to compile it.
              </p>
              <Link href="/lab" className="btn mt-5 bg-lime-300 text-ink hover:bg-lime-400">See the exploit and the fix <Icon name="arrow" className="h-4 w-4" /></Link>
            </div>
            <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-[12.5px] leading-relaxed text-paper/85 sm:text-sm">
              <span className="text-alarm-400">pub fn</span> purchase(item, qty, to, buyer) -&gt; u256{"\n"}
              <span className="text-alarm-400">uses</span> (register: <span className="text-alarm-400">mut</span> <span className="text-sky-400">Till</span>, catalog: <span className="text-alarm-400">mut</span> <span className="text-sky-400">Catalog</span>, …){"\n\n"}
              <span className="text-paper/40">// no Ctx  → can&apos;t read msg.value{"\n"}// no Call → can&apos;t run foreign code</span>
            </pre>
          </div>
        </section>
      </Reveal>

      {!DEPLOYMENT.ready && (
        <p className="card text-sm" role="alert">
          No deployment configured for this network. Run <code>make demo</code> for a local chain, or deploy to Sepolia.
        </p>
      )}
    </div>
  );
}
