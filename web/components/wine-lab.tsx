"use client";
import { useEffect, useState } from "react";
import { ArrowRight, BarChart3, ChevronRight, CircleHelp, FlaskConical, Layers3, Leaf, ShieldCheck, Wine } from "lucide-react";
import { PredictionPanel } from "./prediction-panel";
import { BatchPanel } from "./batch-panel";
import { AnalyticsPanel } from "./analytics-panel";
type View = "predict" | "batch" | "analytics";
const navigation = [
  { id: "predict" as const, label: "Quality prediction", icon: FlaskConical },
  { id: "batch" as const, label: "Batch comparison", icon: Layers3 },
  { id: "analytics" as const, label: "Model analytics", icon: BarChart3 },
];
export default function WineLab() {
  const [view, setView] = useState<View>("predict");
  const [connection, setConnection] = useState("loading");
  useEffect(() => {
    const handle = () => { const h = location.hash.slice(1); if (["predict", "batch", "analytics"].includes(h)) setView(h as View); };
    handle(); window.addEventListener("hashchange", handle);
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal }).then(async r => { if (!r.ok || (await r.json() as { status?: string }).status !== "ok") throw new Error(); setConnection("ready"); }).catch(e => { if (e.name !== "AbortError") setConnection("error"); });
    return () => { controller.abort(); window.removeEventListener("hashchange", handle); };
  }, []);
  function navigate(next: View) { setView(next); history.replaceState(null, "", `#${next}`); window.scrollTo(0, 0); }
  return <div className="workspace"><a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className="sidebar">
      <a className="brand" href="#predict" onClick={() => navigate("predict")} aria-label="Wine Lab home"><span className="brand-symbol"><Wine size={25} strokeWidth={1.4} /></span><span>Wine<span className="brand-light">Lab</span><small>THE SCIENCE OF A GOOD POUR</small></span></a>
      <div className="workspace-name"><span className="workspace-avatar">WL</span><div>Red wine workspace<small>Vinho Verde collection</small></div><ChevronRight size={15} /></div>
      <p className="nav-label">EXPLORE</p><nav aria-label="Main navigation">{navigation.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => navigate(id)} className={`nav-item ${view === id ? "active" : ""}`} aria-current={view === id ? "page" : undefined}><Icon size={19} /><span>{label}</span>{view === id && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-note"><Leaf size={24} strokeWidth={1} /><p>Good wine starts<br />with better understanding.</p><span>CHEMISTRY MEETS CURIOSITY</span></div>
      <div className="sidebar-bottom"><a href="https://github.com/gregflamelit/testing3" target="_blank" rel="noreferrer"><CircleHelp size={17} />Project & documentation<ArrowRight size={14} /></a><div className="sidebar-version"><span className="online-dot" />Validated model<span>v1.0</span></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div>WORKSPACE<span>/</span><strong>Wine intelligence</strong></div><span className={`connection ${connection}`}><span />{connection === "ready" ? "Model connected" : connection === "loading" ? "Connecting to model" : "Connection unavailable"}</span></header>
      <main id="main-content" tabIndex={-1}><div className="page-heading"><div><div className="eyebrow"><span />RED WINE INTELLIGENCE</div><h1>{view === "predict" ? <>A little chemistry.<br /><em>A clearer picture.</em></> : view === "batch" ? <>Every sample.<br /><em>Side by side.</em></> : <>Behind the prediction.<br /><em>See the evidence.</em></>}</h1><p>{view === "predict" ? "Turn three lab measurements into an informed view of wine quality." : view === "batch" ? "Bring your lab results together. Compare estimates, spot differences, and explore." : "Understand how the model was selected, where it performs, and where it falls short."}</p></div><div className="heading-stamp"><FlaskConical size={24} strokeWidth={1.2} /><span>BUILT ON DATA.<br />MADE FOR DISCOVERY.</span></div></div>
        <div hidden={view !== "predict"}><PredictionPanel onCompare={() => navigate("batch")} onAnalytics={() => navigate("analytics")} /></div>
        <div hidden={view !== "batch"}><BatchPanel /></div>
        <div hidden={view !== "analytics"}><AnalyticsPanel /></div>
        {view !== "analytics" && <section className="evidence-strip" aria-label="Model evidence"><div><span className="strip-icon"><ShieldCheck size={22} /></span><div><strong>Evidence in every estimate</strong><p>Tested on held-out samples. Built with fewer inputs.</p></div></div><div className="evidence-number"><strong>1,599</strong><span>samples studied</span></div><div className="evidence-number"><strong>10</strong><span>model families tested</span></div><div className="evidence-number"><strong>0.45</strong><span>test mean absolute error</span></div><button className="text-button" onClick={() => navigate("analytics")}>Explore the model<ArrowRight size={16} /></button></section>}
        <footer className="page-footer"><span><Wine size={15} />Wine Lab<span>/</span>Curiosity, backed by chemistry.</span><span>Portuguese red Vinho Verde · Quality estimates, with context.</span></footer>
      </main>
    </div>
  </div>;
}
