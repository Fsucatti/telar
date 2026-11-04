import { useCurrentAgent, useStore } from "../state/store";

export function Overview() {
  const agent = useCurrentAgent();
  const { updateAgentMeta, restoreVersion, setTab } = useStore.getState();
  if (!agent) return null;

  const stats = [
    ["Blocks", agent.flow.nodes.length],
    ["Connections", agent.flow.edges.length],
    ["Versions", agent.versions.length],
    ["Recent runs", agent.runs.length],
  ] as const;

  return (
    <main className="overview">
      <section className="overview-card">
        <label className="field">
          <span className="field-label">Description</span>
          <textarea
            rows={3}
            placeholder="What does this agent do?"
            value={agent.description}
            onChange={(event) => updateAgentMeta({ description: event.target.value })}
          />
        </label>
        <dl className="stats">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="overview-card">
        <h2>Versions</h2>
        <ul className="version-list">
          {[...agent.versions].reverse().map((version) => (
            <li key={version.number}>
              <strong>Version {version.number}</strong>
              <span className="muted small grow">{new Date(version.savedAt).toLocaleString()}</span>
              {version.number === agent.currentVersion && <span className="chip chip-purple">Current</span>}
              <button
                className="button"
                onClick={() => {
                  restoreVersion(version.number);
                  setTab("design");
                }}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="overview-card">
        <h2>Recent runs</h2>
        {agent.runs.length === 0 ? (
          <p className="muted">No runs yet. Open the playground in the Design view to try the agent.</p>
        ) : (
          <ul className="run-list">
            {agent.runs.map((run) => (
              <li key={run.id}>
                <div className="row">
                  <span className={`chip ${run.ok ? "chip-green" : "chip-pink"}`}>{run.ok ? "Finished" : "Failed"}</span>
                  {run.simulated && <span className="chip chip-orange">Simulated</span>}
                  <span className="muted small grow">{new Date(run.at).toLocaleString()}</span>
                  <span className="muted small">{(run.steps.reduce((sum, step) => sum + step.ms, 0) / 1000).toFixed(1)}s</span>
                </div>
                <p className="run-input">{run.input}</p>
                <p className="muted small run-output">{run.output}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
