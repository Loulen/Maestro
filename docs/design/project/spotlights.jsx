// spotlights.jsx — component spotlight artboards for the picked winners
// Each Screen renders a <.spotlight-art> container with the new markup
// (`.spot-node`, `.spot-card`, `.op-tab`, `.fld`, `.sb-card`,
// `.spot-inspector`, `.port-pill`) so the picked hypotheses are visible
// in-mockup without altering the existing screens.

function SpotHead({ eyebrow, title, sub }) {
  return (
    <div className="spot-head">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <span className="spot-sub">{sub}</span>
    </div>
  );
}

function MiniNode({ status = 'pending', selected = false, name = 'normalize_payload', kind = 'code', meta = '· idle', ports = [] }) {
  const Icon = (kind === 'doc' ? Ic.Doc : kind === 'loop' ? Ic.Loop : kind === 'switch' ? Ic.Switch : Ic.Code);
  return (
    <div className={"spot-node " + status + (selected ? ' selected' : '')}>
      <div className="sn-head">
        <span className="sn-icon"><Icon/></span>
        <span className="sn-name">{name}</span>
      </div>
      <span className="sn-meta">{meta}</span>
      {ports.map((p, i) => (
        <PortPill key={i} side={p.side} kind={p.kind} label={p.label} active={p.active} style={p.style}/>
      ))}
    </div>
  );
}

