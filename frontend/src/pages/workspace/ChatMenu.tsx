import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type IsValidConnection,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertCircle, Loader2, Plus, RotateCcw, Save, TriangleAlert, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchChatFlow, resetChatFlow, saveChatFlow } from '@/store/chatFlow/chatFlowThunks';
import { useThemeMode } from '@/hooks/useThemeMode';
import { BOX_TYPE_ORDER, BOX_TYPES, MAX_BOXES } from '@/constants/chatFlow';
import { newBox, toSavePayload, validateFlow } from '@/utils/chatFlow';
import { BoxNode } from '@/components/chatFlow/BoxNode';
import { BOX_ICONS, FlowCanvasContext, type BoxNodeType } from '@/components/chatFlow/flowCanvas';
import { BoxEditor } from '@/components/chatFlow/BoxEditor';
import type { ChatFlowDocument, ChatFlowResponse, FlowBox, FlowBoxType } from '@/types/chatFlowTypes';

const nodeTypes = { box: BoxNode };
const BOX_WIDTH = 256;

function toNode(box: FlowBox): BoxNodeType {
  return { id: box.id, type: 'box', position: box.position, data: { box } };
}

// Options and answers pointing at deleted boxes lose their link (shown as "no next step" until picked again)
function unlink(nodes: BoxNodeType[], removed: Set<string>): BoxNodeType[] {
  if (removed.size === 0) return nodes;
  return nodes.map((node) => {
    const box = node.data.box;
    if (box.type === 'question' && box.options.some((o) => o.next && removed.has(o.next))) {
      return { ...node, data: { box: { ...box, options: box.options.map((o) => (o.next && removed.has(o.next) ? { ...o, next: null } : o)) } } };
    }
    if (box.type === 'answer' && box.next && removed.has(box.next)) {
      return { ...node, data: { box: { ...box, next: null } } };
    }
    return node;
  });
}

export function ChatMenu() {
  return (
    <ReactFlowProvider>
      <ChatMenuEditor />
    </ReactFlowProvider>
  );
}

