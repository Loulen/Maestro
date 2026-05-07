// md-modal.jsx — Markdown viewer modal with frontmatter + GFM body + iter navigator

function MdNav({ pos, total, onPrev, onNext }) {
  return (
    <div className="md-nav">
      <button onClick={onPrev} disabled={pos <= 1}><Ic.Chevron style={{transform: 'rotate(90deg)'}}/></button>
      <span className="md-nav-pos">iter {pos} of {total}</span>
      <button onClick={onNext} disabled={pos >= total}><Ic.Chevron style={{transform: 'rotate(-90deg)'}}/></button>
    </div>
  );
}

function MdShell({ port, path, pos, total, onClose, onPrev, onNext, frontmatter, children }) {
  return (
    <div className="md-bg" onClick={onClose}>
      <div className="md-modal" onClick={(e) => e.stopPropagation()}>
        <div className="md-head">
          <div className="md-title">
            <span className="md-port">{port}</span>
            <span className="md-path">{path}</span>
          </div>
          {total ? <MdNav pos={pos} total={total} onPrev={onPrev} onNext={onNext}/> : <div/>}
          <div className="md-close-wrap">
            <button className="icon-btn" onClick={onClose}><Ic.X/></button>
          </div>
        </div>
        <div className="md-body">
          {frontmatter && (
            <>
              <div className="frontmatter">
                {Object.entries(frontmatter).map(([k, v]) => (
                  <React.Fragment key={k}>
                    <span className="k">{k}</span>
                    <span className={"v" + (k === 'verdict' && v === 'PASS' ? ' enum-pass' : k === 'verdict' && v === 'FAIL' ? ' enum-fail' : '')}>{String(v)}</span>
                  </React.Fragment>
                ))}
              </div>
              <hr className="md-divider"/>
            </>
          )}
          <div className="md-render">{children}</div>
        </div>
        <div className="md-foot">
          <span>md · 1.4 KB</span>
          <span>read-only · artifact</span>
        </div>
      </div>
    </div>
  );
}

// Variant A — verdict markdown, single file (verdict port)
function MdVerdictModal({ open, onClose }) {
  if (!open) return null;
  return (
    <MdShell
      port="verdict"
      path="artifacts/review/iter-2/verdict.md"
      onClose={onClose}
      frontmatter={{
        verdict: 'PASS',
        iter: 2,
        files_reviewed: 7,
        confidence: 'high',
        reviewer: 'strict',
      }}>
      <h1>Review verdict — iter 2</h1>
      <p>The implementation in <code>iter-2/diff.md</code> resolves the two blocking issues from iter 1
      and adds the regression coverage requested. <strong>Verdict: PASS</strong>.</p>

      <h2>What changed since iter 1</h2>
      <ul>
        <li>Archived filter now reads from the zustand store, not the local component state.</li>
        <li>Parent-of-archived case is handled in <code>filters/archived.ts</code> via the new <code>excludeArchivedAncestors</code> helper.</li>
        <li>Added 3 tests; one covers the regression flagged in iter 1.</li>
      </ul>

      <h3>Resolved feedback</h3>
      <ol>
        <li>Don't mutate props — fixed in <code>LibraryView.tsx:84</code>.</li>
        <li>Persist preference in localStorage — covered by the new <code>useArchivedPref()</code> hook.</li>
      </ol>

      <h3>Spot checks</h3>
      <table>
        <thead><tr><th>Area</th><th>Status</th><th>Notes</th></tr></thead>
        <tbody>
          <tr><td>State store</td><td>ok</td><td>follows existing pattern</td></tr>
          <tr><td>Test coverage</td><td>ok</td><td>2 new + 1 regression</td></tr>
          <tr><td>Perf</td><td>n/a</td><td>O(n) over visible items, unchanged</td></tr>
          <tr><td>A11y</td><td>ok</td><td>toggle is keyboard-reachable</td></tr>
        </tbody>
      </table>

      <blockquote>
        Nice work — the helper extraction reads much better than the inline filter.
        See follow-up below for a small naming nit, non-blocking.
      </blockquote>

      <h2>Non-blocking follow-ups</h2>
      <ul>
        <li>Rename <code>excludeArchivedAncestors</code> → <code>withoutArchivedParents</code> for symmetry with the rest of <code>filters/</code>.</li>
        <li>Consider memoizing the toggle handler in <code>LibraryView</code> (very minor).</li>
      </ul>

      <h2>Reference</h2>
      <p>See <a href="#">issue #142</a>, the original plan in <code>artifacts/plan/plan.md</code>,
      and prior feedback in <a href="#">iter-1/feedback.md</a>.</p>

      <pre><code>{`// post-merge guard
if (verdict === 'PASS' && tests.result === 'green') {
  await mergeBranch(branch);
}`}</code></pre>
    </MdShell>
  );
}

// Variant B — repeated port, navigator at iter 4 of 5
function MdFeedbackModal({ open, onClose }) {
  const [pos, setPos] = React.useState(4);
  if (!open) return null;
  return (
    <MdShell
      port="review_feedback"
      path={`artifacts/review/iter-${pos}/feedback.md`}
      pos={pos}
      total={5}
      onPrev={() => setPos((p) => Math.max(1, p - 1))}
      onNext={() => setPos((p) => Math.min(5, p + 1))}
      onClose={onClose}
      frontmatter={{
        iter: pos,
        verdict: 'FAIL',
        blocking: 2,
        nits: 3,
        next_action: 'iterate',
      }}>
      <h1>Review feedback — iter {pos}</h1>
      <p>Implementation is closer than iter {pos - 1} but two blocking issues remain. Please address
      then re-submit. Verdict: <code>FAIL</code>, request iteration.</p>

      <h2>Blocking</h2>
      <ol>
        <li><strong>State coupling.</strong> The new toggle still writes to a component-local
        state in <code>LibraryView.tsx:84</code> instead of the zustand store. This breaks the
        cross-tab sync requirement in the plan.</li>
        <li><strong>Missing test for parent-of-archived.</strong> The case from the plan ("when an
        archived item has a non-archived parent, the parent must still appear") is not covered.</li>
      </ol>

      <h2>Nits</h2>
      <ul>
        <li>The helper <code>filterArchivedDeep</code> would read clearer as <code>excludeArchivedAncestors</code>.</li>
        <li>Consider moving <code>archivedSelector</code> next to the rest of the selectors.</li>
        <li>Tests file has a stray <code>console.log</code> on line 47.</li>
      </ul>

      <h3>Suggested patch</h3>
      <pre><code>{`// LibraryView.tsx
- const [showArchived, setShowArchived] = useState(false);
+ const showArchived = useLibrary((s) => s.showArchived);
+ const setShowArchived = useLibrary((s) => s.setShowArchived);`}</code></pre>

      <blockquote>
        Reminder: this is iter {pos} of 5. After iter 5 the run will halt and require a
        manager decision — please prioritize the two blocking items above before nits.
      </blockquote>

      <h2>Reference</h2>
      <p>See the plan in <a href="#">artifacts/plan/plan.md</a> and prior iterations:
      iter 1 (<a href="#">feedback</a>), iter 2 (<a href="#">feedback</a>), iter 3 (<a href="#">feedback</a>).</p>
    </MdShell>
  );
}

window.MdVerdictModal = MdVerdictModal;
window.MdFeedbackModal = MdFeedbackModal;
