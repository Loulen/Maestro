// screens.jsx — Composes the Maestro app shell into 8 distinct screens.
//
// Each screen returns the full app frame (top bar, status bar, 3 panels)
// styled for one specific state. They sit inside DCArtboards in index.html.

const ART_W = 1440;
const ART_H = 900;

function Frame({ mode = 'run', children, daemon = 'connected', activeRuns = 3, awaiting = 1, breadcrumb, runId, banner, onToggleMode = () => {} }) {
  return (
    <div className={"app-frame maestro" + (mode === 'edit' ? ' edit-mode' : '')}>
      <TopBar mode={mode} onToggleMode={onToggleMode} breadcrumb={breadcrumb} runId={runId}/>
      {banner}
      <div className="shell">{children}</div>
      <StatusBar daemon={daemon} activeRuns={activeRuns} awaiting={awaiting}/>
    </div>
  );
}

// ─────────── Run-mode canvas with nodes / overlay ───────────

function RunCanvas({ blockedRun = false, awaitRun = false, runOverride, onSelectNode, selectedNodeId = 'impl', editingRun = false, onToggleEditRun, showAddPalette = false, startWhen = '4 m ago' }) {
  // shift all nodes right to make room for the start pseudo-node
  const NODE_OFFSET = 200;
  const baseNodes = FWR_NODES.map(n => ({ ...n, x: n.x + NODE_OFFSET }));
  const nodes = baseNodes.map(n => {
    if (blockedRun) {
      if (n.id === 'plan') return { ...n, status: 'done' };
      if (n.id === 'impl') return { ...n, status: 'failed', iter: '5/5' };
      if (n.id === 'review') return { ...n, status: 'blocked', iter: '5/5' };
      if (n.id === 'tests') return { ...n, status: 'pending' };
      if (n.id === 'merge') return { ...n, status: 'pending' };
    }
    if (awaitRun) {
      if (n.id === 'plan') return { ...n, status: 'done' };
      if (n.id === 'impl') return { ...n, status: 'awaiting_user', iter: '1/5', name: 'Implementer' };
      if (n.id === 'review') return { ...n, status: 'pending' };
    }
    return n;
  });
  const runningSet = new Set(nodes.filter(n => n.status === 'running' || n.status === 'done').map(n => n.id));
  // Start pseudo-node positioned to the left of the leftmost entry
  const startX = 30, startY = 215;
  const entryIds = ['plan'];
  // a fake source node so Edges can render start->entry edges using existing pipe
  const fakeStart = { id: '__start', x: startX - 56, y: startY - 35, status: 'running' };
  const fakeEdges = entryIds.map(t => ({ id: 'se-' + t, from: '__start', to: t }));
  return (
    <div className={"dag-canvas" + (editingRun ? ' run-edit' : '')}>
      <div className="dag-inner" style={{ transform: 'translate(20px, 0)' }}>
        <Edges nodes={[...nodes, fakeStart]} edges={[...FWR_EDGES, ...fakeEdges]} runningSet={new Set([...runningSet, '__start'])}/>
        <HaltIcons nodes={nodes} edges={FWR_EDGES}/>
        <StartNode x={startX} y={startY} when={startWhen} runIdSlug={runOverride.id.slice(-8)}
          selected={selectedNodeId === '__start'}
          onSelect={onSelectNode}
          downstreamRunning/>
        {nodes.map(n => (
          <Node key={n.id} node={n} selected={n.id === selectedNodeId}
            onSelect={onSelectNode}/>
        ))}
        <EdgeLabels nodes={nodes} edges={FWR_EDGES}/>
      </div>
      {showAddPalette && <AddPalette/>}
      <RunOverlay run={runOverride} blocked={blockedRun}
        editingRun={editingRun} onToggleEditRun={onToggleEditRun}/>
      <MiniMap nodes={nodes}/>
      <CanvasControls/>
    </div>
  );
}

// ────── Edit-mode canvas: same DAG but pending statuses + tabs ──────

