import { isApproved, nextStage } from "../shared/progression";
import { revisionAction, workPrompt } from "./prompts";
import { ReferencePanel } from "./References";
import { StudioSelect } from "./Select";
import React, { useEffect, useRef, useState, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import { Disclosure, Selection, Transport, ease } from "./MotionUI";
import type { Project } from "../shared/schema";
import type { CameraState, Pin } from "./Viewer";
import "./fonts.css";
import "./style.css";
const stageName = (stage: string) =>
  ({
    all: "All work",
    sketch: "2D Concepts",
    study: "3D Prototypes",
    model: "Developed Models",
  })[stage] ?? stage;
const Viewer = lazy(() =>
  import("./Viewer").then((m) => ({ default: m.Viewer })),
);
type Summary = { id: string; name: string; status: string };
const repo = "/Users/zaffran/vibed/mesh-foundry";
async function get(path: string) {
  const res = await fetch(path);
  const result = await res.json();
  if (!res.ok)
    throw Error(result.error?.message ?? result.error ?? "Request failed");
  return result;
}
function App() {
  const [projects, setProjects] = useState<Summary[]>([]),
    [projectId, setProjectId] = useState(
      localStorage.getItem("mf-project") ?? "",
    ),
    [p, setP] = useState<Project | null>(null),
    [assetId, setAssetId] = useState(""),
    [revisionId, setRevisionId] = useState(""),
    [compare, setCompare] = useState(""),
    [mode, setMode] = useState<"assets" | "animation">("assets"),
    [stage, setStage] = useState("all"),
    [clip, setClip] = useState("neutral"),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [looping, setLooping] = useState(true),
    [timeLabel, setTimeLabel] = useState(0),
    [neutral, setNeutral] = useState(false),
    [annotate, setAnnotate] = useState(false),
    [pendingPin, setPendingPin] = useState<Pin | undefined>(),
    [focusPin, setFocusPin] = useState<Pin | undefined>(),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [connected, setConnected] = useState(true),
    [copied, setCopied] = useState(""),
    [busy, setBusy] = useState(false);
  const time = useRef(0),
    camera = useRef<CameraState | null>(null),
    token = useRef(""),
    dataRoot = useRef(""),
    selectedProject = useRef(projectId);
  selectedProject.current = projectId;
  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const list = await get("/api/projects");
        if (!alive) return;
        setProjects(list);
        if (
          selectedProject.current &&
          !list.some(
            (item: Summary) =>
              item.id === selectedProject.current && item.status === "ready",
          )
        ) {
          setProjectId(
            list.find((item: Summary) => item.status === "ready")?.id ?? "",
          );
          setConnected(true);
          return;
        }
        const pid =
          selectedProject.current ||
          list.find((s: Summary) => s.status === "ready")?.id;
        if (pid) {
          if (!selectedProject.current) {
            setProjectId(pid);
            return;
          }
          const data = await get("/api/projects/" + encodeURIComponent(pid));
          if (alive && pid === selectedProject.current)
            setP((old) =>
              old && old.id === data.id && old.version >= data.version
                ? old
                : data,
            );
        }
        setConnected(true);
      } catch {
        if (alive) setConnected(false);
      }
    }
    get("/api/session")
      .then((s) => {
        token.current = s.token;
        dataRoot.current = s.dataRoot;
      })
      .catch(() => {});
    refresh();
    const interval = setInterval(refresh, 1500);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    localStorage.setItem("mf-project", projectId);
    setP(null);
    setAssetId("");
    setRevisionId("");
    setCompare("");
    camera.current = null;
    if (
      !projectId ||
      !projects.some((item) => item.id === projectId && item.status === "ready")
    )
      return;
    get("/api/projects/" + encodeURIComponent(projectId))
      .then((data) => {
        if (selectedProject.current === projectId)
          setP((old) =>
            old && old.id === data.id && old.version >= data.version
              ? old
              : data,
          );
      })
      .catch(() => {});
  }, [projectId]);
  useEffect(() => {
    if (p && !p.assets.some((a) => a.id === assetId))
      setAssetId(p.assets[0]?.id ?? "");
  }, [p, assetId]);
  const asset = p?.assets.find((a) => a.id === assetId),
    revisions = p?.revisions.filter((r) => r.assetId === assetId) ?? [],
    revision =
      revisions.find((r) => r.id === revisionId) ??
      (revisionId === "[missing]"
        ? revisions.filter((r) => stage === "all" || r.stage === stage).at(-1)
        : revisions.at(-1)),
    other = revisions.find((r) => r.id === compare),
    duration = revision?.clips.find((c) => c.name === clip)?.duration ?? 2;
  useEffect(() => {
    setCompare("");
    setPendingPin(undefined);
    setFocusPin(undefined);
    setNote("");
    camera.current = null;
    time.current = 0;
    setTimeLabel(0);
  }, [assetId]);
  useEffect(() => {
    if (revision && (!revisionId || revisionId === "[missing]"))
      setRevisionId(revision.id);
  }, [revision?.id, revisionId]);
  const liveDraft = useRef({ revisionId: revision?.id, note, pendingPin });
  liveDraft.current = { revisionId: revision?.id, note, pendingPin };
  useEffect(() => {
    setPendingPin(undefined);
    setFocusPin(undefined);
    setNote("");
    if (revision && !revision.clips.some((c) => c.name === clip))
      setClip(revision.clips[0]?.name ?? "");
  }, [revision?.id]);
  useEffect(() => {
    let frame: number,
      last = performance.now(),
      lastLabel = 0;
    function loop(now: number) {
      if (playing) {
        const next = time.current + Math.min((now - last) / 1000, 0.1) * speed;
        if (!looping && next >= duration) {
          time.current = duration;
          setPlaying(false);
          setTimeLabel(duration);
        } else time.current = next % Math.max(duration, 0.01);
        if (now - lastLabel > 80) {
          setTimeLabel(time.current);
          lastLabel = now;
        }
      }
      last = now;
      frame = requestAnimationFrame(loop);
    }
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, speed, looping]);
  function fileUrl(r: typeof revision, kind: string) {
    const f = r?.files.find((f) => f.kind === kind);
    return f ? `/api/projects/${p!.id}/revisions/${r!.id}/files/${f.id}` : "";
  }
  async function copy(action: string) {
    const prompt = workPrompt(
      repo,
      dataRoot.current,
      p,
      asset?.id,
      revision,
      action,
    );
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(action);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("Clipboard unavailable. Allow clipboard access and retry.");
    }
  }
  async function review(action: unknown) {
    if (!p || busy) return;
    const submitted = liveDraft.current;
    setBusy(true);
    setError("");
    try {
      let res = await fetch(`/api/projects/${p.id}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.current}`,
        },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          expectedVersion: p.version,
          action,
        }),
      });
      if (res.status === 401) {
        token.current = (await get("/api/session")).token;
        throw Error("Studio reconnected. Your draft is preserved; save again.");
      }
      const data = await res.json();
      if (!res.ok)
        throw Error(data.error?.message ?? "Review could not be saved");
      const updated = await get("/api/projects/" + p.id);
      if (selectedProject.current === p.id) {
        setP((old) =>
          old && old.id === updated.id && old.version >= updated.version
            ? old
            : updated,
        );
        const current = liveDraft.current;
        if (
          current.revisionId === submitted.revisionId &&
          current.note === submitted.note &&
          current.pendingPin === submitted.pendingPin
        ) {
          setNote("");
          setPendingPin(undefined);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function pinSelected(value: Pin) {
    setPlaying(false);
    setPendingPin(value);
    setFocusPin(value);
    setAnnotate(false);
  }
  const feedback =
    p?.feedback.filter((f) => f.revisionId === revision?.id) ?? [];
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.32, ease }}>
      <div className="studio">
        <header className="topbar">
          <a href="/" className="brand">
            <img src="/mark.svg" alt="" />
            <span>
              Mesh Foundry<span className="brand-period">.</span>
            </span>
          </a>
          <span className="divider" />
          <StudioSelect
            label="Project"
            variant="project"
            value={projectId}
            placeholder="Choose project"
            onChange={setProjectId}
            options={projects
              .filter((p) => p.status === "ready")
              .map((p) => ({
                value: p.id,
                label: p.name,
                description: "Local asset library",
              }))}
          />

          <span className="connection" role="status">
            {connected ? "Local studio" : "Connection lost · retrying"}
          </span>
          <button onClick={() => copy("Continue the current project task.")}>
            Copy starting prompt
          </button>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        <div className="workspace">
          <nav className="sidebar" aria-label="Asset navigation">
            <div className="nav-tabs">
              <button
                className={mode === "assets" ? "active" : ""}
                onClick={() => setMode("assets")}
              >
                {mode === "assets" && <Selection id="workspace-mode" />}
                <span>Assets</span>
              </button>
              <button
                className={mode === "animation" ? "active" : ""}
                onClick={() => {
                  setMode("animation");
                  setStage("all");
                }}
              >
                {mode === "animation" && <Selection id="workspace-mode" />}
                <span>Animation</span>
              </button>
            </div>
            {p?.categories.map((category) => (
              <section key={category.id}>
                <h2>{category.name}</h2>
                {p.assets
                  .filter((a) => a.categoryId === category.id)
                  .map((a) => (
                    <button
                      className={
                        "asset-item " + (a.id === assetId ? "selected" : "")
                      }
                      key={a.id}
                      onClick={() => {
                        setAssetId(a.id);
                        setRevisionId("");
                        setStage("all");
                      }}
                    >
                      <svg
                        className="asset-symbol"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        aria-hidden="true"
                      >
                        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z M4 7.5l8 4.5 8-4.5M12 12v9" />
                      </svg>
                      <span>
                        {a.name}
                        <small>
                          {p.accepted[a.id]
                            ? "Accepted revision"
                            : "In development"}
                        </small>
                      </span>
                    </button>
                  ))}
              </section>
            ))}
            <button
              className="add-asset"
              onClick={() =>
                copy(
                  "Create a NEW separate asset; the selected asset/revision is context only. Read the project brief and propose the next useful asset, then publish only 2D Concept candidates (stage sketch). Do not advance it to 3D or modify the selected asset.",
                )
              }
            >
              Copy new asset prompt
            </button>
            <div className="sidebar-bottom">
              {projects.some((x) => x.status === "unreadable") && (
                <p>Some projects need recovery. Use the CLI backup commands.</p>
              )}
              <small>Made locally. Reviewed by you.</small>
            </div>
          </nav>
          <main>
            {!asset ? (
              <div className="empty">
                <img src="/mark.svg" alt="" />
                <h1>Your next idea starts here.</h1>
                <p>
                  Discuss it with Codex. Your sketches, models and animation
                  takes will arrive in this worktable.
                </p>
                <button
                  onClick={() =>
                    copy(
                      "Create a project and its first asset with 2D Concept candidates only (stage sketch). Wait for creator approval before advancing to 3D.",
                    )
                  }
                >
                  Copy a starting prompt
                </button>
              </div>
            ) : (
              <>
                <motion.div className="asset-heading" layout="position">
                  <div>
                    <h1>
                      {asset.name}
                      {mode === "animation" ? " motion" : ""}
                    </h1>
                    <p>{asset.purpose || "Explore, refine, make it yours."}</p>
                  </div>
                  <button
                    disabled={!revision}
                    onClick={() =>
                      copy(
                        p && revision
                          ? revisionAction(p, revision)
                          : "Select a revision to improve.",
                      )
                    }
                  >
                    Copy revision prompt
                  </button>
                </motion.div>
                {p && revision && nextStage(revision.stage) && (
                  <div className="progression-actions">
                    <button
                      disabled={busy || !isApproved(p, revision)}
                      aria-describedby="progression-help"
                      onClick={() => copy(revisionAction(p, revision, true))}
                    >
                      {revision.stage === "sketch"
                        ? "Copy 3D prototype prompt"
                        : "Copy developed model prompt"}
                    </button>
                    <p id="progression-help">
                      {isApproved(p, revision)
                        ? `Revision ${revision.id} is approved for this stage. Copying only copies instructions; it does not start generation.`
                        : `Approve exact revision ${revision.id} in Acceptance before advancing. You can revise it first.`}
                    </p>
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {mode === "animation" && (
                    <motion.section
                      className="clip-library"
                      aria-label="Animation takes"
                      initial={{
                        height: 0,
                        marginBottom: 0,
                        opacity: 0,
                      }}
                      animate={{
                        height: "auto",
                        marginBottom: 24,
                        opacity: 1,
                      }}
                      exit={{
                        height: 0,
                        marginBottom: 0,
                        opacity: 0,
                      }}
                      style={{ overflow: "hidden" }}
                    >
                      <h2>Reusable clips</h2>
                      <div>
                        {revision?.clips.length ? (
                          revision.clips.map((c) => (
                            <button
                              key={c.name}
                              className={clip === c.name ? "active" : ""}
                              onClick={() => {
                                setClip(c.name);
                                time.current = 0;
                                setTimeLabel(0);
                                setPlaying(false);
                              }}
                            >
                              {clip === c.name && (
                                <Selection id="selected-clip" />
                              )}
                              <strong>{c.name}</strong>
                              <span>
                                {c.duration.toFixed(2)}s · {revision.id}
                              </span>
                            </button>
                          ))
                        ) : (
                          <p>
                            No clips in this revision.{" "}
                            <button
                              onClick={() =>
                                copy(
                                  "Develop an animation take for this exact rig revision.",
                                )
                              }
                            >
                              Copy animation prompt
                            </button>
                          </p>
                        )}
                      </div>
                    </motion.section>
                  )}
                </AnimatePresence>
                <motion.div className="review-toolbar">
                  <div className="stage-tabs">
                    {["all", "sketch", "study", "model"].map((s) => (
                      <button
                        className={stage === s ? "active" : ""}
                        key={s}
                        onClick={() => {
                          setStage(s);
                          const r = revisions
                            .filter((r) => s === "all" || r.stage === s)
                            .at(-1);
                          setRevisionId(r?.id ?? "[missing]");
                        }}
                      >
                        {stage === s && <Selection id="asset-stage" />}
                        {s === "all"
                          ? "All work"
                          : s === "sketch"
                            ? "2D Concepts"
                            : s === "study"
                              ? "3D Prototypes"
                              : "Developed Models"}
                      </button>
                    ))}
                  </div>
                  <label className="compare">
                    Compare
                    <StudioSelect
                      label="Compare revision"
                      value={compare}
                      onChange={setCompare}
                      options={[
                        {
                          value: "",
                          label: "Off",
                          description: "Focus on one revision",
                        },
                        ...revisions
                          .filter(
                            (r) =>
                              r.id !== revision?.id && r.stage !== "sketch",
                          )
                          .map((r) => ({
                            value: r.id,
                            label: r.id,
                            description: r.summary,
                          })),
                      ]}
                    />
                  </label>
                </motion.div>
                <p className="stage-help">
                  {stage === "sketch"
                    ? "2D Concepts explore appearance and design."
                    : stage === "study"
                      ? "3D Prototypes are real, rotatable meshes used to explore form and proportions."
                      : stage === "model"
                        ? "Developed Models are more developed assets; this label alone does not guarantee production readiness."
                        : "2D Concepts explore appearance and design. 3D Prototypes are real, rotatable meshes for exploring form and proportions. Developed Models are more developed assets; the label alone does not guarantee production readiness."}{" "}
                  Owner acceptance is separate from development stage.
                </p>
                {revision && (stage === "all" || revision.stage === stage) ? (
                  <>
                    <motion.div
                      layout="position"
                      className={"stages " + (other ? "comparing" : "")}
                    >
                      <motion.section
                        className="review-stage"
                        key={revision.id}
                        initial={{
                          opacity: 0.5,
                          clipPath: "inset(0 2% 0 2% round 12px)",
                        }}
                        animate={{
                          opacity: 1,
                          clipPath: "inset(0 0% 0 0% round 12px)",
                        }}
                        transition={{ duration: 0.32, ease }}
                      >
                        <div className="stage-label">
                          <span>
                            {revision.id} ·{" "}
                            {revision.stage === "sketch"
                              ? "2D Concepts"
                              : revision.stage === "study"
                                ? "3D Prototypes"
                                : "Developed Models"}
                          </span>
                          <span>
                            {p && isApproved(p, revision)
                              ? "Accepted"
                              : "Candidate"}
                            {revision.fixture ? " · Technical fixture" : ""}
                          </span>
                        </div>
                        {revision.stage === "sketch" ? (
                          <img
                            className="sketch"
                            src={fileUrl(revision, "image")}
                            alt={revision.summary}
                          />
                        ) : (
                          <Suspense
                            fallback={
                              <div className="loading">Loading model…</div>
                            }
                          >
                            <Viewer
                              url={fileUrl(revision, "model")}
                              clip={clip}
                              time={time}
                              playing={playing}
                              annotate={annotate}
                              onPin={pinSelected}
                              focusPin={focusPin}
                              camera={camera}
                              neutral={neutral}
                            />
                          </Suspense>
                        )}
                      </motion.section>
                      <AnimatePresence initial={false}>
                        {other && (
                          <motion.section
                            className="review-stage comparison-stage"
                            key="comparison"
                            initial={{ opacity: 0, x: 24, flexGrow: 0 }}
                            animate={{ opacity: 1, x: 0, flexGrow: 1 }}
                            exit={{ opacity: 0, x: 24, flexGrow: 0 }}
                            transition={{ duration: 0.28, ease }}
                          >
                            <div className="stage-label">
                              <span>{other.id} · comparison</span>
                              <span>
                                {!clip ||
                                other.clips.some((c) => c.name === clip)
                                  ? "Camera & time linked"
                                  : "Selected clip unavailable"}
                              </span>
                            </div>
                            <Suspense
                              fallback={
                                <div className="loading">
                                  Loading comparison…
                                </div>
                              }
                            >
                              <Viewer
                                url={fileUrl(other, "model")}
                                clip={clip}
                                time={time}
                                playing={playing}
                                annotate={false}
                                onPin={() => {}}
                                camera={camera}
                                neutral={neutral}
                              />
                            </Suspense>
                          </motion.section>
                        )}
                      </AnimatePresence>
                    </motion.div>
                    <Transport
                      playing={playing}
                      disabled={!revision.clips.length}
                      time={timeLabel}
                      duration={duration}
                      speed={speed}
                      loop={looping}
                      clips={revision.clips}
                      clip={clip}
                      onToggle={() => {
                        if (!playing && time.current >= duration) {
                          time.current = 0;
                          setTimeLabel(0);
                        }
                        setPlaying(!playing);
                      }}
                      onSeek={(value) => {
                        setPlaying(false);
                        time.current = value;
                        setTimeLabel(value);
                      }}
                      onSpeed={setSpeed}
                      onLoop={() => setLooping(!looping)}
                      onClip={(value) => {
                        setClip(value);
                        time.current = 0;
                        setTimeLabel(0);
                      }}
                    />
                    <div className="playback view-tools">
                      <button
                        aria-pressed={neutral}
                        onClick={() => setNeutral(!neutral)}
                      >
                        Neutral material
                      </button>
                      <button
                        aria-pressed={annotate}
                        disabled={revision.stage === "sketch"}
                        onClick={() => {
                          setAnnotate(!annotate);
                          setPlaying(false);
                        }}
                      >
                        {" "}
                        {annotate ? "Click a model point" : "Pin feedback"}
                      </button>
                    </div>
                    <p className="stage-hint">
                      {mode === "animation"
                        ? "Review this revision’s reusable clips."
                        : "Drag to orbit · scroll to inspect"}{" "}
                      {other
                        ? "Comparison shares the camera and playback time."
                        : ""}
                    </p>
                  </>
                ) : (
                  <div className="stage-empty">
                    No {stageName(stage)} candidate yet.{" "}
                    {stage === "study" || stage === "model" ? (
                      <span>
                        Select and approve an exact{" "}
                        {stage === "study" ? "2D Concept" : "3D Prototype"}{" "}
                        revision, then use its advancement prompt.
                      </span>
                    ) : (
                      <button
                        onClick={() =>
                          copy(
                            "Create a new 2D Concept candidate for this asset (stored stage: sketch). Read current decisions and feedback first. Do not advance to 3D.",
                          )
                        }
                      >
                        Copy concept prompt
                      </button>
                    )}
                  </div>
                )}
                <div className="asset-footer">
                  <div>
                    <h2>Revision trail</h2>
                    <div className="revision-trail">
                      {revisions.map((r) => (
                        <button
                          className={r.id === revision?.id ? "active" : ""}
                          key={r.id}
                          onClick={() => {
                            setRevisionId(r.id);
                            setStage("all");
                          }}
                        >
                          {r.id === revision?.id && (
                            <Selection id="selected-revision" />
                          )}
                          <strong>{r.id}</strong>
                          <span>{r.summary}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h2>Next on the worktable</h2>
                    <p>
                      {p?.currentTask ||
                        "Ask Codex to develop the next candidate."}
                    </p>
                  </div>
                </div>
              </>
            )}
            {p && revision && revision.stage !== "sketch" && (
              <ReferencePanel
                key={`${p.id}/${revision.id}`}
                p={p}
                revisionId={revision.id}
                onRefresh={() => {
                  const pid = p.id;
                  get("/api/projects/" + pid)
                    .then((data) => {
                      if (selectedProject.current === pid)
                        setP((old) =>
                          old && old.version >= data.version ? old : data,
                        );
                    })
                    .catch(() => {});
                }}
              />
            )}
          </main>
          <aside className="inspector">
            <h2>Review notes</h2>
            {revision ? (
              <>
                <p className="muted">
                  Feedback stays with <strong>{revision.id}</strong>.
                </p>
                {pendingPin && (
                  <div className="pin-summary">
                    Pinned to {pendingPin.objectId} · {pendingPin.clip} at{" "}
                    {pendingPin.time.toFixed(2)}s
                    <button onClick={() => setPendingPin(undefined)}>
                      Clear pin
                    </button>
                  </div>
                )}
                <textarea
                  aria-label="Feedback"
                  placeholder="What would you change?"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <button
                  className="primary"
                  disabled={!note.trim() || busy}
                  onClick={() =>
                    review({
                      type: "feedback",
                      revisionId: revision.id,
                      text: note,
                      pin: pendingPin,
                    })
                  }
                >
                  Save feedback
                </button>
                <div className="feedback-list">
                  {feedback.map((f, i) => (
                    <article key={f.id}>
                      <span className="note-number">{i + 1}</span>
                      <div>
                        <p>{f.text}</p>
                        <small>
                          {f.resolved ? "Resolved" : "Open"}
                          {f.pin
                            ? ` · ${f.pin.objectId} · ${f.pin.time.toFixed(2)}s`
                            : ""}
                        </small>
                        {f.pin && (
                          <button
                            onClick={() => {
                              setFocusPin(f.pin);
                              camera.current = {
                                position: f.pin!.camera,
                                target: f.pin!.target,
                                source: "feedback",
                              };
                              setClip(f.pin!.clip);
                              time.current = f.pin!.time;
                              setTimeLabel(time.current);
                              setPlaying(false);
                            }}
                          >
                            View pinned moment
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                <button
                  disabled={!feedback.length}
                  onClick={() =>
                    copy(
                      "Address the open feedback on this exact revision. Read all feedback IDs and preserve the accepted source.",
                    )
                  }
                >
                  Copy feedback prompt
                </button>
                <Disclosure className="accept-section" title="Acceptance">
                  <p>
                    {p && isApproved(p, revision)
                      ? "You approved this exact revision for its stage. New edits create an unapproved candidate. Approval does not guarantee production readiness."
                      : `Approve exact revision ${revision.id} for its stage when its design is ready to advance. This does not guarantee production readiness.`}
                  </p>
                  <button
                    disabled={busy || !!(p && isApproved(p, revision))}
                    onClick={() =>
                      review({ type: "accept", revisionId: revision.id })
                    }
                  >
                    {p && isApproved(p, revision)
                      ? "Accepted"
                      : "Accept this revision"}
                  </button>
                  <Disclosure title="Source files" initialOpen={false}>
                    {revision.files.map((f) => (
                      <a
                        key={f.id}
                        href={`/api/projects/${p!.id}/revisions/${revision.id}/files/${f.id}`}
                        download={f.name}
                      >
                        {f.name}
                      </a>
                    ))}
                  </Disclosure>
                </Disclosure>
              </>
            ) : (
              <p className="muted">Select an asset to inspect its work.</p>
            )}
            <Disclosure className="decisions" title="Design decisions">
              {p?.decisions
                .filter(
                  (d) =>
                    (!d.scope || d.scope === assetId) &&
                    !p.decisions.some((n) => n.supersedes === d.id),
                )
                .map((d) => (
                  <p key={d.id}>{d.text}</p>
                ))}
              {!p?.decisions.length && (
                <p className="muted">
                  Decisions recorded with Codex will appear here.
                </p>
              )}
            </Disclosure>
          </aside>
        </div>
        <AnimatePresence>
          {copied && (
            <motion.div
              className="toast"
              role="status"
              initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: 8, filter: "blur(3px)" }}
              transition={{ duration: 0.22 }}
            >
              Prompt copied. Paste into your agent and add direction.
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
