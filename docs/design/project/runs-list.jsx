// runs-list.jsx — Run mode left panel + Edit mode pipeline list

function RunRow({ run, selected, onClick }) {
  return (
    <div className={"run-row" + (selected ? " selected" : "")} onClick={onClick}>
      <span className={"st-dot " + run.status}/>
      <div className="rr-main">
        <div className="rr-name">{run.pipeline}</div>
        <div className="rr-sub">{run.title}</div>
        <div className="rr-time">{run.when} · {run.elapsed}</div>
      </div>
      <button className="icon-btn" style={{width: 22, height: 22}} onClick={(e)=>e.stopPropagation()}>
        <Ic.Kebab/>
      </button>
    </div>
  );
}

function RunsListPanel({ runs, selectedId, onSelect, onNewRun }) {
  const [filter, setFilter] = React.useState('All');
  const filtered = runs.filter(r => {
    if (filter === 'All') return true;
    if (filter === 'Active') return ['running','awaiting_user','blocked'].includes(r.status);
    if (filter === 'Done') return r.status === 'done';
    if (filter === 'Failed') return r.status === 'failed';
    if (filter === 'Archived') return r.status === 'archived';
    return true;
  });
  return (
    <>
      <PanelHead title="Runs" count={runs.length}
        actions={<button className="btn primary sm" onClick={onNewRun}><Ic.PlusSm/> New Run</button>}/>
      <div style={{padding: '8px 12px', display: 'flex', gap: 6, borderBottom: '1px solid var(--line-soft)'}}>
        {['All','Active','Done','Failed','Archived'].map(f => (
          <button key={f}
            onClick={() => setFilter(f)}
            className="filter-chip"
            style={filter === f ? {color: 'var(--fg)', borderColor: 'var(--bg-5)', background: 'var(--bg-3)'} : {}}>
            {f}
          </button>
        ))}
      </div>
      <div className="p-body">
        <div className="runs-list">
          {filtered.map(r => (
            <RunRow key={r.id} run={r} selected={r.id === selectedId} onClick={() => onSelect(r.id)}/>
          ))}
        </div>
      </div>
    </>
  );
}

function PipeRow({ pipe, selected, onClick }) {
  return (
    <div className={"pipe-row" + (selected ? " selected" : "")} onClick={onClick}>
      <div className="pr-top">
        <span className="pr-name">{pipe.id}</span>
        <span className={"badge " + pipe.kind}>{pipe.kind}</span>
      </div>
      <div className="pr-sub">{pipe.nodes} nodes · {pipe.modified}</div>
    </div>
  );
}

function PipelinesListPanel({ pipelines, selectedId, onSelect }) {
  const [filter, setFilter] = React.useState('All');
  const filtered = pipelines.filter(p => filter === 'All' ? true : p.kind === filter.toLowerCase());
  return (
    <>
      <PanelHead title="Pipelines" count={pipelines.length}
        actions={<button className="btn primary sm"><Ic.PlusSm/> New</button>}/>
      <div style={{padding: '8px 12px', display: 'flex', gap: 6, borderBottom: '1px solid var(--line-soft)'}}>
        {['All','Repo','User'].map(f => (
          <button key={f}
            onClick={() => setFilter(f)}
            className="filter-chip"
            style={filter === f ? {color: 'var(--fg)', borderColor: 'var(--bg-5)', background: 'var(--bg-3)'} : {}}>
            {f}
          </button>
        ))}
      </div>
      <div className="p-body">
        <div className="pipe-list">
          {filtered.map(p => (
            <PipeRow key={p.id} pipe={p} selected={p.id === selectedId} onClick={() => onSelect(p.id)}/>
          ))}
        </div>
      </div>
    </>
  );
}

window.RunsListPanel = RunsListPanel;
window.PipelinesListPanel = PipelinesListPanel;
