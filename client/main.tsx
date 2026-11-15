import { approvedRevision, isApproved, nextStage } from "../shared/progression";
import {
  rehearsalPrompt,
  candidateReviewPrompt,
  linkedRehearsalAction,
  linkedFitIdentity,
  correctionAction,
  revisionAction,
  detailedConceptAction,
  workPrompt,
} from "./prompts";
import { ReferencePanel } from "./References";
import { StudioSelect } from "./Select";
import React, { useEffect, useRef, useState, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import { Disclosure, Selection, Transport, ease } from "./MotionUI";
import type { RehearsalContext } from "../shared/rehearsal";
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
    [dataRoot, setDataRoot] = useState<string>(),
    [clipMetadata, setClipMetadata] = useState<{
      url: string;
      hash: string;
      clips?: (string | null)[];
    }>(),
    [busy, setBusy] = useState(false);
  const time = useRef(0),
    camera = useRef<CameraState | null>(null),
    token = useRef(""),
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
        setDataRoot(s.dataRoot || "");
      })
      .catch(() => setDataRoot(""));
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
        : revisionId
          ? undefined
          : revisions.at(-1)),
    modelFile = revision?.files.find((f) => f.kind === "model"),
    other = revisions.find((r) => r.id === compare),
    duration = revision?.clips.find((c) => c.name === clip)?.duration ?? 2;
  const link = asset?.rehearsal;
  const linkKey = link && p ? JSON.stringify([p.id, assetId, link]) : "";
  const linkUrl =
    linkKey && p ? `/api/projects/${p.id}/assets/${assetId}/rehearsal` : "";
  type LinkedResult = RehearsalContext & {
    sceneLoom: { checkout: string; dataRoot: string };
    foundryVersion: number;
  };
  const [linked, setLinked] = useState<{
    key: string;
    result?: LinkedResult;
    error?: string;
  }>();
  const [rehearsalRefresh, refreshRehearsal] = useState(0);
  const lookupKey = JSON.stringify([linkKey, p?.version, rehearsalRefresh]);
  const currentLookupKey = useRef(lookupKey);
  currentLookupKey.current = lookupKey;
  useEffect(() => {
    if (!linkUrl) return;
    let active = true;
    get(linkUrl)
      .then((result) => {
        if (active) setLinked({ key: lookupKey, result });
      })
      .catch((error: Error) => {
        if (active) setLinked({ key: lookupKey, error: error.message });
      });
    return () => {
      active = false;
    };
  }, [linkUrl, lookupKey]);
  useEffect(() => {
    if (!linkUrl) return;
    const refresh = () => refreshRehearsal((n) => n + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [linkUrl]);
  const observed = linked?.key === lookupKey ? linked : undefined;
  const context =
    observed?.result?.status === "ready" &&
    observed.result.foundryVersion === p?.version
      ? observed.result
      : undefined;
  const [view, setView] = useState<{ key: string; index: number }>();
  const conceptImages = revision?.files.filter((f) => f.kind === "image") ?? [];
  const viewKey = JSON.stringify([p?.id, revision?.id]);
  const imageIndex =
    view?.key === viewKey && conceptImages[view.index] ? view.index : 0;
  const shownImage = conceptImages[imageIndex];
  const conceptId = p && approvedRevision(p, assetId, "sketch");
  const concept = revisions.find((r) => r.id === conceptId);
  const canAdvance = revision && nextStage(revision.stage);
  const rehearsalUrl =
    mode === "assets" &&
    (stage === "all" || stage === "model") &&
    p &&
    revision?.stage === "model" &&
    modelFile &&
    isApproved(p, revision)
      ? `/api/projects/${p.id}/revisions/${revision.id}/files/${modelFile.id}/clips`
      : "";
  const rehearsalHash = modelFile?.hash;
  const currentClipMetadata =
    clipMetadata?.url === rehearsalUrl && clipMetadata.hash === rehearsalHash
      ? clipMetadata
      : undefined;
  const rehearsalClips = currentClipMetadata?.clips;
  useEffect(() => {
    if (!rehearsalUrl || !rehearsalHash) return;
    let active = true;
    get(rehearsalUrl)
      .then(({ hash, clips }) => {
        if (active)
          setClipMetadata({
            url: rehearsalUrl,
            hash: rehearsalHash,
            clips: hash === rehearsalHash ? clips : undefined,
          });
      })
      .catch(() => {
        if (active) setClipMetadata({ url: rehearsalUrl, hash: rehearsalHash });
      });
    return () => {
      active = false;
    };
  }, [rehearsalUrl, rehearsalHash]);
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
    return copyText(
      workPrompt(repo, dataRoot ?? "", p, asset?.id, revision, action),
    );
  }
  async function copyText(prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(prompt);
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
  const actions: { label: string; run: () => void; disabled?: boolean }[] = [];
  let linkMessage =
    observed?.error ??
    (observed?.result?.status !== "ready"
      ? observed?.result?.message
      : undefined);
  let offerLinkedRevision = false;
  const linkedSource = context?.candidate?.model ?? context?.requirement.source;
  if (p && revision && link && context && linkedSource) {
    const sourceRevision = revisions.find(
      (r) => r.id === linkedSource.revisionId,
    );
    let cursor = revision;
    const walked = new Set<string>();
    while (
      cursor.parentId &&
      cursor.id !== linkedSource.revisionId &&
      !walked.has(cursor.id)
    ) {
      walked.add(cursor.id);
      const parent = revisions.find((r) => r.id === cursor.parentId);
      if (!parent) break;
      cursor = parent;
    }
    const isIntermediate =
      !context.candidate &&
      sourceRevision?.stage !== "model" &&
      revision.stage !== "model" &&
      cursor.id === linkedSource.revisionId;
    const copyLinked = async (prompt: string) => {
      try {
        const current = await get(linkUrl);
        if (
          currentLookupKey.current !== lookupKey ||
          liveDraft.current.revisionId !== revision.id ||
          selectedProject.current !== p.id
        )
          return;
        if (JSON.stringify(current) !== JSON.stringify(context)) {
          setLinked({ key: lookupKey, result: current });
          setError(
            "Rehearsal context changed. Check the updated action before copying.",
          );
          return;
        }
        await copyText(prompt);
      } catch (error) {
        if (currentLookupKey.current !== lookupKey) return;
        setLinked({ key: lookupKey, error: (error as Error).message });
      }
    };
    if (revision.id !== linkedSource.revisionId && !isIntermediate) {
      offerLinkedRevision = true;
      linkMessage = `The active rehearsal handoff targets ${linkedSource.revisionId}.`;
      const intermediateParent =
        !context.candidate &&
        sourceRevision?.stage !== "model" &&
        cursor.id === linkedSource.revisionId &&
        revisions.find((r) => r.id === revision.parentId)?.stage === "study";
      if (
        revision.stage === "model" &&
        (revision.parentId === linkedSource.revisionId || intermediateParent)
      ) {
        actions.push({
          label: "Copy candidate writeback prompt",
          run: () =>
            copyLinked(
              workPrompt(
                repo,
                dataRoot!,
                p,
                assetId,
                revision,
                linkedRehearsalAction(context, "recover", revision),
              ),
            ),
        });
      }
    } else {
      const approved = isApproved(p, revision);
      const hasFindings =
        feedback.some((f) => !f.resolved) ||
        context.acceptance?.verdict === "needs-revision" ||
        context.fit?.verdict === "model-defect";
      const wrap = (
        purpose: Parameters<typeof linkedRehearsalAction>[1],
        action: string,
      ) =>
        copyLinked(
          workPrompt(
            repo,
            dataRoot!,
            p,
            assetId,
            revision,
            `${linkedRehearsalAction(context, purpose)}\n\n${action}`,
          ),
        );
      const kind =
        revision.stage === "model" ? "developed model" : "3D prototype";
      if (revision.stage === "model" && (hasFindings || !context.candidate))
        actions.push({
          label: hasFindings
            ? "Copy developed model correction prompt"
            : "Copy developed model revision prompt",
          run: () => wrap("develop", correctionAction(p, revision)),
        });
      if (
        revision.stage === "model" &&
        approved &&
        context.candidate &&
        context.acceptance?.verdict !== "needs-revision" &&
        context.fit?.verdict !== "model-defect" &&
        modelFile
      )
        actions.push({
          label: "Copy rehearsal fit-check prompt",
          disabled: !rehearsalClips,
          run: () =>
            wrap(
              "fit",
              linkedFitIdentity(p, revision, modelFile.hash, rehearsalClips!),
            ),
        });
      if (revision.stage !== "sketch")
        actions.push({
          label: `Copy ${kind} review prompt`,
          run: () =>
            copyLinked(
              candidateReviewPrompt(
                repo,
                dataRoot!,
                p,
                revision,
                linkedRehearsalAction(context, "review"),
              ),
            ),
        });
      if (revision.stage === "study" && hasFindings)
        actions.unshift({
          label: "Copy 3D prototype correction prompt",
          run: () => wrap("concept", correctionAction(p, revision)),
        });
      if (canAdvance && approved)
        actions.unshift({
          label:
            revision.stage === "sketch"
              ? "Copy 3D prototype prompt"
              : "Copy developed model prompt",
          run: () =>
            wrap(
              revision.stage === "sketch" ? "concept" : "develop",
              revisionAction(p, revision, true),
            ),
        });
      if (revision.stage === "sketch" || revision.stage === "study")
        actions.push({
          label:
            revision.stage === "sketch"
              ? "Copy concept revision prompt"
              : "Copy revision prompt",
          run: () => wrap("concept", revisionAction(p, revision)),
        });
      if (concept && revision.id === concept.id)
        actions.push({
          label: "Copy detailed 2D concept prompt",
          run: () => wrap("concept", detailedConceptAction(p, concept)),
        });
      if (context.staleFit)
        linkMessage =
          "The rehearsal head changed. Run a new fit check before relying on the earlier result.";
    }
  }
  if (p && revision && !link) {
    const approved = isApproved(p, revision);
    const revise = {
      label:
        revision.stage === "sketch"
          ? "Copy concept revision prompt"
          : "Copy revision prompt",
      run: () => copy(revisionAction(p, revision)),
    };
    if (canAdvance && approved)
      actions.push({
        label:
          revision.stage === "sketch"
            ? "Copy 3D prototype prompt"
            : "Copy developed model prompt",
        run: () => copy(revisionAction(p, revision, true)),
      });
    if (revision.stage === "sketch" || mode === "animation")
      actions.push(revise);
    else {
      const kind =
        revision.stage === "study" ? "3D prototype" : "developed model";
      if (feedback.some((f) => !f.resolved))
        actions.push({
          label: `Copy ${kind} correction prompt`,
          run: () => copy(correctionAction(p, revision)),
        });
      if (modelFile)
        actions.push({
          label: `Copy ${kind} review prompt`,
          run: () =>
            copyText(candidateReviewPrompt(repo, dataRoot!, p, revision)),
        });
      actions.push(revise);
    }
    if (rehearsalUrl && modelFile)
      actions.push({
        label: "Copy Scene Rehearsal prompt",
        disabled: !rehearsalClips,
        run: () =>
          copyText(
            rehearsalPrompt(
              repo,
              dataRoot!,
              p,
              revision,
              modelFile.hash,
              rehearsalClips!,
            ),
          ),
      });
    if (concept && revision.id === concept.id)
      actions.push({
        label: "Copy detailed 2D concept prompt",
        run: () => copy(detailedConceptAction(p, concept)),
      });
  }
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
          <details className="project-actions">
            <summary>Project actions</summary>
            <button
              disabled={!dataRoot || Boolean(projectId && p?.id !== projectId)}
              onClick={() =>
                copyText(
                  workPrompt(
                    repo,
                    dataRoot!,
                    p,
                    undefined,
                    undefined,
                    p
                      ? "Create a separate asset in this project. Read the project brief and decisions, choose a useful concept if no direction is supplied, and publish only 2D Concept candidates. Preserve existing assets."
                      : "Create a project and publish its first 2D Concept candidate. Use any supplied direction; otherwise propose a project brief before publishing.",
                  ),
                )
              }
            >
              Copy new concept prompt
            </button>
          </details>
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
                        if (a.id === assetId) return;
                        setAssetId(a.id);
                        setRevisionId("[missing]");
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
                </motion.div>
                {revision && (
                  <div className="revision-actions">
                    <div>
                      <strong>{revision.id}</strong>
                      <p>
                        {stageName(revision.stage)} ·{" "}
                        {p && isApproved(p, revision)
                          ? "Accepted"
                          : "Candidate"}
                      </p>
                    </div>
                    {mode === "assets" && stage === "all" ? (
                      <button
                        className="primary"
                        onClick={() => {
                          setRevisionId(revision.id);
                          setStage(revision.stage);
                        }}
                      >
                        Open in {stageName(revision.stage)}
                      </button>
                    ) : (
                      actions.length > 0 && (
                        <div className="revision-action-controls">
                          <button
                            className="primary"
                            disabled={busy || !dataRoot || actions[0].disabled}
                            onClick={actions[0].run}
                          >
                            {actions[0].label}
                          </button>
                          {actions.length > 1 && (
                            <details key={viewKey}>
                              <summary>More actions</summary>
                              <div>
                                {actions.slice(1).map((action) => (
                                  <button
                                    key={action.label}
                                    disabled={
                                      busy || !dataRoot || action.disabled
                                    }
                                    onClick={action.run}
                                  >
                                    {action.label}
                                  </button>
                                ))}
                                {rehearsalUrl && dataRoot === "" && (
                                  <p>
                                    Could not locate the source library. Reload
                                    to retry.
                                  </p>
                                )}
                                {currentClipMetadata && !rehearsalClips && (
                                  <p>
                                    Could not read embedded clip names. Reload
                                    to retry.
                                  </p>
                                )}
                              </div>
                            </details>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}
                {link && stage !== "all" && (
                  <div className="rehearsal-context">
                    <p role="status">
                      {linkMessage ??
                        (context
                          ? `Rehearsal requirement ${context.requirement.name} · measured in ${context.measuredIn.revisionId}`
                          : "Loading rehearsal context…")}
                    </p>
                    {linkedSource &&
                      revision?.id !== linkedSource.revisionId &&
                      (!revision || offerLinkedRevision) &&
                      revisions.some(
                        (r) => r.id === linkedSource.revisionId,
                      ) && (
                        <button
                          onClick={() => {
                            const source = revisions.find(
                              (r) => r.id === linkedSource.revisionId,
                            )!;
                            setRevisionId(source.id);
                            setStage(source.stage);
                          }}
                        >
                          Open linked revision
                        </button>
                      )}
                    {currentClipMetadata && !rehearsalClips && (
                      <p>
                        Could not read embedded model clips. Reload to retry.
                      </p>
                    )}
                    <button onClick={() => refreshRehearsal((n) => n + 1)}>
                      Refresh rehearsal context
                    </button>
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
                          if (revision && (s === "all" || s === revision.stage))
                            return;
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
                          <>
                            <img
                              className="sketch"
                              src={`/api/projects/${p!.id}/revisions/${revision.id}/files/${shownImage?.id}`}
                              alt={
                                conceptImages.length > 1
                                  ? shownImage?.name
                                  : revision.summary
                              }
                            />
                            {conceptImages.length > 1 && (
                              <div className="concept-image-picker">
                                <StudioSelect
                                  label="Concept image"
                                  value={String(imageIndex)}
                                  options={conceptImages.map((f, index) => ({
                                    value: String(index),
                                    label: f.name,
                                  }))}
                                  onChange={(index) =>
                                    setView({
                                      key: viewKey,
                                      index: Number(index),
                                    })
                                  }
                                />
                              </div>
                            )}
                          </>
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
                    {revisionId && revisionId !== "[missing]" ? (
                      <p>
                        The selected revision is no longer available. Choose
                        another revision from the trail.
                      </p>
                    ) : (
                      <>
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
                      </>
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
                            if (mode === "assets") setStage(r.stage);
                          }}
                        >
                          {r.id === revision?.id && (
                            <Selection id="selected-revision" />
                          )}
                          <strong>{r.id}</strong>
                          <span>
                            {stageName(r.stage)} ·{" "}
                            {p && isApproved(p, r) ? "Accepted" : "Candidate"}
                          </span>
                          <span>{r.summary}</span>
                        </button>
                      ))}
                    </div>
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
                <div
                  className="feedback-list"
                  aria-label="Review findings and owner feedback"
                >
                  {feedback.map((f, i) => (
                    <article key={f.id}>
                      <span className="note-number">{i + 1}</span>
                      <div>
                        <p>{f.text}</p>
                        <small>
                          {f.origin === "agent-review"
                            ? "Review finding"
                            : "Owner feedback"}{" "}
                          · {f.resolved ? "Resolved" : "Open"}
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
              <p className="muted">
                When you settle a lasting project or asset choice, ask Codex to
                save it as a design decision. Keep defects in review findings
                and scene measurements in the linked fit requirements.
              </p>
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
              Prompt copied. Paste into Codex and send. Direction is optional.
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
