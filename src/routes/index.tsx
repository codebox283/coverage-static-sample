import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadDemoDataset, prepare, mutationRanges, PRESET_DATASETS, type Prepared, type PresetDataset } from "@/lib/dataset";
import { TreeView, type ColorBy } from "@/components/TreeView";
import { WindowedRows } from "@/components/WindowedRows";

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
  <section id={id} className="min-w-0 rounded-md border bg-card p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">{title}</h2>{extra}
    </div>
    {children}
  </section>
);

function Dashboard() {
  const [p, setPrepared] = useState<Prepared>(() => prepare(loadDemoDataset()));
  const data = p.data;
  const workerRef = useRef<Worker | null>(null);
  const [importing, setImporting] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<PresetDataset>("demo");
  useEffect(() => () => workerRef.current?.terminate(), []);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mutation, setMutation] = useState<string | null>(null);
  const [colorBy, setColorBy] = useState<ColorBy>("lineage");
  const [treeSearch, setTreeSearch] = useState("");
  const [q, setQ] = useState(""); const [region, setRegion] = useState(""); const [lineage, setLineage] = useState("");
  const [mutQ, setMutQ] = useState("");
  const [threshold, setThreshold] = useState(0.8);
  const [lowOnly, setLowOnly] = useState(false);
  const [brushed, setBrushed] = useState<Set<string>>(new Set());
  const lowBranches = useMemo(() => p.ordered.filter((n) => n.parent && n.support < threshold).sort((a, b) => a.support - b.support), [p, threshold]);

  const lineages = useMemo(() => [...new Set(data.samples.map((s) => s.lineage))].sort(), [data]);
  const regions = useMemo(() => [...new Set(data.samples.map((s) => s.region))].sort(), [data]);
  const mutCount = (id: string) => p.nodes.get(id)?.totalMutations ?? 0;
  const rows = useMemo(() => data.samples.filter((s) =>
    (!q || s.id.toLowerCase().includes(q.toLowerCase())) && (!region || s.region === region) && (!lineage || s.lineage === lineage)), [data, q, region, lineage]);
  const highlight = useMemo(() => mutationRanges(p, mutation), [mutation, p]);
  const sel = selected ? p.nodes.get(selected) : undefined;
  const mutRows = useMemo(() => p.mutationStats.filter((m) => !mutQ || m.id.toLowerCase().includes(mutQ.toLowerCase()) || String(m.position).includes(mutQ)), [p, mutQ]);
  const brushedRows = useMemo(() => Array.from(brushed), [brushed]);
  const top = p.mutationStats.slice(0, 8);

  const searchTree = (e: React.FormEvent) => {
    e.preventDefault();
    const hit = data.samples.find((s) => s.id.toLowerCase().includes(treeSearch.trim().toLowerCase()));
    if (hit && treeSearch.trim()) setSelected(hit.id); else setUploadMsg({ ok: false, text: `No sample matches "${treeSearch}".` });
  };
  const loadInWorker = (source: File | { preset: PresetDataset }, label: string) => {
    workerRef.current?.terminate();
    setImporting(true); setUploadMsg(null);
    const worker = new Worker(new URL("../lib/dataset.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    const finish = () => { worker.terminate(); workerRef.current = null; setImporting(false); };
    worker.onmessage = (event: MessageEvent<{ prepared?: Prepared; error?: string }>) => {
      if (event.data.prepared) {
        const next = event.data.prepared;
        setPrepared(next); setSelected(null); setMutation(null); setBrushed(new Set());
        setUploadMsg({ ok: true, text: `Loaded "${label}" (${next.data.samples.length.toLocaleString()} samples).` });
      } else setUploadMsg({ ok: false, text: `Could not load dataset: ${event.data.error}` });
      finish();
    };
    worker.onerror = () => { setUploadMsg({ ok: false, text: "Could not load dataset. It may exceed this device’s available memory." }); finish(); };
    worker.postMessage(source);
  };
  const onFile = (file?: File) => {
    if (file) loadInWorker(file, file.name);
  };
  const onPresetChange = (id: PresetDataset) => {
    setSelectedPreset(id);
    const preset = PRESET_DATASETS.find(({ id: presetId }) => presetId === id);
    if (preset) loadInWorker({ preset: id }, preset.fileName);
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
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select aria-label="Dataset to import" className={input} value={selectedPreset} onChange={(e) => {
              const preset = PRESET_DATASETS.find(({ id }) => id === e.target.value);
              if (preset) onPresetChange(preset.id);
            }}>
              {PRESET_DATASETS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            </select>
            {importing && <span role="status" className="text-muted-foreground">Loading dataset…</span>}
            <label className="cursor-pointer rounded border bg-card px-2 py-1 font-medium hover:bg-muted">
              Upload JSON file<input type="file" accept=".json,application/json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
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
                    <dt className="text-muted-foreground">Descendants</dt><dd>{sel.leafEnd - sel.leafStart} samples</dd>
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
                        <td className="py-0.5 font-mono">{m}</td><td className={`text-right font-mono ${(sel.mutationPosteriors[m] ?? 1) < 0.9 ? "text-destructive" : ""}`}>{sel.mutationPosteriors[m]?.toFixed(3) ?? "—"}</td>
                      </tr>))}</tbody>
                  </table>
                  {!sel.mutations.length && <p className="text-xs text-muted-foreground">No mutations on this branch.</p>}
                </div>)}
            </Panel>
            {brushed.size > 0 && (
              <Panel title={`Area selection (${brushed.size})`} extra={<button className="text-xs underline" onClick={() => setBrushed(new Set())}>clear</button>}>
                <WindowedRows items={brushedRows} height={128} render={(id) => <tr key={id} className="h-7 cursor-pointer hover:bg-accent" onClick={() => setSelected(id)}><td className="truncate font-mono text-xs">{id}</td></tr>} />
              </Panel>
            )}
            <Panel title={`Low-support branches (< ${threshold.toFixed(2)})`}>
              <WindowedRows items={lowBranches} height={160} render={(n) => <tr key={n.id} className="h-7 cursor-pointer hover:bg-muted" onClick={() => setSelected(n.id)}><td className="truncate font-mono text-xs">{n.id}</td><td className="text-right font-mono text-xs text-destructive">{n.support.toFixed(3)}</td></tr>} />
              {!lowBranches.length && <p className="text-xs text-muted-foreground">None below threshold.</p>}
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
          <Panel id="mutations" title="Mutation explorer (demo annotations)" extra={<input className={`${input} max-w-full`} placeholder="Search mutation/position" value={mutQ} onChange={(e) => setMutQ(e.target.value)} />}>
            <WindowedRows items={mutRows} columns={5} minWidth={580} label="Mutation explorer data" header={<tr><th className="py-1">Mutation</th><th>Position</th><th>Anc.</th><th>Der.</th><th className="text-right">Desc. samples</th></tr>} render={(m) => (
                  <tr key={m.id} onClick={() => setMutation(mutation === m.id ? null : m.id)} className={`h-7 cursor-pointer border-t hover:bg-muted ${mutation === m.id ? "bg-highlight/15" : ""}`}>
                    <td className="py-1 font-mono" title={m.id}>{m.id}</td><td className="font-mono">{m.position}</td><td>{m.ancestral}</td><td>{m.derived}</td><td className="text-right font-mono">{m.descendantSamples}</td>
                  </tr>)} />
            {!mutRows.length && <p className="py-6 text-center text-sm text-muted-foreground">No mutations match.</p>}
            <p className="mt-2 text-xs text-muted-foreground">{mutRows.length.toLocaleString()} of {p.mutationStats.length.toLocaleString()} mutations</p>
          </Panel>

          <Panel title="Sample metadata" extra={
            <div className="flex max-w-full flex-wrap gap-1">
              <input className={`${input} w-28`} placeholder="Search ID" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className={input} value={region} onChange={(e) => setRegion(e.target.value)}><option value="">All regions</option>{regions.map((r) => <option key={r}>{r}</option>)}</select>
              <select className={input} value={lineage} onChange={(e) => setLineage(e.target.value)}><option value="">All lineages</option>{lineages.map((r) => <option key={r}>{r}</option>)}</select>
            </div>}>
            <WindowedRows items={rows} columns={5} minWidth={720} label="Sample metadata data" header={<tr><th className="py-1">Sample ID</th><th>Date</th><th>Region</th><th>Lineage</th><th className="text-right">Muts.</th></tr>} render={(s) => (
                  <tr key={s.id} onClick={() => setSelected(s.id)} className={`h-7 cursor-pointer border-t hover:bg-muted ${selected === s.id ? "bg-highlight/15" : ""}`}>
                    <td className="py-1 font-mono" title={s.id}>{s.id}</td><td>{s.collectionDate ?? "—"}</td><td title={s.region}>{s.region}</td><td title={s.lineage}>{s.lineage}</td><td className="text-right font-mono">{mutCount(s.id)}</td>
                  </tr>)} />
            {!rows.length && <p className="py-6 text-center text-sm text-muted-foreground">No samples match these filters.</p>}
            <p className="mt-2 text-xs text-muted-foreground">{rows.length.toLocaleString()} of {data.samples.length.toLocaleString()} samples</p>
          </Panel>
        </div>

        <Panel id="about" title="About">
          <p className="max-w-3xl text-sm text-muted-foreground">
            CMAPLE Explorer is a university research prototype showing how researchers could browse phylogenetic trees produced by CMAPLE 2.
            It does not run CMAPLE 2 inference and does not fetch live data. The dataset is fictional. Custom data can be imported as JSON with
            three arrays: <code className="font-mono">samples</code> (id, collectionDate, region, lineage), <code className="font-mono">tree</code> (id, parent, branchLength, mutations) and
            <code className="font-mono"> mutations</code> (id, position, ancestral, derived). Sample IDs must match leaf node IDs.
          </p>
        </Panel>
      </main>
    </div>
  );
}
