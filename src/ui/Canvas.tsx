import { Background, BackgroundVariant, MarkerType, Panel, ReactFlow, useReactFlow } from "@xyflow/react";
import { Maximize, Minus, Plus, Redo2, Sparkles, Undo2 } from "lucide-react";
import { useEffect, useMemo, type DragEvent } from "react";
import { validateFlow } from "../engine/run";
import type { BlockNode, FlowEdge } from "../flow/types";
import { useCurrentAgent, useStore } from "../state/store";
import { BlockCard, IssuesContext } from "./BlockCard";
import { DRAG_TYPE, findCatalogItem } from "./Palette";

const nodeTypes = { block: BlockCard };

function CanvasControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const canUndo = useStore((state) => state.undoStack.length > 0);
  const canRedo = useStore((state) => state.redoStack.length > 0);
  const { undo, redo } = useStore.getState();
  return (
    <Panel position="bottom-left" className="canvas-controls">
      <button aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Undo2 size={15} /></button>
      <button aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}><Redo2 size={15} /></button>
      <span className="canvas-controls-divider" />
      <button aria-label="Zoom out" onClick={() => zoomOut()}><Minus size={15} /></button>
      <button aria-label="Zoom in" onClick={() => zoomIn()}><Plus size={15} /></button>
      <button aria-label="Fit to screen" onClick={() => fitView({ padding: 0.2, maxZoom: 1, duration: 200 })}><Maximize size={15} /></button>
    </Panel>
  );
}

export function Canvas() {
  const agent = useCurrentAgent();
  const nodeStatus = useStore((state) => state.nodeStatus);
  const { onNodesChange, onEdgesChange, onConnect, isValidConnection, addBlock, selectNode, showToast } = useStore.getState();
  const { screenToFlowPosition, fitView } = useReactFlow();

  const flow = agent?.flow;

  // The canvas narrows when a side panel opens, so re-center to keep every block in view.
  const panelOpen = useStore((state) => state.panel !== null);
  useEffect(() => {
    const timer = setTimeout(() => void fitView({ padding: 0.2, maxZoom: 1, duration: 200 }), 220);
    return () => clearTimeout(timer);
  }, [panelOpen, fitView]);

  const issues = useMemo(() => {
    const byNode: Record<string, string> = {};
    if (flow) {
      for (const issue of validateFlow(flow)) {
        if (issue.nodeId && !byNode[issue.nodeId]) byNode[issue.nodeId] = issue.message;
      }
    }
    return byNode;
  }, [flow]);

  // Connections light up as data moves through them.
  const edges = useMemo<FlowEdge[]>(
    () =>
      (flow?.edges ?? []).map((edge) => {
        const from = nodeStatus[edge.source];
        const to = nodeStatus[edge.target];
        const className = from === "done" && to === "running" ? "edge-active" : from === "done" && to === "done" ? "edge-done" : "";
        return { ...edge, className, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 } };
      }),
    [flow?.edges, nodeStatus],
  );

  if (!flow) return null;

  const isEmpty = !flow.nodes.some((node) => node.data.kind !== "input" && node.data.kind !== "output");

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const item = findCatalogItem(event.dataTransfer.getData(DRAG_TYPE));
    const data = item?.create?.();
    if (data) addBlock(data, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  return (
    <IssuesContext.Provider value={issues}>
      <ReactFlow<BlockNode, FlowEdge>
        nodes={flow.nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onConnectEnd={(_, state) => {
          if (!state.isValid && state.toHandle) {
            showToast("Those two points can't connect. Documents and memory go into a model's left side.");
          }
        }}
        onNodeDragStart={() => useStore.getState().checkpoint()}
        onNodeClick={(_, node) => selectNode(node.id)}
        onPaneClick={() => selectNode(null)}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={onDrop}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.75}
        snapToGrid
        snapGrid={[10, 10]}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Lines} gap={28} color="var(--grid)" />
        <CanvasControls />
      </ReactFlow>
      {isEmpty && (
        <div className="empty-drop">
          <Sparkles size={18} />
          <strong>Add to agent</strong>
          <span>Pick a model, tool or memory from the list, or drag it here.</span>
        </div>
      )}
    </IssuesContext.Provider>
  );
}
