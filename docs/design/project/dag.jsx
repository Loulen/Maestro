// dag.jsx — DAG canvas: nodes, edges, halt icons, run overlay

function statusBorder(s) {
  return ({
    running: 'var(--st-running)', done: 'var(--st-done)', blocked: 'var(--st-blocked)',
    awaiting_user: 'var(--st-await)', failed: 'var(--st-failed)', pending: 'var(--st-pending)',
  })[s] || 'var(--st-pending)';
}

function Node({ node, selected, onSelect }) {
  const { id, name, type, status, x, y, iter } = node;
  return (
    <div className={"node " + status + (selected ? " selected" : "")}
         style={{ left: x, top: y }}
         onClick={(e) => { e.stopPropagation(); onSelect && onSelect(id); }}>
      <div className="node-head">
        <span className={"st-dot " + status} />
        <span className="node-name">{name}</span>
        {iter && <span className="node-iter mono">iter {iter}</span>}
      </div>
      <div className="node-meta">
        <span className={"badge " + (type === 'code' ? 'code' : 'doc')}>
          {type === 'code' ? <Ic.Code/> : <Ic.Doc/>}
          {type === 'code' ? 'code' : 'doc'}
        </span>
        <span className="node-status mono">
          {status === 'running' ? '· active' :
           status === 'done' ? '· complete' :
           status === 'blocked' ? '· blocked' :
           status === 'awaiting_user' ? '· awaiting' :
           status === 'failed' ? '· failed' : '· pending'}
        </span>
      </div>
      <span className="node-handle in" style={{ top: 28 }} />
      <span className={"node-handle out" + (status === 'running' || status === 'done' ? ' active' : '')} style={{ top: 28 }} />
    </div>
  );
}

// Build a smooth bezier between two node ports.
function edgePath(fromNode, toX, toY, NODE_W = 200, NODE_H = 70) {
  const sx = fromNode.x + NODE_W;
  const sy = fromNode.y + NODE_H / 2;
  const tx = toX, ty = toY;
  const dx = Math.max(40, Math.abs(tx - sx) * 0.5);
  const c1x = sx + dx, c1y = sy;
  const c2x = tx - dx, c2y = ty;
  return { d: `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`, mid: { x: (sx + tx) / 2, y: (sy + ty) / 2 } };
}

function backEdgePath(fromNode, toNode, NODE_W = 200, NODE_H = 70) {
  // route a back-edge under the source through to target's left handle
  const sx = fromNode.x + NODE_W;
  const sy = fromNode.y + NODE_H / 2;
  const tx = toNode.x;
  const ty = toNode.y + NODE_H / 2;
  const drop = sy + 80;
  return {
    d: `M ${sx} ${sy} C ${sx + 40} ${sy}, ${sx + 60} ${drop}, ${sx - 20} ${drop} L ${tx - 30} ${drop} C ${tx - 60} ${drop}, ${tx - 40} ${ty}, ${tx} ${ty}`,
    mid: { x: (sx + tx) / 2 + 10, y: drop }
  };
}

function Edges({ nodes, edges, runningSet, halts }) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const NODE_W = 200, NODE_H = 70;

  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <defs>
        <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="#525a68"/>
        </marker>
        <marker id="arr-active" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="#10b981"/>
        </marker>
        <marker id="arr-warn" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="#f59e0b"/>
        </marker>
      </defs>
      {edges.filter(e => e.to !== 'halt').map(e => {
        const a = byId[e.from], b = byId[e.to];
        if (!a || !b) return null;
        const isBack = a.x > b.x;
        const tx = b.x, ty = b.y + NODE_H / 2;
        const { d } = isBack ? backEdgePath(a, b) : edgePath(a, tx, ty);
        const active = runningSet.has(e.from) && (b.status === 'running' || b.status === 'pending');
        const cond = e.cond;
        return (
          <path key={e.id} d={d}
            stroke={cond ? "#f59e0b88" : (active ? "#10b981" : "#3a414c")}
            strokeWidth="1.5"
            strokeDasharray={cond ? "4 4" : "none"}
            fill="none"
            markerEnd={cond ? "url(#arr-warn)" : (active ? "url(#arr-active)" : "url(#arr)")} />
        );
      })}
    </svg>
  );
}

function EdgeLabels({ nodes, edges }) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const NODE_W = 200, NODE_H = 70;
  return (
    <>
      {edges.filter(e => e.cond && e.to !== 'halt').map(e => {
        const a = byId[e.from], b = byId[e.to];
        if (!a || !b) return null;
        const isBack = a.x > b.x;
        const { mid } = isBack ? backEdgePath(a, b) : edgePath(a, b.x, b.y + NODE_H / 2);
        return (
          <div key={e.id} className="edge-label cond" style={{ left: mid.x - 60, top: mid.y - 12 }}>
            when: {e.cond}
          </div>
        );
      })}
    </>
  );
}

