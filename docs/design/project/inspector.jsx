// inspector.jsx — right panel for both Run and Edit modes

function NodeDetail({ node, awaiting }) {
  if (!node) return null;
  return (
    <div className="p-body">
      <div className="p-sect" style={{paddingBottom: 10}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8}}>
          <span className={"st-dot " + node.status}/>
          <div style={{flex: 1, minWidth: 0}}>
            <div style={{fontSize: 13, fontWeight: 600}}>{node.name}</div>
            <div style={{fontSize: 11, color: 'var(--fg-3)', marginTop: 2}} className="mono">{node.id}</div>
          </div>
          <span className={"badge " + (node.type === 'code' ? 'code' : 'doc')}>{node.type === 'code' ? 'code' : 'doc'}</span>
          {node.iter && <span className="badge">iter {node.iter}</span>}
        </div>
      </div>

      {awaiting && (
        <div className="p-sect" style={{paddingTop: 8, paddingBottom: 8}}>
          <div className="await-banner">
            <div className="ab-title"><Ic.Warn/> awaiting user</div>
            This node is paused for you. Click <b>Open terminal</b> to interact, then <b>Mark complete</b> here when done.
          </div>
          <div style={{display: 'flex', gap: 6, marginTop: 8}}>
            <button className="btn primary sm" style={{flex: 1, justifyContent: 'center'}}><Ic.Check/> Mark complete</button>
            <button className="btn sm"><Ic.Terminal/> Open terminal</button>
          </div>
        </div>
      )}

      <div className="p-sect">
        <SectionHead title="Terminal preview"/>
        <div className="term-toolbar">
          <span className="tt-dot"/>
          <span>tmux: maestro/run-a3f/impl · 80×24</span>
          <span className="spacer"/>
          <button className="btn ghost sm" style={{height: 22, padding: '0 6px'}}><Ic.External/> Open terminal</button>
        </div>
        <div className="term-preview">
          <div className="term-line"><span className="term-prompt">claude › </span>reading plan.md…</div>
          <div className="term-line term-dim">  ↳ 247 lines, last edited 4m ago</div>
          <div className="term-line"><span className="term-prompt">claude › </span>scanning src/filters/</div>
          <div className="term-line term-dim">  ↳ 12 files matched · 2 modified</div>
          <div className="term-line"><span className="term-blue">tool_use</span> <span className="term-dim">edit_file</span> src/filters/archived.ts</div>
          <div className="term-line term-ok">  ✓ patch applied (+47, -12)</div>
          <div className="term-line"><span className="term-blue">tool_use</span> <span className="term-dim">bash</span> npm test -- archived.test.ts</div>
          <div className="term-line term-dim">  PASS  src/filters/archived.test.ts</div>
          <div className="term-line term-dim">    ✓ filters by deletedAt (12 ms)</div>
          <div className="term-line term-dim">    ✓ excludes parent of archived (8 ms)</div>
          <div className="term-line"><span className="term-prompt">claude › </span>writing diff.md<span className="term-cursor"/></div>
        </div>
      </div>

      <div className="p-sect">
        <SectionHead title="Inputs" count={2}/>
        <div className="port-row">
          <span className="pdot ok"/>
          <div style={{minWidth: 0}}>
            <div className="pname">plan</div>
            <div className="ppath">artifacts/plan/plan.md</div>
          </div>
          <span className="open-link">open ↗</span>
        </div>
        <div className="port-row">
          <span className="pdot accumulating"/>
          <div style={{minWidth: 0}}>
            <div className="pname">review_feedback <span className="badge" style={{marginLeft: 4, height: 14, padding: '0 4px', fontSize: 9}}>repeated</span></div>
            <div className="ppath">artifacts/review/iter-*/feedback.md</div>
          </div>
          <span className="pmeta">2 files</span>
        </div>
      </div>

      <div className="p-sect">
        <SectionHead title="Outputs" count={1}/>
        <div className="port-row">
          <span className="pdot ok"/>
          <div style={{minWidth: 0}}>
            <div className="pname">diff <Ic.Check style={{marginLeft: 4, color: 'var(--st-done)', width: 11, height: 11}}/></div>
            <div className="ppath">artifacts/impl/iter-2/diff.md</div>
          </div>
          <span className="pmeta">3.2 KB</span>
        </div>
        <div className="frontmatter">
          <span className="k">summary</span><span className="v">"add archived filter"</span>
          <span className="k">files_changed</span><span className="v">7</span>
          <span className="k">tests_added</span><span className="v">3</span>
        </div>
      </div>

      <div className="p-sect">
        <SectionHead title="Initial prompt"/>
        <div className="prompt-block">
{`# Implementer · iter 2

## Inputs
- plan: artifacts/plan/plan.md
- review_feedback: artifacts/review/iter-*/feedback.md (2 files)

## Outputs
- diff: artifacts/impl/iter-2/diff.md

## Variables
- max_iter: 5
- branch_prefix: feat/

## Commands available
- bash, edit_file, read_file, glob, grep

# Role

You are an Implementer agent. Read the plan and any prior review
feedback. Make the smallest coherent change that addresses the …`}
        </div>
      </div>
    </div>
  );
}

