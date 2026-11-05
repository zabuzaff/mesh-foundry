import { useState } from "react";
import type { Project } from "../shared/schema";
import { referenceViews } from "../shared/reference-views";
import { StudioSelect } from "./Select";
import { Disclosure } from "./MotionUI";
export function ReferencePanel({
  p,
  revisionId,
  onRefresh,
}: {
  p: Project;
  revisionId: string;
  onRefresh: () => void;
}) {
  const sets = p.renderSets.filter((r) => r.revisionId === revisionId);
  const [chosen, setChosen] = useState("");
  const rs = sets.find((r) => r.id === chosen) ?? sets.at(-1);
  const [selected, setSelected] = useState<string[]>([
    "front",
    "three-quarter",
  ]);
  const [projectId, setProjectId] = useState(""),
    [sceneId, setSceneId] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function mutate(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const session = await (await fetch("/api/session")).json();
      const response = await fetch(`/api/projects/${p.id}/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error?.message ?? "Request failed");
      if (result.status === "failed") setError(result.error);
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Disclosure
      title="Reference renders"
      initialOpen={false}
      className="reference-panel"
    >
      <p>
        Exact revision <strong>{revisionId}</strong>. Neutral rest state · three
        views · 1024 px.
      </p>
      <button
        disabled={busy}
        onClick={() => {
          const requestId = crypto.randomUUID();
          setChosen(requestId);
          mutate("renders", { requestId, revisionId });
        }}
      >
        {busy ? "Working…" : "Generate reference set"}
      </button>
      <p className="muted">
        Rendering can take several minutes. Outputs never accept a revision or
        update Scene Loom automatically.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!!sets.length && (
        <StudioSelect
          label="Reference set"
          value={rs?.id ?? ""}
          onChange={setChosen}
          options={sets.map((r) => ({
            value: r.id,
            label: r.createdAt.slice(11, 19) + " · " + r.status,
            description: r.id,
          }))}
        />
      )}
      {rs && (
        <>
          <p className="reference-status">
            <strong>{rs.label}</strong>
          </p>
          <p className="muted">
            {rs.preset} · GLB{" "}
            {rs.sources.find((s) => s.id === rs.modelFileId)?.hash.slice(0, 12)}{" "}
            · {rs.status}
          </p>
          {rs.status === "running" && (
            <button onClick={() => mutate(`renders/${rs.id}/cancel`, {})}>
              Cancel render
            </button>
          )}
          {rs.error && <p role="alert">{rs.error}</p>}
          {rs.status === "completed" && (
            <>
              <div className="reference-images">
                {rs.outputs.map((o) => (
                  <label key={o.view}>
                    <a
                      href={`/api/projects/${p.id}/renders/${rs.id}/${o.view}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        alt={`${o.view} reference for ${revisionId}`}
                        src={`/api/projects/${p.id}/renders/${rs.id}/${o.view}`}
                      />
                    </a>
                    <span>
                      <input
                        type="checkbox"
                        checked={selected.includes(o.view)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, o.view]
                              : selected.filter((v) => v !== o.view),
                          )
                        }
                      />
                      {o.view}
                    </span>
                  </label>
                ))}
              </div>
              <h3>Send selected references</h3>
              <p>
                Choose an existing Scene Loom destination. Preview before
                sending. Only supporting images are added.
              </p>
              <label>
                Destination project
                <input
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="Existing project ID"
                />
              </label>
              <label>
                Destination scene
                <input
                  value={sceneId}
                  onChange={(e) => setSceneId(e.target.value)}
                  placeholder="Existing scene ID"
                />
              </label>
              <button
                disabled={busy || !selected.length || !projectId || !sceneId}
                onClick={() =>
                  mutate("handoffs", {
                    requestId: crypto.randomUUID(),
                    renderSetId: rs.id,
                    views: referenceViews.filter((v) => selected.includes(v)),
                    projectId,
                    sceneId,
                  })
                }
              >
                Preview handoff
              </button>
            </>
          )}
        </>
      )}
      {p.handoffs
        .filter((h) => h.renderSetId === rs?.id)
        .map((h) => (
          <Disclosure
            className="handoff"
            key={h.id}
            title={`${h.target.projectId} / ${h.target.sceneId} · ${h.status}`}
            initialOpen={h.status !== "completed" && h.status !== "cancelled"}
          >
            <p>
              Source set <strong>{h.renderSetId}</strong> · revision{" "}
              {revisionId}
            </p>
            <p className="reference-status">{rs?.label}</p>
            <p>
              {h.views.join(", ")} · {h.status}
            </p>
            <p className="muted">Library: {h.target.dataRoot}</p>
            <p>
              {h.preview.length} existing supporting images at preview. Main
              image, notes and layout preserved.
            </p>
            {h.error && <p role="alert">{h.error}</p>}
            {Object.keys(h.imported).length > 0 && h.status !== "completed" && (
              <p>
                Owned copies may already be imported. Resume reconciles current
                scene contents.
              </p>
            )}
            {h.status !== "completed" && h.status !== "cancelled" && (
              <button
                disabled={busy}
                onClick={() => mutate(`handoffs/${h.id}/send`, {})}
              >
                {h.status === "prepared" ? "Send references" : "Resume handoff"}
              </button>
            )}
            {h.status === "prepared" && (
              <button
                disabled={busy}
                onClick={() => mutate(`handoffs/${h.id}/cancel`, {})}
              >
                Cancel handoff
              </button>
            )}
          </Disclosure>
        ))}
    </Disclosure>
  );
}