// ============================================================
// SpotNodes — H1 cadre across statuses + selection cohabitation
// ============================================================
function SpotNodes() {
  return (
    <div className="spotlight-art">
      <SpotHead
        eyebrow="Sheet 1 · winner"
        title="Node card — H1 solid stroke"
        sub="Status drives a motion-free 4-side cadre. Pending = no cadre. Failed = corner badge. Selection = emerald gap-offset ring, status stays readable."/>
      <div className="spot-grid three">
        <div className="spot-card">
          <div className="sc-head">
            <span className="sc-tag">A · status row</span>
            <span className="sc-title">5 states</span>
            <span className="sc-cap">Each color reads at a glance, only failed shouts.</span>
          </div>
          <div className="sc-body">
            <div className="sc-row">
              <span className="sc-label">pending</span>
              <div className="sc-stage">
                <MiniNode status="pending" meta="· idle"/>
              </div>
            </div>
            <div className="sc-row">
              <span className="sc-label">running</span>
              <div className="sc-stage">
                <MiniNode status="running" meta="· 00:12"/>
              </div>
            </div>
            <div className="sc-row">
              <span className="sc-label">awaiting</span>
              <div className="sc-stage">
                <MiniNode status="awaiting_user" meta="· needs input"/>
              </div>
            </div>
            <div className="sc-row">
              <span className="sc-label">completed</span>
              <div className="sc-stage">
                <MiniNode status="done" meta="· 00:04 · ok"/>
              </div>
            </div>
            <div className="sc-row">
              <span className="sc-label">failed</span>
              <div className="sc-stage">
                <MiniNode status="failed" meta="· retry exhausted"/>
              </div>
            </div>
          </div>
        </div>

        <div className="spot-card">
          <div className="sc-head">
            <span className="sc-tag">B · selection</span>
            <span className="sc-title">Status + selection</span>
            <span className="sc-cap">Outer ring lives outside the status border so both channels survive.</span>
          </div>
          <div className="sc-body">
            <div className="sc-row">
              <span className="sc-label">running</span>
              <div className="sc-stage">
                <MiniNode status="running" meta="· 00:12"/>
              </div>
            </div>
            <div className="sc-row">
              <span className="sc-label">running + sel</span>
              <div className="sc-stage">
                <MiniNode status="running" selected meta="· 00:12"/>
              </div>
            </div>
            <div className="sc-row">
              <span className="sc-label">failed + sel</span>
              <div className="sc-stage">
                <MiniNode status="failed" selected meta="· retry exhausted"/>
              </div>
            </div>
            <div className="sc-row">
              <span className="sc-label">await + sel</span>
              <div className="sc-stage">
                <MiniNode status="awaiting_user" selected meta="· needs input"/>
              </div>
            </div>
          </div>
        </div>

        <div className="spot-card">
          <div className="sc-head">
            <span className="sc-tag">C · special nodes</span>
            <span className="sc-title">Family check</span>
            <span className="sc-cap">Same cadre rules apply to Loop / Switch / Merge / Start / End uniformly.</span>
          </div>
          <div className="sc-body">
            <div className="sc-row">
              <span className="sc-label">switch</span>
              <div className="sc-stage">
                <MiniNode status="running" kind="switch" name="route_by_type" meta="· 3 branches"/>
              </div>
            </div>
            <div className="sc-row">
              <span className="sc-label">loop</span>
              <div className="sc-stage">
                <MiniNode status="running" kind="loop" name="iterate_files" meta="· i = 3 / N"/>
              </div>
            </div>
            <div className="sc-row">
              <span className="sc-label">start</span>
              <div className="sc-stage">
                <MiniNode status="done" kind="code" name="start" meta="· entered"/>
              </div>
            </div>
            <div className="sc-row">
              <span className="sc-label">end</span>
              <div className="sc-stage">
                <MiniNode status="running" kind="code" name="end" meta="· 1 of 3 arrived"/>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SpotPorts — P2 capsule pill on all four sides + states
// ============================================================
function SpotPorts() {
  return (
    <div className="spotlight-art">
      <SpotHead
        eyebrow="Sheet 2 · winner"
        title="Port row — P2 capsule pill"
        sub="Pill straddles the card edge. Direction comes from the chevron, not the side. Hover-driven drop highlight on valid inputs."/>
      <div className="spot-grid">
        <div className="spot-card">
          <div className="sc-head">
            <span className="sc-tag">A · all four sides</span>
            <span className="sc-title">Side-flex matrix</span>
            <span className="sc-cap">Same pill, four orientations. Chevron carries the direction.</span>
          </div>
          <div className="sc-body">
            <div className="sc-row">
              <span className="sc-label">left · input</span>
              <div className="sc-stage">
                <MiniNode status="pending" name="normalize" meta="· idle"
                  ports={[{ side:'left', kind:'in', label:'in' }]}/>
              </div>
            </div>
            <div className="sc-row">
              <span className="sc-label">right · output</span>
              <div className="sc-stage">
                <MiniNode status="pending" name="normalize" meta="· idle"
                  ports={[{ side:'right', kind:'out', label:'out' }]}/>
              </div>
            </div>
            <div className="sc-row">
              <span className="sc-label">top · input</span>
              <div className="sc-stage">
                <MiniNode status="pending" name="normalize" meta="· idle"
                  ports={[{ side:'top', kind:'in', label:'in' }]}/>
              </div>
            </div>
            <div className="sc-row">
              <span className="sc-label">bottom · out</span>
              <div className="sc-stage">
                <MiniNode status="pending" name="normalize" meta="· idle"
                  ports={[{ side:'bottom', kind:'out', label:'done' }]}/>
              </div>
            </div>
          </div>
        </div>

        <div className="spot-card">
          <div className="sc-head">
            <span className="sc-tag">B · states + mix</span>
            <span className="sc-title">Hover-driven drop</span>
            <span className="sc-cap">Only inputs on the hovered node light up amber. Mixed sides allowed.</span>
          </div>
          <div className="sc-body">
            <div className="sc-row">
              <span className="sc-label">at rest</span>
              <div className="sc-stage">
                <MiniNode status="pending" name="enrich" meta="· idle"
                  ports={[
                    { side:'left', kind:'in', label:'payload' },
                    { side:'right', kind:'out', label:'enriched' }
                  ]}/>
              </div>
            </div>
            <div className="sc-row">
              <span className="sc-label">drop target</span>
              <div className="sc-stage">
                <MiniNode status="pending" name="enrich" meta="· dragging in"
                  ports={[
                    { side:'left', kind:'in', label:'payload', active:true },
                    { side:'right', kind:'out', label:'enriched' }
                  ]}/>
              </div>
            </div>
            <div className="sc-row">
              <span className="sc-label">mixed sides</span>
              <div className="sc-stage">
                <MiniNode status="running" kind="loop" name="iterate_files" meta="· body active"
                  ports={[
                    { side:'left', kind:'in', label:'in' },
                    { side:'top', kind:'in', label:'break' },
                    { side:'right', kind:'out', label:'body', active:true },
                    { side:'bottom', kind:'out', label:'done' }
                  ]}/>
              </div>
            </div>
            <div className="sc-row">
              <span className="sc-label">switch fan-out</span>
              <div className="sc-stage">
                <MiniNode status="running" kind="switch" name="route_by_type" meta="· 3 branches"
                  ports={[
                    { side:'left', kind:'in', label:'in' },
                    { side:'right', kind:'out', label:'doc', style:{ top: '28%' } },
                    { side:'right', kind:'out', label:'code', style:{ top: '60%' }, active:true },
                    { side:'right', kind:'out', label:'default', style:{ top: '92%' } }
                  ]}/>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SpotInspector — O3 output card + F1 field row, amber-scoped
// ============================================================
function SpotInspector() {
  return (
    <div className="spotlight-art">
      <SpotHead
        eyebrow="Sheet 3 · winners"
        title="Inspector — O3 tab head · F1 type row"
        sub="Output sits in an outdented tab-head card. Each field is a single row with its name, type, and an inline enum drawer when relevant. Amber accent scopes the inspector."/>
      <div className="spot-grid">
        <div className="spot-card">
          <div className="sc-head">
            <span className="sc-tag">A · output schema</span>
            <span className="sc-title">enrich_user_record.json</span>
            <span className="sc-cap">Tab-head sits over the body. Body anchors the schema rows.</span>
          </div>
          <div className="spot-inspector">
            <div className="op-tab">
              <div className="op-head">
                <button className="op-chev" aria-label="collapse"><Ic.Chevron/></button>
                <input className="op-name" defaultValue="user_record.json" spellCheck={false}/>
                <div className="op-actions">
                  <button className="op-del" aria-label="delete"><Ic.Trash/></button>
                </div>
              </div>
              <div className="op-body">
                <div className="fld">
                  <input className="fld-name" defaultValue="user_id" spellCheck={false}/>
                  <select className="fld-type" defaultValue="string">
                    <option>string</option><option>number</option><option>boolean</option><option>enum</option><option>object</option>
                  </select>
                  <button className="fld-del" aria-label="delete"><Ic.X/></button>
                </div>
                <div className="fld">
                  <input className="fld-name" defaultValue="email" spellCheck={false}/>
                  <select className="fld-type" defaultValue="string">
                    <option>string</option><option>number</option><option>boolean</option><option>enum</option><option>object</option>
                  </select>
                  <button className="fld-del" aria-label="delete"><Ic.X/></button>
                </div>
                <div className="fld">
                  <input className="fld-name" defaultValue="tier" spellCheck={false}/>
                  <select className="fld-type" defaultValue="enum">
                    <option>string</option><option>number</option><option>boolean</option><option>enum</option><option>object</option>
                  </select>
                  <button className="fld-del" aria-label="delete"><Ic.X/></button>
                  <div className="fld-enum">
                    <div className="fld-enum-h">allowed values</div>
                    <div className="fld-chips">
                      <span className="fld-chip">free</span>
                      <span className="fld-chip">pro</span>
                      <span className="fld-chip">enterprise</span>
                    </div>
                    <div className="fld-add-row">
                      <input placeholder="add value…"/>
                      <button className="fld-add-btn">add</button>
                    </div>
                  </div>
                </div>
                <div className="fld">
                  <input className="fld-name" defaultValue="created_at" spellCheck={false}/>
                  <select className="fld-type" defaultValue="string">
                    <option>string</option><option>number</option><option>boolean</option><option>enum</option><option>object</option>
                  </select>
                  <button className="fld-del" aria-label="delete"><Ic.X/></button>
                </div>
              </div>
            </div>

            <div className="op-tab collapsed">
              <div className="op-head">
                <button className="op-chev" aria-label="expand"><Ic.Chevron/></button>
                <input className="op-name" defaultValue="audit_trail.json" spellCheck={false}/>
                <div className="op-actions">
                  <button className="op-del" aria-label="delete"><Ic.Trash/></button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="spot-card">
          <div className="sc-head">
            <span className="sc-tag">B · switch branches</span>
            <span className="sc-title">S1 · AND rail</span>
            <span className="sc-cap">Vertical rule + sideways AND label make multi-cond branches scannable.</span>
          </div>
          <div className="spot-inspector">
            <div className="sb-card">
              <div className="sb-head">
                <span className="sb-grip"><Ic.Kebab/></span>
                <input className="sb-name" defaultValue="doc" spellCheck={false}/>
                <button className="sb-del" aria-label="delete"><Ic.Trash/></button>
              </div>
              <div className="sb-body">
                <div className="sb-conds single">
                  <div className="sb-cond">
                    <input className="input" defaultValue="$.kind"/>
                    <select className="select" defaultValue="==">
                      <option>==</option><option>!=</option><option>matches</option>
                    </select>
                    <input className="input" defaultValue={'"document"'}/>
                    <button className="sb-x" aria-label="remove"><Ic.X/></button>
                  </div>
                </div>
              </div>
            </div>

            <div className="sb-card">
              <div className="sb-head">
                <span className="sb-grip"><Ic.Kebab/></span>
                <input className="sb-name" defaultValue="code_high_priority" spellCheck={false}/>
                <button className="sb-del" aria-label="delete"><Ic.Trash/></button>
              </div>
              <div className="sb-body">
                <div className="sb-conds multi">
                  <div className="sb-cond">
                    <input className="input" defaultValue="$.kind"/>
                    <select className="select" defaultValue="==">
                      <option>==</option><option>!=</option><option>matches</option>
                    </select>
                    <input className="input" defaultValue={'"code"'}/>
                    <button className="sb-x" aria-label="remove"><Ic.X/></button>
                  </div>
                  <div className="sb-cond">
                    <input className="input" defaultValue="$.priority"/>
                    <select className="select" defaultValue=">=">
                      <option>==</option><option>!=</option><option>{">"}</option><option>{">="}</option><option>{"<"}</option>
                    </select>
                    <input className="input" defaultValue="8"/>
                    <button className="sb-x" aria-label="remove"><Ic.X/></button>
                  </div>
                  <div className="sb-cond">
                    <input className="input" defaultValue="$.locked"/>
                    <select className="select" defaultValue="==">
                      <option>==</option><option>!=</option>
                    </select>
                    <input className="input" defaultValue="false"/>
                    <button className="sb-x" aria-label="remove"><Ic.X/></button>
                  </div>
                </div>
              </div>
            </div>

            <div className="sb-card sb-default">
              <div className="sb-head">
                <span className="sb-grip"><Ic.Kebab/></span>
                <input className="sb-name" defaultValue="default" spellCheck={false}/>
                <span className="sb-pin">fallback</span>
              </div>
              <div className="sb-body">taken when no other branch matches</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.SpotNodes = SpotNodes;
window.SpotPorts = SpotPorts;
window.SpotInspector = SpotInspector;