function ChatMenuEditor() {
  const dispatch = useAppDispatch();
  const orgName = useAppSelector((state) => state.workspace.user?.organization_name) || 'us';
  const [themeMode] = useThemeMode();
  const { screenToFlowPosition, fitView, setCenter } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [nodes, setNodes] = useState<BoxNodeType[]>([]);
  const [startId, setStartId] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [ordersEnabled, setOrdersEnabled] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const apply = useCallback((response: ChatFlowResponse) => {
    setNodes(response.flow.nodes.map(toNode));
    setStartId(response.flow.start);
    setIsDefault(response.is_default);
    setOrdersEnabled(response.orders_enabled);
    setSelectedId(null);
    setSelectedEdgeId(null);
    setDirty(false);
    setLoaded(true);
  }, []);

  const load = useCallback(
    () =>
      dispatch(fetchChatFlow()).then((result) => {
        if (fetchChatFlow.fulfilled.match(result)) apply(result.payload);
        else setLoadError(result.payload as string);
      }),
    [dispatch, apply]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Leaving or reloading the tab with unsaved changes asks first
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // The menu as it would be saved, and what's wrong with it
  const flow = useMemo<ChatFlowDocument>(() => ({ start: startId, nodes: nodes.map((node) => ({ ...node.data.box, position: node.position })) }), [nodes, startId]);
  const boxes = useMemo(() => new Map(flow.nodes.map((box) => [box.id, box])), [flow]);
  const issues = useMemo(() => validateFlow(flow), [flow]);
  const issueBoxIds = useMemo(() => new Set(issues.map((issue) => issue.boxId).filter((id): id is string => !!id)), [issues]);
  const latestFlow = useRef(flow);
  useEffect(() => {
    latestFlow.current = flow;
  }, [flow]);

  // One arrow per linked option, and one from an answer to its next question
  const edges = useMemo<Edge[]>(() => {
    const result: Edge[] = [];
    const arrow = (id: string, source: string, sourceHandle: string, target: string, hidden: boolean): Edge => ({
      id,
      source,
      sourceHandle,
      target,
      type: 'smoothstep',
      selected: id === selectedEdgeId,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      style: hidden ? { strokeDasharray: '6 4', opacity: 0.5 } : undefined,
    });
    for (const box of flow.nodes) {
      if (box.type === 'question') {
        for (const option of box.options) {
          const target = option.next ? boxes.get(option.next) : undefined;
          if (target) result.push(arrow(`${box.id}:${option.id}`, box.id, option.id, target.id, target.type === 'order' && !ordersEnabled));
        }
      }
      if (box.type === 'answer' && box.next && boxes.has(box.next)) result.push(arrow(`${box.id}:next`, box.id, 'next', box.next, false));
    }
    return result;
  }, [flow, boxes, ordersEnabled, selectedEdgeId]);

  const updateBox = useCallback((id: string, change: (box: FlowBox) => FlowBox) => {
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, data: { box: change(node.data.box) } } : node)));
    setDirty(true);
  }, []);

  const removeBoxes = useCallback((ids: Set<string>) => {
    setNodes((current) => unlink(current.filter((node) => !ids.has(node.id)), ids));
    setSelectedId((current) => (current && ids.has(current) ? null : current));
    setDirty(true);
  }, []);

  const addBox = useCallback((type: FlowBoxType, position: { x: number; y: number }) => {
    const box = newBox(type, position);
    setNodes((current) => [...current, toNode(box)]);
    setDirty(true);
    return box.id;
  }, []);

  // Toolbar "Add": in the middle of what's on screen, nudged so new boxes don't stack exactly
  const addBoxInView = (type: FlowBoxType) => {
    setAddOpen(false);
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = rect ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 0, y: 0 };
    const nudge = (nodes.length % 5) * 24;
    setSelectedId(addBox(type, { x: center.x - BOX_WIDTH / 2 + nudge, y: center.y - 60 + nudge }));
  };

  // Picked "New: …" in the panel: the new box goes to the right of the one being edited
  const createBoxFrom = useCallback((type: FlowBoxType, from: FlowBox) => addBox(type, { x: from.position.x + BOX_WIDTH + 100, y: from.position.y + (nodes.length % 4) * 50 }), [addBox, nodes.length]);

  // The start question can't be deleted (pick another start first); React Flow then keeps its arrows too
  const canvasNodes = useMemo(() => nodes.map((node) => (node.id === startId ? { ...node, deletable: false } : node)), [nodes, startId]);

  const onNodesChange = useCallback((changes: NodeChange<BoxNodeType>[]) => {
    const removed = new Set(changes.flatMap((change) => (change.type === 'remove' ? [change.id] : [])));
    if (changes.some((change) => change.type === 'remove' || (change.type === 'position' && change.position))) setDirty(true);
    setNodes((current) => unlink(applyNodeChanges(changes, current), removed));
    if (removed.size) setSelectedId((current) => (current && removed.has(current) ? null : current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const change of changes) {
      if (change.type === 'select') setSelectedEdgeId(change.selected ? change.id : null);
      if (change.type === 'remove') {
        // "box:option" or "box:next": clear that link
        const [boxId, handle] = change.id.split(':');
        updateBox(boxId, (box) => {
          if (box.type === 'question') return { ...box, options: box.options.map((o) => (o.id === handle ? { ...o, next: null } : o)) };
          if (box.type === 'answer') return { ...box, next: null };
          return box;
        });
      }
    }
  }, [updateBox]);

  // Dragging from an option's dot (or an answer's) to a box links them; a new link replaces the old one
  const onConnect = useCallback((connection: Connection) => {
    const { source, sourceHandle, target } = connection;
    updateBox(source, (box) => {
      if (box.type === 'question') return { ...box, options: box.options.map((o) => (o.id === sourceHandle ? { ...o, next: target } : o)) };
      if (box.type === 'answer') return { ...box, next: target };
      return box;
    });
  }, [updateBox]);

  const isValidConnection = useCallback<IsValidConnection>((connection) => {
    if (connection.source === connection.target) return false;
    const source = boxes.get(connection.source);
    return source?.type !== 'answer' || boxes.get(connection.target)?.type === 'question';
  }, [boxes]);

  const showBox = (id: string) => {
    setSelectedId(id);
    const box = boxes.get(id);
    if (box) setCenter(box.position.x + BOX_WIDTH / 2, box.position.y + 80, { zoom: 1, duration: 300 });
  };

  const save = async () => {
    const saved = flow;
    setSaving(true);
    const result = await dispatch(saveChatFlow(toSavePayload(saved))); // Success / failure toasts (errorToastMiddleware)
    setSaving(false);
    if (saveChatFlow.fulfilled.match(result)) {
      setIsDefault(false);
      // Edits made while saving are still unsaved
      if (latestFlow.current === saved) setDirty(false);
    }
  };

  const reset = async () => {
    setResetting(true);
    const result = await dispatch(resetChatFlow());
    setResetting(false);
    if (resetChatFlow.fulfilled.match(result)) {
      setConfirmReset(false);
      apply(result.payload);
      window.setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
    }
  };

  const retry = () => {
    setLoadError(null);
    load();
  };

  if (loadError && !loaded) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-error-container/20 border border-error/30 text-sm text-error">
        <span className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {loadError}
        </span>
        <button type="button" onClick={retry} className="text-xs font-medium underline cursor-pointer">
          Retry
        </button>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-12 rounded-xl bg-surface-container animate-pulse" />
        <div className="h-[60vh] rounded-2xl bg-surface-container animate-pulse" />
      </div>
    );
  }

  const selectedBox = selectedId ? boxes.get(selectedId) : undefined;
  const firstIssue = issues[0];

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 h-[calc(100dvh-4rem)] flex flex-col bg-surface">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-outline-variant/40 bg-surface-container-low">
        <div className="relative">
          <button
            type="button"
            onClick={() => setAddOpen((open) => !open)}
            disabled={nodes.length >= MAX_BOXES}
            aria-expanded={addOpen}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/15 disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add box
          </button>
          {addOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setAddOpen(false)} />
              <ul className="absolute left-0 top-full mt-1 z-30 w-72 rounded-xl border border-outline-variant/50 bg-surface-container-lowest shadow-xl py-1">
                {BOX_TYPE_ORDER.map((type) => {
                  const Icon = BOX_ICONS[type];
                  return (
                    <li key={type}>
                      <button type="button" onClick={() => addBoxInView(type)} className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-surface-container cursor-pointer">
                        <Icon className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                        <span>
                          <span className="block text-sm font-medium text-on-surface">{BOX_TYPES[type].label}</span>
                          <span className="block text-xs text-on-surface-variant">{BOX_TYPES[type].description}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        {isDefault && !dirty && (
          <span className="px-2 py-1 rounded-full bg-surface-container text-xs text-on-surface-variant">Default menu: save to use your own</span>
        )}
        <p className="hidden lg:block text-xs text-on-surface-variant">Drag from an option's dot to a box to link them. Anything a customer types is answered by the AI.</p>

        <div className="ml-auto flex items-center gap-2">
          {firstIssue && (
            <button
              type="button"
              onClick={() => (firstIssue.boxId ? showBox(firstIssue.boxId) : undefined)}
              title={firstIssue.message}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-error bg-error/10 hover:bg-error/15 cursor-pointer"
            >
              <TriangleAlert className="w-3.5 h-3.5" />
              {issues.length === 1 ? '1 thing to fix' : `${issues.length} things to fix`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            disabled={isDefault && !dirty}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-on-surface hover:bg-surface-container disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" /> <span className="hidden sm:inline">Reset</span>
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving || issues.length > 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save menu'}
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 flex">
        <div ref={canvasRef} className="flex-1 min-w-0">
          <FlowCanvasContext.Provider value={{ startId, ordersEnabled, issueBoxIds }}>
            <ReactFlow
              nodes={canvasNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              onPaneClick={() => {
                setSelectedId(null);
                setSelectedEdgeId(null);
              }}
              deleteKeyCode={['Backspace', 'Delete']}
              colorMode={themeMode}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={1.5}
            >
              <Background gap={20} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </FlowCanvasContext.Provider>
        </div>

        {/* Editing panel: beside the canvas on wide screens, over it on phones */}
        {selectedBox && (
          <aside className="absolute inset-0 z-10 bg-surface-container-lowest md:static md:inset-auto md:w-96 md:shrink-0 md:border-l md:border-outline-variant/40">
            <BoxEditor
              key={selectedBox.id}
              box={selectedBox}
              boxes={boxes}
              isStart={selectedBox.id === startId}
              ordersEnabled={ordersEnabled}
              orgName={orgName}
              issues={issues.filter((issue) => issue.boxId === selectedBox.id)}
              onChange={(box) => updateBox(box.id, () => box)}
              onCreateBox={createBoxFrom}
              onSetStart={() => {
                setStartId(selectedBox.id);
                setDirty(true);
              }}
              onDelete={() => removeBoxes(new Set([selectedBox.id]))}
              onClose={() => setSelectedId(null)}
            />
          </aside>
        )}
      </div>

      {confirmReset && (
        <div role="dialog" aria-modal="true" aria-label="Reset the chat menu" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !resetting && setConfirmReset(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-surface-container-low border border-outline-variant/40 shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/30">
              <h2 className="text-sm font-semibold text-on-surface">Reset the chat menu?</h2>
              <button type="button" onClick={() => setConfirmReset(false)} disabled={resetting} aria-label="Close" className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="p-5 text-sm text-on-surface-variant">
              Your menu is deleted and customers get the default one again: "Place an order", "Report a problem" and "Something else". This can't be undone.
            </p>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant/30">
              <button type="button" onClick={() => setConfirmReset(false)} disabled={resetting} className="px-4 py-2 rounded-xl text-sm text-on-surface hover:bg-surface-container cursor-pointer">
                Back
              </button>
              <button type="button" onClick={reset} disabled={resetting} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-error text-on-error text-sm font-medium hover:bg-error/90 disabled:opacity-50 cursor-pointer">
                {resetting && <Loader2 className="w-4 h-4 animate-spin" />} Reset menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
