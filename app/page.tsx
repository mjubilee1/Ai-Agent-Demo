"use client";
import { useEffect, useMemo, useState } from "react";

type Action = { id: string; title: string; desc?: string; status: "proposed" | "approved" | "rejected" };
type Chunk = { source: string; snippet: string };

export default function Home() {
  const [message, setMessage] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [actions, setActions] = useState<Action[]>([
    { id: "a1", title: "Create Trello card: 'Follow up on pricing'", desc: "From inbox thread", status: "proposed" },
  ]);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    const existing = localStorage.getItem("agent.sessionId");
    if (existing) return setSessionId(existing);
    const id = crypto.randomUUID(); 
    localStorage.setItem("agent.sessionId", id);
    setSessionId(id);
  }, []);

  // --- inline styles ---
  const s = useMemo(() => {
    return {
      page: {
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        background: "#0b0b0c",
        color: "#e9e9f1",
        minHeight: "100vh",
        padding: "24px",
      },
      shell: {
        maxWidth: 1152,
        margin: "0 auto",
      },
      header: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 24,
      },
      titleWrap: { display: "flex", gap: 12, alignItems: "center" },
      logo: {
        width: 40,
        height: 40,
        borderRadius: 12,
        background: "linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)",
      },
      h1: { fontSize: 24, fontWeight: 700, letterSpacing: 0.2 },
      sub: { opacity: 0.7, fontSize: 13 },

      grid: {
        display: "grid",
        gridTemplateColumns: "1.1fr 0.9fr",
        gap: 16,
      } as const,
      card: {
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: 16,
      },
      cardTitle: { fontSize: 14, fontWeight: 600, opacity: 0.9, marginBottom: 12 },

      features: {
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0,1fr))",
        gap: 12,
        marginTop: 8,
      } as const,
      featItem: {
        padding: 12,
        borderRadius: 12,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        fontSize: 13,
        lineHeight: 1.3,
      },

      row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 } as const,

      chatBox: {
        height: 280,
        overflowY: "auto" as const,
        background: "rgba(0,0,0,0.25)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        whiteSpace: "pre-wrap" as const,
      },
      inputRow: { display: "flex", gap: 8 },
      input: {
        flex: 1,
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.04)",
        color: "inherit",
        outline: "none",
      },
      btn: {
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
        color: "#08130a",
        fontWeight: 700,
        cursor: "pointer",
      },
      btnGhost: {
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.03)",
        color: "inherit",
        fontSize: 12,
        cursor: "pointer",
      },

      list: { display: "flex", flexDirection: "column" as const, gap: 8 },
      actionItem: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 10,
        padding: 10,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
      },
      badge: (state: Action["status"]) => ({
        fontSize: 11,
        padding: "4px 8px",
        borderRadius: 999,
        border: "1px solid transparent",
        ...(state === "proposed" && { background: "rgba(250,204,21,0.15)", color: "#fde68a", borderColor: "rgba(250,204,21,0.35)" }),
        ...(state === "approved" && { background: "rgba(34,197,94,0.15)", color: "#86efac", borderColor: "rgba(34,197,94,0.35)" }),
        ...(state === "rejected" && { background: "rgba(244,63,94,0.15)", color: "#fda4af", borderColor: "rgba(244,63,94,0.35)" }),
      }),
      mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
      foot: { marginTop: 20, opacity: 0.6, fontSize: 12, textAlign: "center" as const },
    };
  }, []);

  async function send() {
    if (!message.trim()) return;
    setLog((l) => [...l, `🧑 ${message}`]);
    setLoading(true);
    try {
      // Call your backend agent (Next.js route or separate server)
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }),
      });
      const data = await res.json();
      setLog((l) => [...l, `🤖 ${data?.reply?.text ?? "Agent stub response."}`]);

      // Optional: update demo panels if API returns these
      if (data?.reply?.proposedActions?.length) {
        setActions((prev) => [
          ...data.reply.proposedActions.map((a: any, i: number) => ({
            id: `api-${Date.now()}-${i}`,
            title: a.title ?? "Proposed action",
            desc: a.desc,
            status: "proposed" as const,
          })),
          ...prev,
        ]);
      }
      if (data?.reply?.chunks?.length) {
        setChunks(data.reply.chunks);
      }
    } catch (e) {
      setLog((l) => [...l, `⚠️ Error contacting /api/chat`]);
    } finally {
      setLoading(false);
      setMessage("");
    }
  }

  function approve(id: string, yes: boolean) {
    setActions((items) =>
      items.map((a) => (a.id === id ? { ...a, status: yes ? "approved" : "rejected" } : a))
    );
  }

  return (
    <div style={s.page}>
      <div style={s.shell}>
        {/* Header */}
        <header style={s.header}>
          <div style={s.titleWrap}>
            <div style={s.logo} />
            <div>
              <div style={s.h1}>AI Agent Demo (TypeScript)</div>
              <div style={s.sub}>Claude planning · Pinecone RAG · Human-in-the-loop · Render deploy</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={s.btnGhost}
              onClick={() => window.open("https://render.com", "_blank")}
            >
              Deploy on Render
            </button>
            <button
              style={s.btnGhost}
              onClick={() => window.open("https://www.pinecone.io", "_blank")}
            >
              Pinecone
            </button>
            <button
              style={s.btnGhost}
              onClick={() => window.open("https://www.anthropic.com", "_blank")}
            >
              Anthropic
            </button>
          </div>
        </header>

        {/* Feature summary + Status */}
        <section style={s.card}>
          <div style={s.cardTitle}>What this demo shows</div>
          <div style={s.features}>
            <div style={s.featItem}><b>RAG Pipeline</b><br/>Chunk → Embed → Pinecone upsert → Search</div>
            <div style={s.featItem}><b>Agent Planning</b><br/>Claude picks tools with rationale</div>
            <div style={s.featItem}><b>Tool Use</b><br/>Web search / Tasks / Calendar (stubbed here)</div>
            <div style={s.featItem}><b>Approvals</b><br/>Actions require your OK before execution</div>
          </div>
        </section>

        <div style={s.row}>
          {/* Chat box */}
          <section style={s.card}>
            <div style={s.cardTitle}>Chat with the Agent</div>
            <div style={s.chatBox} id="chat-box">
              {log.length === 0 ? (
                <div style={{ opacity: 0.6 }}>
                  Try: <span style={s.mono}>"Summarize my inbox and propose next steps."</span>
                </div>
              ) : (
                log.map((line, i) => <div key={i}>{line}</div>)
              )}
            </div>
            <div style={s.inputRow}>
              <input
                style={s.input}
                placeholder={loading ? "Thinking..." : "Type a message…"}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" ? send() : null}
                disabled={loading}
              />
              <button style={s.btn} onClick={send} disabled={loading}>
                {loading ? "..." : "Send"}
              </button>
            </div>
          </section>

          {/* Proposed Actions */}
          <section style={s.card}>
            <div style={s.cardTitle}>Proposed Actions (HITL)</div>
            <div style={s.list}>
              {actions.map((a) => (
                <div key={a.id} style={s.actionItem}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{a.title}</div>
                    {a.desc ? <div style={{ opacity: 0.8, fontSize: 13 }}>{a.desc}</div> : null}
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <button style={s.btnGhost} onClick={() => approve(a.id, true)}>Approve</button>
                      <button style={s.btnGhost} onClick={() => approve(a.id, false)}>Reject</button>
                    </div>
                  </div>
                  <div style={s.badge(a.status)}>{a.status}</div>
                </div>
              ))}
              {actions.length === 0 && <div style={{ opacity: 0.6 }}>No proposed actions yet.</div>}
            </div>
          </section>
        </div>

        {/* Retrieval evidence */}
        <section style={{ ...s.card, marginTop: 16 }}>
          <div style={s.cardTitle}>Retrieved Evidence (Top-k)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {chunks.map((c, i) => (
              <div key={i} style={s.featItem}>
                <div style={{ opacity: 0.8, fontSize: 12, marginBottom: 6 }}>{c.source}</div>
                <div style={{ fontSize: 13 }}>{c.snippet}</div>
              </div>
            ))}
          </div>
        </section>

        <div style={s.foot}>
          Built with Next.js (inline styles), Hono backend, Pinecone, and Anthropic Claude.
        </div>
      </div>
    </div>
  );
}