function EditCanvas({ selectedNodeId = 'impl', selectedEdgeId = null, onSelectNode = () => {} }) {
  const NODE_OFFSET = 200;
  const nodes = FWR_NODES.map(n => ({ ...n, x: n.x + NODE_OFFSET, status: 'pending', iter: undefined }));
  const runningSet = new Set();
  const startX = 30, startY = 215;
  const endX = 1100, endY = 215;
  const fakeStart = { id: '__start', x: startX - 56, y: startY - 35, status: 'pending' };
  const fakeEnd = { id: '__end', x: endX, y: endY - 35, status: 'pending' };
  const startEdges = [{ id: 'se-plan', from: '__start', to: 'plan' }];
  const endEdges = [{ id: 'ee-merge', from: 'merge', to: '__end' }];
  return (
    <div className="dag-canvas">
      <div className="dag-inner" style={{ transform: 'translate(20px, 0)' }}>
        <Edges nodes={[...nodes, fakeStart, fakeEnd]} edges={[...FWR_EDGES, ...startEdges, ...endEdges]} runningSet={runningSet}/>
        <HaltIcons nodes={nodes} edges={FWR_EDGES}/>
        <StartNode x={startX} y={startY} when="—" runIdSlug="(no run)" selected={selectedNodeId === '__start'} onSelect={onSelectNode}/>
        <EndNode x={endX} y={endY} reached={false} selected={selectedNodeId === '__end'} onSelect={onSelectNode}/>
        {nodes.map(n => (
          <Node key={n.id} node={n} selected={n.id === selectedNodeId} onSelect={onSelectNode}/>
        ))}
        <EdgeLabels nodes={nodes} edges={FWR_EDGES}/>
        {selectedEdgeId && (() => {
          // highlight a selected edge with a glow rect at its midpoint
          const e = FWR_EDGES.find(x => x.id === selectedEdgeId);
          if (!e) return null;
          const a = nodes.find(n => n.id === e.from), b = nodes.find(n => n.id === e.to);
          if (!a || !b) return null;
          const mid = { x: (a.x + 200 + b.x) / 2 - 70, y: (a.y + b.y) / 2 + 30 };
          return (
            <div style={{
              position: 'absolute', left: mid.x, top: mid.y,
              padding: '4px 10px', borderRadius: 6,
              border: '1px solid var(--acc)', background: 'rgba(16,185,129,0.10)',
              color: 'var(--acc)', fontSize: 10.5, fontFamily: 'var(--font-mono)',
              pointerEvents: 'none'
            }}>edge selected</div>
          );
        })()}
      </div>
      <AddPalette/>
      <MiniMap nodes={nodes}/>
      <CanvasControls/>
    </div>
  );
}

// ─────────── 1. Run mode default — feature-with-review running ───────────

function Screen1({ onToggleMode, modal, setModal, light = false }) {
  const [sel, setSel] = React.useState('__start');
  const [mdOpen, setMdOpen] = React.useState(false);
  const run = RUNS[0];
  const rightTitle = sel === '__start' ? 'Run start' :
                     sel === 'impl' ? 'Implementer' :
                     (FWR_NODES.find(n => n.id === sel) || {}).name || 'Node';
  return (
    <div className="artboard-host" style={light ? lightVars() : null}>
      <Frame mode="run" breadcrumb="feature-with-review" runId={run.id.slice(-8)} onToggleMode={onToggleMode}>
        <div className="panel panel-l">
          <RunsListPanel runs={RUNS} selectedId={run.id} onSelect={() => {}} onNewRun={() => setModal && setModal(true)}/>
        </div>
        <div className="panel panel-c">
          <RunCanvas runOverride={run} selectedNodeId={sel} onSelectNode={setSel}/>
        </div>
        <div className="panel panel-r">
          <PanelHead title={rightTitle}/>
          {sel === '__start'
            ? <StartInspector run={run} onOpenAsMarkdown={() => setMdOpen(true)}/>
            : <NodeDetail node={FWR_NODES.find(n => n.id === sel) || FWR_NODES[1]}/>}
        </div>
      </Frame>
      <NewRunModal open={modal} onClose={() => setModal && setModal(false)}/>
      <MdVerdictModal open={mdOpen} onClose={() => setMdOpen(false)}/>
    </div>
  );
}

// ─────────── 2. Run blocked / halted ───────────

function Screen2({ onToggleMode }) {
  const run = { ...RUNS[2], elapsed: '32:05', iter: 5 };
  return (
    <div className="artboard-host">
      <Frame mode="run" breadcrumb="bug-triage" runId={run.id.slice(-8)} onToggleMode={onToggleMode} awaiting={0}>
        <div className="panel panel-l">
          <RunsListPanel runs={RUNS} selectedId={run.id} onSelect={() => {}}/>
        </div>
        <div className="panel panel-c">
          <RunCanvas blockedRun runOverride={run} selectedNodeId="review" startWhen="2 h ago"/>
        </div>
        <div className="panel panel-r">
          <PanelHead title="Reviewer"/>
          <NodeDetail node={{ ...FWR_NODES[2], status: 'blocked', iter: '5/5' }}/>
        </div>
      </Frame>
    </div>
  );
}

// ─────────── 3. Awaiting user ───────────

