import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { loadDemoDataset, prepare, validateDataset, type Dataset } from "@/lib/dataset";
import { TreeView, type ColorBy } from "@/components/TreeView";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CMAPLE Explorer — Phylogenetic analysis workspace" },
      { name: "description", content: "Prototype dashboard for exploring CMAPLE 2 phylogenetic trees, mutations and sample metadata." },
      { property: "og:title", content: "CMAPLE Explorer" },
      { property: "og:description", content: "Prototype dashboard for exploring CMAPLE 2 phylogenetic tree data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const Panel = ({ title, id, children, extra }: { title: string; id?: string; children: React.ReactNode; extra?: React.ReactNode }) => (
  <section id={id} className="rounded-md border bg-card p-4">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">{title}</h2>{extra}
    </div>
    {children}
  </section>
);

function Dashboard() {
  const [data, setData] = useState<Dataset>(loadDemoDataset);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const p = useMemo(() => prepare(data), [data]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mutation, setMutation] = useState<string | null>(null);
  const [colorBy, setColorBy] = useState<ColorBy>("lineage");
  const [treeSearch, setTreeSearch] = useState("");
  const [q, setQ] = useState(""); const [region, setRegion] = useState(""); const [lineage, setLineage] = useState("");
  const [mutQ, setMutQ] = useState("");
  const [threshold, setThreshold] = useState(0.8);
  const [lowOnly, setLowOnly] = useState(false);
  const [brushed, setBrushed] = useState<Set<string>>(new Set());
  const lowBranches = useMemo(() => [...p.nodes.values()].filter((n) => n.parent && n.support < threshold).sort((a, b) => a.support - b.support), [p, threshold]);

  const lineages = useMemo(() => [...new Set(data.samples.map((s) => s.lineage))].sort(), [data]);
  const regions = useMemo(() => [...new Set(data.samples.map((s) => s.region))].sort(), [data]);
  const mutCount = (id: string) => { let c = 0, n = p.nodes.get(id); while (n) { c += n.mutations.length; n = n.parent ? p.nodes.get(n.parent) : undefined; } return c; };
  const rows = data.samples.filter((s) =>
    (!q || s.id.toLowerCase().includes(q.toLowerCase())) && (!region || s.region === region) && (!lineage || s.lineage === lineage));
  const highlight = useMemo(() => {
    const set = new Set<string>();
    if (mutation) p.mutationStats.find((m) => m.id === mutation)?.nodeIds.forEach((id) => p.nodes.get(id)!.descendants.concat(id).forEach((d) => {
      let n = p.nodes.get(d); while (n && !set.has(n.id)) { set.add(n.id); if (n.id === id) break; n = n.parent ? p.nodes.get(n.parent) : undefined; }
    }));
    return set;
  }, [mutation, p]);
  const sel = selected ? p.nodes.get(selected) : undefined;
  const mutRows = p.mutationStats.filter((m) => !mutQ || m.id.toLowerCase().includes(mutQ.toLowerCase()) || String(m.position).includes(mutQ));
  const top = p.mutationStats.slice(0, 8);

  const searchTree = (e: React.FormEvent) => {
    e.preventDefault();
    const hit = data.samples.find((s) => s.id.toLowerCase().includes(treeSearch.trim().toLowerCase()));
    if (hit && treeSearch.trim()) setSelected(hit.id); else setUploadMsg({ ok: false, text: `No sample matches "${treeSearch}".` });
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      const d = validateDataset(JSON.parse(await f.text()));
      setData(d); setSelected(null); setMutation(null);
      setUploadMsg({ ok: true, text: `Loaded "${f.name}" (${d.samples.length} samples).` });
    } catch (err) { setUploadMsg({ ok: false, text: `Could not load file: ${(err as Error).message}` }); }
  };

  const stats = [
    ["Samples", data.samples.length], ["Tree nodes", data.tree.length],
    ["Unique mutations", data.mutations.length], ["With collection date", data.samples.filter((s) => s.collectionDate).length],
  ];
  const input = "rounded border bg-background px-2 py-1 text-sm";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-6 px-6 py-3">
          <div><div className="text-lg font-bold text-primary">CMAPLE Explorer</div><div className="text-xs text-muted-foreground">Phylogenetic analysis workspace</div></div>
          <nav className="flex gap-4 text-sm">
            {[["Overview", "#overview"], ["Phylogenetic Tree", "#tree"], ["Mutations", "#mutations"], ["About", "#about"]].map(([l, h]) => (
              <a key={h} href={h} className="text-foreground/80 hover:text-accent-foreground">{l}</a>))}
          </nav>
          <span className="ml-auto rounded-full border border-accent-foreground/30 bg-accent px-3 py-0.5 text-xs font-medium text-accent-foreground">{data === loadDemoDataset() ? "Demonstration Dataset" : "Uploaded Dataset"}</span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-6 py-5">
        <div id="overview" className="flex flex-wrap items-center gap-3 rounded-md border border-warn/40 bg-warn/10 px-4 py-2 text-xs text-foreground">
          <b>Fictional data.</b> All samples, lineages ("DEMO.*") and mutations are synthetic and do not represent real SARS-CoV-2 observations or CMAPLE 2 results.
          <label className="ml-auto cursor-pointer rounded border bg-card px-2 py-1 font-medium hover:bg-muted">
            Import JSON dataset<input type="file" accept=".json,application/json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        {uploadMsg && <div className={`rounded border px-3 py-1.5 text-xs ${uploadMsg.ok ? "border-accent-foreground/30 bg-accent" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>{uploadMsg.text} <button className="ml-2 underline" onClick={() => setUploadMsg(null)}>dismiss</button></div>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map(([l, v]) => (
            <div key={l} className="rounded-md border bg-card p-4"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 font-mono text-2xl font-semibold text-primary">{v}</div></div>))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Panel id="tree" title="Phylogenetic tree" extra={
            <div className="flex flex-wrap items-center gap-2">
              <form onSubmit={searchTree} className="flex gap-1">
                <input className={input} placeholder="Find sample, e.g. DEMO-012" value={treeSearch} onChange={(e) => setTreeSearch(e.target.value)} />
                <button className="rounded bg-primary px-2 text-xs text-primary-foreground">Locate</button>
              </form>
              <select className={input} value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
                <option value="lineage">Colour: lineage</option><option value="mutations">Colour: mutation count</option>
              </select>
              <button className="rounded border px-2 py-1 text-xs hover:bg-muted" onClick={() => { setSelected(null); setMutation(null); setBrushed(new Set()); setLowOnly(false); }}>Reset</button>
            </div>}>
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-2">Low-support threshold
                <input type="range" min={0} max={1} step={0.01} value={threshold} onChange={(e) => setThreshold(+e.target.value)} />
                <span className="w-10 font-mono">{threshold.toFixed(2)}</span>
              </label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />Show only low-support branches ({lowBranches.length})</label>
            </div>
            {p.leafCount ? <TreeView p={p} colorBy={colorBy} lineages={lineages} selected={selected} highlightNodes={highlight} onSelect={setSelected}
              supportThreshold={threshold} lowOnly={lowOnly} brushed={brushed} onBrush={(ids) => setBrushed(new Set(ids))} />
              : <div className="py-20 text-center text-sm text-muted-foreground">No tree data.</div>}
          </Panel>

          <div className="space-y-4">
            <Panel title="Details">
              {!sel ? <p className="text-sm text-muted-foreground">Select a node or branch in the tree, or a row in the sample table.</p> : (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">{sel.sample ? "Sample ID" : "Node"}</dt><dd className="font-mono">{sel.id}</dd>
                  {sel.sample ? <>
                    <dt className="text-muted-foreground">Collected</dt><dd>{sel.sample.collectionDate ?? <i className="text-muted-foreground">not available</i>}</dd>
                    <dt className="text-muted-foreground">Region</dt><dd>{sel.sample.region}</dd>
                    <dt className="text-muted-foreground">Lineage</dt><dd>{sel.sample.lineage}</dd>
                    <dt className="text-muted-foreground">Total muts.</dt><dd>{mutCount(sel.id)}</dd>
                  </> : <>
                    <dt className="text-muted-foreground">Descendants</dt><dd>{sel.descendants.length} samples</dd>
                    <dt className="text-muted-foreground">Children</dt><dd>{sel.children.length}</dd>
                  </>}
                  <dt className="text-muted-foreground">Support</dt><dd className={`font-mono ${sel.support < threshold ? "text-destructive" : ""}`}>{sel.support.toFixed(3)}</dd>
                  <dt className="text-muted-foreground">Log-lik.</dt><dd className="font-mono">{sel.logLikelihood.toFixed(2)}</dd>
                </dl>)}
              <p className="mt-3 text-[11px] text-muted-foreground">Annotations are demonstration values, not verified results.</p>
            </Panel>
            <Panel title="Branch details">
              {!sel || !sel.parent ? <p className="text-sm text-muted-foreground">Click a branch to see its annotations.</p> : (
                <div className="space-y-2 text-sm">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="text-muted-foreground">Branch</dt><dd className="font-mono">{sel.parent} → {sel.id}</dd>
                    <dt className="text-muted-foreground">Length</dt><dd className="font-mono">{sel.branchLength}</dd>
                    <dt className="text-muted-foreground">Support</dt><dd className={`font-mono ${sel.support < threshold ? "text-destructive" : ""}`}>{sel.support.toFixed(3)}{sel.support < threshold && " (low)"}</dd>
                    <dt className="text-muted-foreground">Log-lik.</dt><dd className="font-mono">{sel.logLikelihood.toFixed(2)}</dd>
                  </dl>
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted-foreground"><tr><th>Mutation</th><th className="text-right">Posterior</th></tr></thead>
                    <tbody>{sel.mutations.map((m) => (
                      <tr key={m} onClick={() => setMutation(m)} className="cursor-pointer border-t hover:bg-muted">
                        <td className="py-0.5 font-mono">{m}</td><td className={`text-right font-mono ${sel.mutationPosteriors[m]! < 0.9 ? "text-destructive" : ""}`}>{sel.mutationPosteriors[m]!.toFixed(3)}</td>
                      </tr>))}</tbody>
                  </table>
                  {!sel.mutations.length && <p className="text-xs text-muted-foreground">No mutations on this branch.</p>}
                </div>)}
            </Panel>
            {brushed.size > 0 && (
              <Panel title={`Area selection (${brushed.size})`} extra={<button className="text-xs underline" onClick={() => setBrushed(new Set())}>clear</button>}>
                <div className="flex max-h-32 flex-wrap gap-1 overflow-auto">
                  {[...brushed].map((id) => <button key={id} onClick={() => setSelected(id)} className="rounded bg-muted px-1.5 font-mono text-xs hover:bg-accent">{id}</button>)}
                </div>
              </Panel>
            )}
            <Panel title={`Low-support branches (< ${threshold.toFixed(2)})`}>
              <div className="max-h-40 space-y-0.5 overflow-auto text-xs">
                {lowBranches.map((n) => (
                  <button key={n.id} onClick={() => setSelected(n.id)} className="flex w-full justify-between rounded px-1 hover:bg-muted">
                    <span className="font-mono">{n.id}</span><span className="font-mono text-destructive">{n.support.toFixed(3)}</span>
                  </button>))}
                {!lowBranches.length && <p className="text-muted-foreground">None below threshold.</p>}
              </div>
            </Panel>
            <Panel title="Top mutations by descendants">
              <div className="space-y-1">
                {top.map((m) => (
                  <button key={m.id} onClick={() => setMutation(m.id)} className="flex w-full items-center gap-2 text-left text-xs">
                    <span className="w-16 font-mono">{m.id}</span>
                    <span className="h-3 flex-1 rounded-sm bg-muted"><span className={`block h-3 rounded-sm ${mutation === m.id ? "bg-highlight" : "bg-chart-2"}`} style={{ width: `${(m.descendantSamples / (top[0]?.descendantSamples || 1)) * 100}%` }} /></span>
                    <span className="w-6 text-right font-mono">{m.descendantSamples}</span>
                  </button>))}
              </div>
            </Panel>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel id="mutations" title="Mutation explorer (demo annotations)" extra={<input className={input} placeholder="Search mutation/position" value={mutQ} onChange={(e) => setMutQ(e.target.value)} />}>
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground"><tr><th className="py-1">Mutation</th><th>Position</th><th>Anc.</th><th>Der.</th><th className="text-right">Desc. samples</th></tr></thead>
                <tbody>{mutRows.map((m) => (
                  <tr key={m.id} onClick={() => setMutation(mutation === m.id ? null : m.id)} className={`cursor-pointer border-t hover:bg-muted ${mutation === m.id ? "bg-highlight/15" : ""}`}>
                    <td className="py-1 font-mono">{m.id}</td><td className="font-mono">{m.position}</td><td>{m.ancestral}</td><td>{m.derived}</td><td className="text-right font-mono">{m.descendantSamples}</td>
                  </tr>))}</tbody>
              </table>
              {!mutRows.length && <p className="py-6 text-center text-sm text-muted-foreground">No mutations match.</p>}
            </div>
          </Panel>

          <Panel title="Sample metadata" extra={
            <div className="flex gap-1">
              <input className={`${input} w-28`} placeholder="Search ID" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className={input} value={region} onChange={(e) => setRegion(e.target.value)}><option value="">All regions</option>{regions.map((r) => <option key={r}>{r}</option>)}</select>
              <select className={input} value={lineage} onChange={(e) => setLineage(e.target.value)}><option value="">All lineages</option>{lineages.map((r) => <option key={r}>{r}</option>)}</select>
            </div>}>
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground"><tr><th className="py-1">Sample ID</th><th>Date</th><th>Region</th><th>Lineage</th><th className="text-right">Muts.</th></tr></thead>
                <tbody>{rows.map((s) => (
                  <tr key={s.id} onClick={() => setSelected(s.id)} className={`cursor-pointer border-t hover:bg-muted ${selected === s.id ? "bg-highlight/15" : ""}`}>
                    <td className="py-1 font-mono">{s.id}</td><td>{s.collectionDate ?? "—"}</td><td>{s.region}</td><td>{s.lineage}</td><td className="text-right font-mono">{mutCount(s.id)}</td>
                  </tr>))}</tbody>
              </table>
              {!rows.length && <p className="py-6 text-center text-sm text-muted-foreground">No samples match these filters.</p>}
            </div>
          </Panel>
        </div>

        <Panel id="about" title="About">
          <p className="text-sm text-muted-foreground">
            This is a personal prototype showing how researchers could potentioally browsephylogenetic trees produced by CMAPLE 2.
            It does not run CMAPLE 2 inference and does not fetch live data. The dataset is fictional. 
            Custom data can be imported as JSON with
            three arrays: <code className="font-mono">samples</code> (id, collectionDate, region, lineage), <code className="font-mono">tree</code> (id, parent, branchLength, mutations) and
            <code className="font-mono"> mutations</code> (id, position, ancestral, derived). Sample IDs must match leaf node IDs.
          </p>
        </Panel>
      </main>
    </div>
  );
}
