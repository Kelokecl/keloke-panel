import React, { useRef, useState } from "react";
import { Bot, ClipboardCopy, Loader2, Megaphone, ShieldCheck, ShoppingBag } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

const agents = [
  { id: "contenido", icon: Megaphone, title: "Contenido", description: "Copy, guion visual y plan de campaña." },
  { id: "ventas", icon: ShoppingBag, title: "Ventas", description: "Prioridades comerciales y respuestas para revisar." },
  { id: "operaciones", icon: ShieldCheck, title: "Operaciones", description: "Diagnóstico de conexiones y pasos de verificación." },
];

export default function AIManagerModule() {
  const [agent, setAgent] = useState("contenido");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const running = useRef(false);

  async function run(event) {
    event.preventDefault();
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    setCopied(false);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("keloke-agents", { body: { agent, brief } });
      if (invokeError) {
        const detail = await invokeError.context?.json?.().catch(() => null);
        throw new Error(detail?.error || "No se pudo conectar al agente.");
      }
      if (!data?.output) throw new Error("El agente no devolvió un borrador.");
      setResult(data);
    } catch (failure) {
      setError(failure.message || "Error al ejecutar el agente.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.output);
      setCopied(true);
    } catch {
      setError("No se pudo copiar. Puedes seleccionar el texto del borrador.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="rounded-3xl bg-slate-900 p-6 text-white sm:p-8">
        <Bot aria-hidden="true" className="mb-3 h-8 w-8 text-emerald-300" />
        <h2 className="text-2xl font-semibold">Agentes Keloke</h2>
        <p className="mt-2 text-sm text-slate-300">Encarga una tarea de contenido, ventas u operaciones y revisa el resultado antes de usarlo.</p>
      </header>
      <form onSubmit={run} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-3 font-semibold">Selecciona un agente</legend>
          {agents.map(({ id, icon: Icon, title, description }) => (
            <label key={id} className={`cursor-pointer rounded-2xl border p-4 ${agent === id ? "border-emerald-600 bg-emerald-50" : "border-slate-200"}`}>
              <input type="radio" name="agent" value={id} checked={agent === id} onChange={() => { setAgent(id); setResult(null); setError(""); }} />
              <Icon aria-hidden="true" className="ml-2 inline h-5 w-5" />
              <span className="ml-2 font-semibold">{title}</span>
              <span className="mt-1 block text-sm text-slate-600">{description}</span>
            </label>
          ))}
        </fieldset>
        <div>
          <label htmlFor="agent-brief" className="font-semibold">Encargo</label>
          <textarea id="agent-brief" rows={4} maxLength={1200} required={agent !== "operaciones"} value={brief} disabled={busy}
            onChange={(e) => setBrief(e.target.value)} placeholder="Ej.: prepara un reel para un producto del catálogo. Indica el nombre y el precio confirmado."
            className="mt-2 w-full rounded-xl border border-slate-300 p-3" />
          <p className="text-xs text-slate-600">El encargo se procesa con IA. Usa información comercial y evita incluir claves o datos de clientes.</p>
        </div>
        <button type="submit" disabled={busy || (agent !== "operaciones" && !brief.trim())} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white disabled:opacity-50">
          {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}{busy ? "Preparando borrador…" : "Ejecutar agente"}
        </button>
      </form>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
      {result && <section aria-live="polite" className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Borrador para revisión · {result.model}</h3>
          <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2"><ClipboardCopy aria-hidden="true" className="h-4 w-4" />{copied ? "Copiado" : "Copiar borrador"}</button>
        </div>
        {result.checkedAt && <p className="text-sm text-slate-600">Última comprobación de conexiones: {new Date(result.checkedAt).toLocaleString("es-CL", { timeZone: "America/Santiago" })}.</p>}
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">{result.output}</p>
        <Link to={agent === "operaciones" ? "/connections" : "/content"} className="inline-block text-sm font-semibold text-emerald-800 underline">{agent === "operaciones" ? "Abrir Conexiones" : "Abrir Estudio de contenido"}</Link>
      </section>}
    </div>
  );
}
