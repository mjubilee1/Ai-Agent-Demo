# AI-Agent-Demo

A TypeScript demo showcasing how to **build and deploy an AI agent** that can:
- Ingest documents into a vector database  
- Retrieve context with RAG (retrieval-augmented generation)  
- Plan and call tools (web search, calendar, task management)  
- Run with **human-in-the-loop approvals**  
- Deploy easily on **Render**

---

## ✨ Features
- **TypeScript-first implementation** (Node 20)
- **Agent with tool use** powered by **Anthropic Claude**
- **RAG pipeline** with **Pinecone** + OpenAI embeddings
- **Fast API** layer (Express/Hono)
- **Postgres** for state & approvals
- **Background worker + cron** (Render)
- Optional **LangSmith** integration for tracing and evals
- Minimal **Next.js dashboard** for approvals

---

## 🧰 Tech Stack
- **Language:** TypeScript  
- **LLM:** Anthropic Claude (Sonnet)  
- **Embeddings:** OpenAI `text-embedding-3-large`  
- **Vector DB:** Pinecone  
- **Database:** Postgres  
- **Web/API:** Hono or Express  
- **UI (optional):** Next.js 14  
- **Deploy:** Render (web service, worker, cron)  