function NodeInspectorEdit({ node }) {
  return (
    <div className="p-body">
      <div className="p-sect">
        <SectionHead title="Identity"/>
        <div className="field">
          <label>id</label>
          <input className="input mono" defaultValue={node.id}/>
        </div>
        <div className="field">
          <label>Display name</label>
          <input className="input" defaultValue={node.name}/>
        </div>
      </div>

      <div className="p-sect">
        <SectionHead title="Type"/>
        <div className="seg" style={{width: '100%'}}>
          <button className={node.type === 'code' ? 'on' : ''} style={{flex: 1}}><Ic.Code/> code-mutating</button>
          <button className={node.type === 'doc' ? 'on' : ''} style={{flex: 1}}><Ic.Doc/> doc-only</button>
        </div>
        <div className="help" style={{marginTop: 6}}>
          code-mutating gets its own git worktree and can commit; doc-only reads the pipeline branch and only writes Blackboard artifacts.
        </div>
      </div>

      <div className="p-sect">
        <SectionHead title="Behavior"/>
        <div className="row-h" style={{marginBottom: 6}}>
          <label style={{fontSize: 12, color: 'var(--fg)'}}>Interactive</label>
          <span className="toggle"/>
        </div>
        <div className="help">When true, this node pauses after spawning and waits for the user to interact via terminal and click "Mark complete" in run mode.</div>
      </div>

      <div className="p-sect">
        <SectionHead title="Prompt"/>
        <div className="ppath" style={{fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-4)', marginBottom: 6}}>
          prompts/{node.id}.md
        </div>
        <textarea className="textarea mono" rows="9" defaultValue={`# Role

You are an Implementer agent. Read the plan and any prior review
feedback in $review_feedback. Make the smallest coherent change
that addresses the plan and resolves the most recent feedback.

## Output

Write a diff summary to $diff with frontmatter:
  summary, files_changed, tests_added`}/>
      </div>

      <div className="p-sect">
        <SectionHead title="Inputs" count={2}/>
        <div className="port-row" style={{gridTemplateColumns: '12px 1fr auto'}}>
          <span className="pdot"/>
          <div>
            <div className="pname">plan</div>
            <div className="help" style={{marginTop: 2}}>repeated: off</div>
          </div>
          <button className="icon-btn" style={{width: 22, height: 22}}><Ic.Kebab/></button>
        </div>
        <div className="port-row" style={{gridTemplateColumns: '12px 1fr auto'}}>
          <span className="pdot"/>
          <div>
            <div className="pname">review_feedback</div>
            <div className="help" style={{marginTop: 2}}>repeated: on (reads iter-*/)</div>
          </div>
          <button className="icon-btn" style={{width: 22, height: 22}}><Ic.Kebab/></button>
        </div>
        <button className="btn ghost sm" style={{marginTop: 6}}><Ic.PlusSm/> Add input port</button>
      </div>

      <div className="p-sect">
        <SectionHead title="Outputs" count={1}/>
        <div className="port-row" style={{gridTemplateColumns: '12px 1fr auto', alignItems: 'flex-start'}}>
          <span className="pdot" style={{marginTop: 4}}/>
          <div style={{flex: 1}}>
            <div className="pname">diff</div>
            <div className="frontmatter" style={{marginTop: 6}}>
              <span className="k">summary</span><span className="v">string</span>
              <span className="k">files_changed</span><span className="v">int</span>
              <span className="k">tests_added</span><span className="v">int</span>
            </div>
          </div>
          <button className="icon-btn" style={{width: 22, height: 22}}><Ic.Kebab/></button>
        </div>
        <button className="btn ghost sm" style={{marginTop: 6}}><Ic.PlusSm/> Add output port</button>
      </div>
    </div>
  );
}

function EdgeInspector({ edge }) {
  return (
    <div className="p-body">
      <div className="p-sect">
        <SectionHead title="Source"/>
        <div className="field">
          <label>node</label>
          <select className="select mono" defaultValue="review">
            <option value="review">review</option>
            <option value="impl">impl</option>
          </select>
        </div>
        <div className="field">
          <label>port</label>
          <select className="select mono" defaultValue="review_feedback">
            <option value="review_feedback">review_feedback</option>
            <option value="verdict">verdict</option>
          </select>
        </div>
      </div>

      <div className="p-sect">
        <SectionHead title="Target"/>
        <div className="seg" style={{width: '100%', marginBottom: 8}}>
          <button className="on" style={{flex: 1}}>Node</button>
          <button style={{flex: 1}}>Halt</button>
        </div>
        <div className="field">
          <label>node</label>
          <select className="select mono" defaultValue="impl">
            <option value="impl">impl</option>
          </select>
        </div>
        <div className="field">
          <label>port</label>
          <select className="select mono" defaultValue="review_feedback">
            <option value="review_feedback">review_feedback</option>
            <option value="plan">plan</option>
          </select>
        </div>
      </div>

      <div className="p-sect">
        <SectionHead title="Condition (when:)"/>
        <div className="row-h" style={{marginBottom: 8}}>
          <span className="help">Combine clauses</span>
          <span className="seg">
            <button className="on">AND</button>
            <button>OR</button>
          </span>
        </div>
        <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 70px 1fr 22px', gap: 4, alignItems: 'center'}}>
            <select className="select mono" defaultValue="iter"><option>iter</option><option>$max_iter</option></select>
            <select className="select mono" defaultValue="lt"><option>lt</option><option>lte</option><option>eq</option></select>
            <input className="input mono" defaultValue="5"/>
            <button className="icon-btn" style={{width: 22, height: 22}}><Ic.X/></button>
          </div>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 70px 1fr 22px', gap: 4, alignItems: 'center'}}>
            <select className="select mono" defaultValue="verdict"><option>verdict</option><option>iter</option></select>
            <select className="select mono" defaultValue="neq"><option>neq</option><option>eq</option></select>
            <input className="input mono" defaultValue="PASS"/>
            <button className="icon-btn" style={{width: 22, height: 22}}><Ic.X/></button>
          </div>
        </div>
        <button className="btn ghost sm" style={{marginTop: 8}}><Ic.PlusSm/> Add clause</button>

        <div style={{marginTop: 14, padding: '8px 10px', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-2)'}}>
          <span style={{color: 'var(--fg-4)'}}>// preview</span><br/>
          when: <span style={{color: '#fcd34d'}}>iter &lt; 5 AND verdict ≠ PASS</span>
        </div>
      </div>
    </div>
  );
}

function PipelineInspector() {
  return (
    <div className="p-body">
      <div className="p-sect">
        <SectionHead title="Pipeline"/>
        <div className="field">
          <label>Name</label>
          <input className="input mono" defaultValue="feature-with-review"/>
        </div>
        <div className="field">
          <label>Description</label>
          <textarea className="textarea" rows="2" defaultValue="Plan → implement → review loop, tests, then merge. Halts on max iterations."/>
        </div>
        <div className="field">
          <label>Version</label>
          <input className="input mono" defaultValue="3" style={{width: 80}}/>
        </div>
      </div>
      <div className="p-sect">
        <SectionHead title="Variables" count={4}/>
        <div className="var-row" style={{gridTemplateColumns: '1fr 60px 70px 22px', gap: 4}}>
          <input className="input mono" defaultValue="max_iter"/>
          <select className="select mono" defaultValue="int"><option>int</option><option>str</option></select>
          <input className="input mono" defaultValue="5"/>
          <button className="icon-btn" style={{width: 22, height: 22}}><Ic.X/></button>
        </div>
        <div className="var-row" style={{gridTemplateColumns: '1fr 60px 70px 22px', gap: 4}}>
          <input className="input mono" defaultValue="branch_prefix"/>
          <select className="select mono" defaultValue="str"><option>str</option><option>int</option></select>
          <input className="input mono" defaultValue="feat/"/>
          <button className="icon-btn" style={{width: 22, height: 22}}><Ic.X/></button>
        </div>
        <div className="var-row" style={{gridTemplateColumns: '1fr 60px 70px 22px', gap: 4}}>
          <input className="input mono" defaultValue="auto_pr"/>
          <select className="select mono" defaultValue="bool"><option>bool</option></select>
          <input className="input mono" defaultValue="true"/>
          <button className="icon-btn" style={{width: 22, height: 22}}><Ic.X/></button>
        </div>
        <div className="var-row" style={{gridTemplateColumns: '1fr 60px 70px 22px', gap: 4}}>
          <input className="input mono" defaultValue="reviewers"/>
          <select className="select mono" defaultValue="list"><option>list</option></select>
          <input className="input mono" defaultValue="[strict]"/>
          <button className="icon-btn" style={{width: 22, height: 22}}><Ic.X/></button>
        </div>
        <button className="btn ghost sm" style={{marginTop: 6}}><Ic.PlusSm/> Add variable</button>
      </div>
      <div className="p-sect">
        <SectionHead title="Config"/>
        <div className="row-h" style={{marginBottom: 6}}>
          <label style={{fontSize: 12, color: 'var(--fg)'}}>Auto-merge resolver</label>
          <span className="toggle on"/>
        </div>
        <div className="help">Run a deterministic resolver before fan-in nodes. Falls back to manual merge if conflicts remain.</div>
      </div>
    </div>
  );
}

window.NodeDetail = NodeDetail;
window.NodeInspectorEdit = NodeInspectorEdit;
window.EdgeInspector = EdgeInspector;
window.PipelineInspector = PipelineInspector;
