"use client";
import { useEffect, useMemo, useState } from "react";

// ------ Types ------
type ActionStatus = "proposed" | "approved" | "rejected";

type Action = {
  id: string;
  title: string;
  desc?: string;
  status: ActionStatus;
};

type Chunk = { source: string; snippet: string };

type Doc = { id: string; label: string; templateId: number; pdf?: string };

type ProposedActionIn = { title?: string; desc?: string };

type ApiChatReply = {
  text?: string;
  proposedActions?: ProposedActionIn[];
  chunks?: Chunk[];
};

type ApiChatResponse = {
  reply?: ApiChatReply;
};

type ApiApproveResponse = {
  action?: Action;
  error?: string;
};

type ApiSendDocsResponse = {
  ok?: boolean;
  submissionIds?: number[];
  error?: string;
};

// ------ Constants ------
const DOCS: Doc[] = [
  {
    id: "md-contract-sale",
    label: "Residential Contract of Sale",
    templateId: 1000001,
    pdf: "/forms/md/Residential_Contract_of_Sale_sample.pdf",
  },
  {
    id: "inspection-addendum",
    label: "Property Inspections Addendum",
    templateId: 1000002,
    pdf: "/forms/md/Inspection_Addendum_sample.pdf",
  },
  {
    id: "financing-addendum",
    label: "Conventional Financing Addendum",
    templateId: 1000003,
    pdf: "/forms/md/Financing_Addendum_sample.pdf",
  },
  {
    id: "lead-based-paint",
    label: "Lead-Based Paint Disclosure",
    templateId: 1000004,
    pdf: "/forms/md/Lead_Based_Paint_Disclosure_sample.pdf",
  },
];