function Screen3({ onToggleMode }) {
  const run = { ...RUNS[1] };
  return (
    <div className="artboard-host">
      <Frame mode="run" breadcrumb="feature-with-review" runId={run.id.slice(-8)} onToggleMode={onToggleMode}>
        <div className="panel panel-l">
          <RunsListPanel runs={RUNS} selectedId={run.id} onSelect={() => {}}/>
        </div>
        <div className="panel panel-c">
          <RunCanvas awaitRun runOverride={run} selectedNodeId="impl" startWhen="23 m ago"/>
        </div>
        <div className="panel panel-r">
          <PanelHead title="Implementer"/>
          <NodeDetail node={{ ...FWR_NODES[1], status: 'awaiting_user', iter: '1/5' }} awaiting/>
        </div>
      </Frame>
    </div>
  );
}

// ─────────── 4. Edit mode — pipeline open, node selected ───────────

function Screen4({ onToggleMode }) {
  const [tabs, setTabs] = React.useState([
    { id: 'feature-with-review', dirty: false },
    { id: 'bug-triage', dirty: true },
  ]);
  const [active, setActive] = React.useState('feature-with-review');
  return (
    <div className="artboard-host">
      <Frame mode="edit" breadcrumb={`${active}.yaml`} onToggleMode={onToggleMode}>
        <div className="panel panel-l">
          <PipelinesListPanel pipelines={PIPELINES} selectedId={active} onSelect={setActive}/>
        </div>
        <div className="panel panel-c">
          <TabBar tabs={tabs} activeId={active} onSelect={setActive}/>
          <div style={{position: 'relative', flex: 1}}>
            <EditCanvas selectedNodeId="impl"/>
          </div>
        </div>
        <div className="panel panel-r">
          <PanelHead title="Inspector"/>
          <NodeInspectorEdit node={FWR_NODES[1]}/>
        </div>
      </Frame>
    </div>
  );
}

// ─────────── 5. Edit mode — edge selected, condition builder ───────────

function Screen5({ onToggleMode }) {
  return (
    <div className="artboard-host">
      <Frame mode="edit" breadcrumb="feature-with-review.yaml" onToggleMode={onToggleMode}>
        <div className="panel panel-l">
          <PipelinesListPanel pipelines={PIPELINES} selectedId="feature-with-review" onSelect={()=>{}}/>
        </div>
        <div className="panel panel-c">
          <TabBar tabs={[{id:'feature-with-review', dirty:false}]} activeId="feature-with-review" onSelect={()=>{}}/>
          <div style={{position: 'relative', flex: 1}}>
            <EditCanvas selectedNodeId={null} selectedEdgeId="e3"/>
          </div>
        </div>
        <div className="panel panel-r">
          <PanelHead title="Edge"/>
          <EdgeInspector/>
        </div>
      </Frame>
    </div>
  );
}

// ─────────── 6. Edit mode — pipeline-level inspector (nothing selected) ───────────

function Screen6({ onToggleMode }) {
  return (
    <div className="artboard-host">
      <Frame mode="edit" breadcrumb="feature-with-review.yaml" onToggleMode={onToggleMode}>
        <div className="panel panel-l">
          <PipelinesListPanel pipelines={PIPELINES} selectedId="feature-with-review" onSelect={()=>{}}/>
        </div>
        <div className="panel panel-c">
          <TabBar tabs={[{id:'feature-with-review', dirty:false}]} activeId="feature-with-review" onSelect={()=>{}}/>
          <div style={{position: 'relative', flex: 1}}>
            <EditCanvas selectedNodeId={null}/>
          </div>
        </div>
        <div className="panel panel-r">
          <PanelHead title="Pipeline"/>
          <PipelineInspector/>
        </div>
      </Frame>
    </div>
  );
}

// ─────────── 7. New Run modal ───────────

function Screen7({ onToggleMode }) {
  const run = RUNS[0];
  return (
    <div className="artboard-host">
      <Frame mode="run" breadcrumb="feature-with-review" runId={run.id.slice(-8)} onToggleMode={onToggleMode}>
        <div className="panel panel-l">
          <RunsListPanel runs={RUNS} selectedId={run.id} onSelect={()=>{}}/>
        </div>
        <div className="panel panel-c">
          <RunCanvas runOverride={run} selectedNodeId="impl"/>
        </div>
        <div className="panel panel-r">
          <PanelHead title="Implementer"/>
          <NodeDetail node={FWR_NODES[1]}/>
        </div>
      </Frame>
      <NewRunModal open={true} onClose={() => {}}/>
    </div>
  );
}

// ─────────── 8. Empty state — first launch ───────────

