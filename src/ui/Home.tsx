import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { TEMPLATES } from "../flow/templates";
import { useStore } from "../state/store";
import { Credit, Logo } from "./common";

export function Home() {
  const agents = useStore((state) => state.agents);
  const { openAgent, createBlank, createFromTemplate, deleteAgent } = useStore.getState();

  return (
    <div className="home">
      <header className="home-header">
        <Logo />
      </header>
      <main className="home-main">
        <section className="home-hero">
          <h1>Weave AI agents together, block by block</h1>
          <p>
            Drag models, documents and logic onto a canvas, connect them, and run the agent right away. No sign-up needed.
          </p>
          <button className="button primary large" onClick={createBlank}>
            <Plus size={18} /> New blank agent
          </button>
        </section>

        {agents.length > 0 && (
          <section className="home-section">
            <h2>Your agents</h2>
            <div className="card-grid">
              {agents.map((agent) => (
                <article className="agent-card" key={agent.id}>
                  <button className="agent-card-open" onClick={() => openAgent(agent.id)}>
                    <strong>{agent.name}</strong>
                    <span className="muted">
                      {agent.flow.nodes.length} blocks · edited {new Date(agent.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${agent.name}`}
                    onClick={() => {
                      if (confirm(`Delete "${agent.name}"? This can't be undone.`)) deleteAgent(agent.id);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            </div>
            <p className="muted small">Agents are saved in this browser only.</p>
          </section>
        )}

        <section className="home-section">
          <h2>Start from a template</h2>
          <div className="card-grid">
            {TEMPLATES.map((template) => (
              <button className="template-card" key={template.id} onClick={() => createFromTemplate(template)}>
                <strong>{template.name}</strong>
                <span className="muted">{template.description}</span>
                <span className="template-card-action">
                  Use template <ArrowRight size={14} />
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>
      <footer className="home-footer">
        <Credit />
      </footer>
    </div>
  );
}