export default function Home() {
  // ------ UI/Agent state ------
  const [message, setMessage] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(false);

  // session + doc / party state
  const [sessionId, setSessionId] = useState<string>("");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([DOCS[0].id]);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerEmail, setSellerEmail] = useState("");

  useEffect(() => {
    const existing = localStorage.getItem("agent.sessionId");
    if (existing) {
      setSessionId(existing);
    } else {
      const id = crypto.randomUUID();
      localStorage.setItem("agent.sessionId", id);
      setSessionId(id);
    }
  }, []);

  // ------ Styles ------
  const s = useMemo(() => {
    return {
      page: {
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
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

      row: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
        marginTop: 16,
      } as const,

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
      badge: (state: ActionStatus) => ({
        fontSize: 11,
        padding: "4px 8px",
        borderRadius: 999,
        border: "1px solid transparent",
        ...(state === "proposed" && {
          background: "rgba(250,204,21,0.15)",
          color: "#fde68a",
          borderColor: "rgba(250,204,21,0.35)",
        }),
        ...(state === "approved" && {
          background: "rgba(34,197,94,0.15)",
          color: "#86efac",
          borderColor: "rgba(34,197,94,0.35)",
        }),
        ...(state === "rejected" && {
          background: "rgba(244,63,94,0.15)",
          color: "#fda4af",
          borderColor: "rgba(244,63,94,0.35)",
        }),
      }),
      mono: {
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
      foot: { marginTop: 20, opacity: 0.6, fontSize: 12, textAlign: "center" as const },

      docBar: {
        display: "flex",
        gap: 12,
        alignItems: "center",
        marginTop: 12,
        flexWrap: "wrap" as const,
      },
      select: {
        appearance: "none",
        WebkitAppearance: "none",
        MozAppearance: "none",
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.04)",
        color: "inherit",
        cursor: "pointer",
      },
      docMeta: { opacity: 0.8, fontSize: 12 },
    };
  }, []);

  // ------ Helpers ------
  function buildChatPayload() {
    const selectedDocs = DOCS.filter((d) => selectedDocIds.includes(d.id)).map((d) => ({
      id: d.id,
      label: d.label,
      templateId: d.templateId,
    }));

    return {
      sessionId,
      mode: "contract_drafting",
      jurisdiction: "MD",
      message,
      context: {
        selectedDocs,
        parties: {
          buyer: { name: buyerName, email: buyerEmail },
          seller: { name: sellerName, email: sellerEmail || undefined },
        },
        // prefill: (window as any).__prefillValues || undefined
      },
      clientTs: Date.now(),
    };
  }

  // ------ Actions ------
  async function send() {
    if (!message.trim()) return;
    setLog((l) => [...l, `🧑 ${message}`]);
    setLoading(true);

    try {
      const payload = buildChatPayload();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data: ApiChatResponse = await res.json();

      // text reply
      setLog((l) => [...l, `🤖 ${data?.reply?.text ?? "Agent stub response."}`]);

      // proposed actions
      if (Array.isArray(data?.reply?.proposedActions) && data.reply!.proposedActions!.length) {
        const now = Date.now();
        const mapped: Action[] = data.reply!.proposedActions!.map(
          (a: ProposedActionIn, i: number): Action => ({
            id: `api-${now}-${i}`,
            title: a.title ?? "Proposed action",
            desc: a.desc,
            status: "proposed",
          })
        );
        setActions((prev) => [...mapped, ...prev]);
      }

      // retrieval evidence
      if (Array.isArray(data?.reply?.chunks)) {
        setChunks(data.reply!.chunks as Chunk[]);
      }
    } catch {
      setLog((l) => [...l, "⚠️ Error contacting /api/chat"]);
    } finally {
      setLoading(false);
      setMessage("");
    }
  }

  async function approve(proposalId: string, yes: boolean) {
    // optimistic UI
    setActions((items) =>
      items.map((a) => (a.id === proposalId ? { ...a, status: yes ? "approved" : "rejected" } : a))
    );

    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          proposalId,
          approve: yes,
          context: {
            selectedDocs: DOCS.filter((d) => selectedDocIds.includes(d.id)).map((d) => ({
              id: d.id,
              label: d.label,
              templateId: d.templateId,
            })),
            parties: {
              buyer: { name: buyerName, email: buyerEmail },
              seller: { name: sellerName, email: sellerEmail || undefined },
            },
            jurisdiction: "MD",
          },
        }),
      });

      const data: ApiApproveResponse = await res.json();
      if (!res.ok || !data?.action) {
        throw new Error(data?.error || "Approval failed");
      }

      setActions((items) =>
        items.map((a) => (a.id === data.action!.id ? { ...a, status: data.action!.status } : a))
      );

      window.alert(
        "✅ Demo: This action would now execute (e.g., Trello/Calendar/DocuSeal). In this demo, no external tools are called."
      );
    } catch {
      // revert optimistic update
      setActions((items) =>
        items.map((a) => (a.id === proposalId ? { ...a, status: "proposed" } : a))
      );
      alert("Failed to update action. Check server logs.");
    }
  }

  // ------ UI ------
  return (
    <div style={s.page}>
      <div style={s.shell}>
        {/* Header */}
        <header style={s.header}>
          <div style={s.titleWrap}>
            <div style={s.logo} />
            <div>
              <div style={s.h1}>ContractPilot MD</div>
              <div style={s.sub}>
                Maryland contracts · Addenda engine · HITL approvals · Render deploy
              </div>

              {/* Document & party selector */}
              <div style={s.docBar}>
                <div style={{ fontSize: 13, opacity: 0.85 }}>Select document(s):</div>

                <select
                  multiple
                  value={selectedDocIds}
                  onChange={(e) => {
                    const vals = Array.from(e.currentTarget.selectedOptions).map((o) => o.value);
                    setSelectedDocIds(vals);
                  }}
                  style={{ ...s.select, minWidth: 280, height: 78 }}
                  aria-label="Select one or more Maryland forms/addenda"
                >
                  {DOCS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>

                <button
                  style={s.btnGhost}
                  onClick={() => {
                    const first = DOCS.find((d) => d.id === selectedDocIds[0]);
                    if (first?.pdf) window.open(first.pdf, "_blank");
                  }}
                >
                  View sample PDF
                </button>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    style={s.input}
                    placeholder="Buyer full name"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                  />
                  <input
                    style={s.input}
                    placeholder="Buyer email"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                  />
                  <input
                    style={s.input}
                    placeholder="Seller full name"
                    value={sellerName}
                    onChange={(e) => setSellerName(e.target.value)}
                  />
                  <input
                    style={s.input}
                    placeholder="Seller email (optional)"
                    value={sellerEmail}
                    onChange={(e) => setSellerEmail(e.target.value)}
                  />
                </div>

                <button
                  style={s.btn}
                  onClick={async () => {
                    if (!buyerName || !buyerEmail) return alert("Buyer name and email are required.");
                    const templates = DOCS.filter((d) => selectedDocIds.includes(d.id)).map(
                      (d) => d.templateId
                    );

                    const res = await fetch("/api/send-docs", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        sessionId,
                        templateIds: templates,
                        submitters: [
                          { role: "Buyer", name: buyerName, email: buyerEmail },
                          ...(sellerEmail || sellerName
                            ? [
                                {
                                  role: "Seller",
                                  name: sellerName || "Seller",
                                  email: sellerEmail || "seller@example.com",
                                },
                              ]
                            : []),
                        ],
                        values: {
                          BuyerFullName: buyerName,
                          SellerFullName: sellerName,
                          // PurchasePrice: "520000",
                          // CloseDate: "2025-09-15",
                          // EMD: "3%",
                          // PropertyAddress: "1234 Main St, Baltimore, MD"
                        },
                      }),
                    });

                    const data: ApiSendDocsResponse = await res.json();
                    if (!res.ok) return alert(`Failed to send: ${data?.error || "Unknown error"}`);
                    alert(`Sent for signature.\nSubmission IDs: ${data.submissionIds?.join(", ")}`);
                  }}
                >
                  Send for Signature
                </button>

                <div style={s.docMeta}>
                  State: <b>Maryland</b> · Forms shown are <i>samples</i> for demo only.
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Feature summary */}
        <section style={s.card}>
          <div style={s.cardTitle}>What this demo shows</div>
          <div style={s.features}>
            <div style={s.featItem}>
              <b>Doc Selection</b>
              <br />
              Pick one or more Maryland forms/addenda to work on.
            </div>
            <div style={s.featItem}>
              <b>Intent → Fields</b>
              <br />
              Plain English terms mapped to required fields &amp; dates.
            </div>
            <div style={s.featItem}>
              <b>Addenda Engine</b>
              <br />
              Auto-include Inspection/Financing/Appraisal/Lead-Paint.
            </div>
            <div style={s.featItem}>
              <b>Approvals</b>
              <br />
              Human review before e-signature routing (demo actions).
            </div>
          </div>
        </section>

        <div style={s.row}>
          {/* Chat box */}
          <section style={s.card}>
            <div style={s.cardTitle}>Chat with the Agent</div>
            <div style={s.chatBox} id="chat-box">
              {log.length === 0 ? (
                <div style={{ opacity: 0.6 }}>
                  Try: <span style={s.mono}>"Offer at 520k, 3% EMD, close in 30 days, conventional, inspection in 7 days."</span>
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
                onKeyDown={(e) => (e.key === "Enter" ? send() : undefined)}
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
                    {a.desc ? (
                      <div style={{ opacity: 0.8, fontSize: 13 }}>{a.desc}</div>
                    ) : null}
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <button style={s.btnGhost} onClick={() => approve(a.id, true)}>
                        Approve
                      </button>
                      <button
                        style={s.btnGhost}
                        onClick={() =>
                          setActions((prev) => prev.filter((x) => x.id !== a.id))
                        }
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                  <div style={s.badge(a.status)}>{a.status}</div>
                </div>
              ))}
              {actions.length === 0 && (
                <div style={{ opacity: 0.6 }}>No proposed actions yet.</div>
              )}
            </div>
          </section>
        </div>

        {/* Retrieval evidence */}
        <section style={{ ...s.card, marginTop: 16 }}>
          <div style={s.cardTitle}>Retrieved Evidence (Top-k)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {chunks.map((c, i) => (
              <div key={i} style={s.featItem}>
                <div style={{ opacity: 0.8, fontSize: 12, marginBottom: 6 }}>
                  {c.source}
                </div>
                <div style={{ fontSize: 13 }}>{c.snippet}</div>
              </div>
            ))}
            {chunks.length === 0 && (
              <div style={{ opacity: 0.6 }}>No retrievals yet for this session.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