function HaltIcons({ nodes, edges }) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const NODE_W = 200, NODE_H = 70;
  return (
    <>
      {edges.filter(e => e.to === 'halt').map(e => {
        const a = byId[e.from];
        if (!a) return null;
        const sx = a.x + NODE_W, sy = a.y + NODE_H / 2;
        const hx = sx + 60, hy = sy + 80;
        const d = `M ${sx} ${sy} C ${sx + 30} ${sy}, ${hx - 20} ${hy}, ${hx} ${hy}`;
        return (
          <React.Fragment key={e.id}>
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <path d={d} stroke="#f97316" strokeWidth="1.5" strokeDasharray="4 4" fill="none"/>
            </svg>
            <div className="halt-icon" style={{ left: hx - 14, top: hy - 14 }}>
              ◌
            </div>
            <div className="edge-label cond" style={{ left: hx - 70, top: hy - 32, color: '#fdba74', borderColor: 'rgba(249,115,22,0.32)', background: 'rgba(249,115,22,0.10)' }}>
              halt: {e.cond}
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
}

function MiniMap({ nodes, halts = [] }) {
  const W = 180, H = 110;
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const minX = Math.min(...xs) - 40, maxX = Math.max(...xs) + 240;
  const minY = Math.min(...ys) - 40, maxY = Math.max(...ys) + 110;
  const sx = (W - 12) / (maxX - minX), sy = (H - 12) / (maxY - minY);
  const s = Math.min(sx, sy);
  return (
    <div className="minimap">
      <svg width={W} height={H}>
        {nodes.map(n => (
          <rect key={n.id}
            x={6 + (n.x - minX) * s}
            y={6 + (n.y - minY) * s}
            width={200 * s}
            height={70 * s}
            rx="2"
            fill={statusBorder(n.status)}
            opacity={n.status === 'pending' ? 0.4 : 0.85}/>
        ))}
        <rect x="4" y="4" width={W - 8} height={H - 8} rx="3" fill="none" stroke="rgba(255,255,255,0.12)"/>
      </svg>
    </div>
  );
}

function CanvasControls() {
  return (
    <div className="canvas-controls">
      <button title="Zoom in"><Ic.Plus/></button>
      <button title="Zoom out"><Ic.Minus/></button>
      <button title="Fit"><Ic.Maximize/></button>
    </div>
  );
}

function RunOverlay({ run, blocked = false, onOpenManager }) {
  return (
    <div className="run-overlay">
      <div className="ro-head">
        <span className={"st-dot " + run.status}/>
        <span className="ro-title">{run.pipeline}</span>
        <span className={"badge " + (run.status === 'running' ? 'running' : run.status === 'blocked' ? 'blocked' : run.status === 'awaiting_user' ? 'awaiting' : 'done')}>
          {run.status === 'awaiting_user' ? 'awaiting' : run.status}
        </span>
      </div>
      <div className="ro-row"><span className="ro-label">run-id</span><span className="ro-id">{run.id.slice(-12)} <Ic.Copy className="copy-icon"/></span></div>
      <div className="ro-row"><span className="ro-label">version</span><span className="ro-value mono">v3</span></div>
      <div className="ro-row"><span className="ro-label">started</span><span className="ro-value mono">{run.when}</span></div>
      <div className="ro-row"><span className="ro-label">elapsed</span><span className="ro-value mono" style={run.status === 'running' ? {color: 'var(--st-running)'} : {}}>{run.elapsed}</span></div>
      {run.iter && <div className="ro-row"><span className="ro-label">iter</span><span className="ro-value mono">{run.iter}/5</span></div>}
      <div className="ro-row"><span className="ro-label">vars</span><span className="ro-value mono" style={{color: 'var(--fg-3)'}}>3 set →</span></div>

      {blocked && (
        <div className="halt-callout">
          <div className="hc-title"><Ic.Halt/> halted</div>
          Max iterations reached without PASS verdict. Open the manager to extend the cycle or mark the run done.
        </div>
      )}

      <div className="ro-actions">
        <button className={"btn sm" + (blocked ? " highlight" : "")} onClick={onOpenManager}>
          <Ic.Manager/> Open Manager
        </button>
        {run.status === 'running' && <button className="btn sm warn"><Ic.X/> Cancel</button>}
        {(run.status === 'done' || run.status === 'failed' || run.status === 'archived') && <button className="btn sm ghost">Cleanup</button>}
      </div>
    </div>
  );
}

window.Node = Node;
window.Edges = Edges;
window.EdgeLabels = EdgeLabels;
window.HaltIcons = HaltIcons;
window.MiniMap = MiniMap;
window.CanvasControls = CanvasControls;
window.RunOverlay = RunOverlay;