function Screen8({ onToggleMode }) {
  return (
    <div className="artboard-host">
      <Frame mode="run" breadcrumb="No run selected" onToggleMode={onToggleMode} activeRuns={0} awaiting={0} daemon="connected">
        <div className="panel panel-l">
          <PanelHead title="Runs" count={0}
            actions={<button className="btn primary sm"><Ic.PlusSm/> New Run</button>}/>
          <div className="p-body" style={{display: 'flex'}}>
            <EmptyRuns/>
          </div>
        </div>
        <div className="panel panel-c">
          <div className="dag-canvas">
            <div className="empty">
              <div className="emp-art"><Ic.Grid/></div>
              <div className="emp-title">No run selected</div>
              <div className="emp-sub">Launch a run to see its DAG. The graph will live-update as agents progress.</div>
            </div>
          </div>
        </div>
        <div className="panel panel-r">
          <PanelHead title="Detail"/>
          <div className="p-body">
            <div className="empty">
              <div className="emp-art"><Ic.Code/></div>
              <div className="emp-sub" style={{maxWidth: 240}}>Select a node in the canvas to see its terminal preview, inputs and outputs.</div>
            </div>
          </div>
        </div>
      </Frame>
    </div>
  );
}

function lightVars() {
  // not used in current spec (light_mode = no), but kept for future
  return {};
}

window.Screen1 = Screen1;
window.Screen2 = Screen2;
window.Screen3 = Screen3;
window.Screen4 = Screen4;
window.Screen5 = Screen5;
window.Screen6 = Screen6;
window.Screen7 = Screen7;
window.Screen8 = Screen8;

// ─────────── 9. Markdown modal — verdict (single file) ───────────
function Screen9() {
  const run = RUNS[0];
  return (
    <div className="artboard-host">
      <Frame mode="run" breadcrumb="feature-with-review" runId={run.id.slice(-8)}>
        <div className="panel panel-l">
          <RunsListPanel runs={RUNS} selectedId={run.id} onSelect={() => {}}/>
        </div>
        <div className="panel panel-c">
          <RunCanvas runOverride={run} selectedNodeId="review"/>
        </div>
        <div className="panel panel-r">
          <PanelHead title="Reviewer"/>
          <NodeDetail node={FWR_NODES[2]}/>
        </div>
      </Frame>
      <MdVerdictModal open={true} onClose={() => {}}/>
    </div>
  );
}

// ─────────── 9b. Markdown modal — repeated port w/ navigator ───────────
function Screen9b() {
  const run = RUNS[0];
  return (
    <div className="artboard-host">
      <Frame mode="run" breadcrumb="feature-with-review" runId={run.id.slice(-8)}>
        <div className="panel panel-l">
          <RunsListPanel runs={RUNS} selectedId={run.id} onSelect={() => {}}/>
        </div>
        <div className="panel panel-c">
          <RunCanvas runOverride={run} selectedNodeId="impl"/>
        </div>
        <div className="panel panel-r">
          <PanelHead title="Implementer"/>
          <NodeDetail node={FWR_NODES[1]}/>
        </div>
      </Frame>
      <MdFeedbackModal open={true} onClose={() => {}}/>
    </div>
  );
}

// ─────────── 10. Edit-this-run active state ───────────
function Screen10() {
  const run = RUNS[0];
  return (
    <div className="artboard-host">
      <Frame mode="run" breadcrumb="feature-with-review" runId={run.id.slice(-8)}>
        <div className="panel panel-l">
          <RunsListPanel runs={RUNS} selectedId={run.id} onSelect={() => {}}/>
        </div>
        <div className="panel panel-c">
          <RunCanvas runOverride={run} selectedNodeId="impl" editingRun showAddPalette/>
        </div>
        <div className="panel panel-r">
          <PanelHead title="Inspector"/>
          <NodeInspectorEdit node={FWR_NODES[1]}/>
        </div>
      </Frame>
    </div>
  );
}

// ─────────── 12. Run with failed node + validation error ───────────
function Screen12() {
  const run = { ...RUNS[5], status: 'failed', elapsed: '03:18' };
  const failedNode = { ...FWR_NODES[1], status: 'failed', iter: '3/5',
    failure_reason: 'Tool call exited 1: command not found `pnpm test`. Worker has stopped.',
    validationFail: true,
    scrolledUp: true };
  return (
    <div className="artboard-host">
      <Frame mode="run" breadcrumb="security-audit" runId={run.id.slice(-8)}>
        <div className="panel panel-l">
          <RunsListPanel runs={RUNS} selectedId={run.id} onSelect={() => {}}/>
        </div>
        <div className="panel panel-c">
          <RunCanvas runOverride={run} selectedNodeId="impl"/>
        </div>
        <div className="panel panel-r">
          <PanelHead title="Implementer"/>
          <NodeDetail node={failedNode} failed/>
        </div>
      </Frame>
    </div>
  );
}

window.Screen9 = Screen9;
window.Screen9b = Screen9b;
window.Screen10 = Screen10;
window.Screen12 = Screen12;
window.ART_W = ART_W;
window.ART_H = ART_H;
