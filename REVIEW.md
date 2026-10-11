# Detailed review — conservative alternative

Reviewed source: `300abd6bfcc9ec981b49ccea029df579c785a3e0` (initial v1 prototype).
Scope: the published activity, DESIGN.md, SPECIFICATION.md, all application source,
and the existing deterministic model suite. This proposal keeps the maroon university
branding, generic demand model, draw/reshape workflow, tangent construction, no-score
exploration, and zero-build static hosting.

## Findings and changes

| Priority | Original behavior / evidence | Proposed correction |
|---|---|---|
| High | Introduction says elasticity is exactly one wherever revenue is highest. Truncated demand ranges can have boundary maxima with nonzero MR. | Qualify the result as an interior-maximum condition in the introduction and educator guide. |
| High | Endpoint-maximum notes infer positive/negative MR everywhere. The valid curve `20.48:8.677,21.59:7.775,37.61:4.154,42.12:2.917,53.37:1.81,57.98:0.058` has a left-end global maximum and both MR signs inside. | Describe the maximum over the drawn range without inferring global monotonicity. |
| High | `trMax` scans 2,001 quantities. For the regression curve in `tests/regression-tests.cjs`, it reports an endpoint at Q=38.19; the interior maximum is Q≈38.197891498, with MR=0. The monetary difference is small, but the instructional classification is wrong. | Check every spline segment's MR roots, endpoints, and knots. Use that maximum to size the TR axis too. |
| High | The live bowed-in preset at Q=100 shows e=0 while the calc box says elasticity is infinite. It also zooms out for an intercept which does not exist. | Distinguish degenerate zero-price tangency from a positive-price horizontal tangent; explain the limiting convention. Do not mark the tangent exercise complete there. |
| Medium | “Unit-elastic (P × Q constant)” is a PCHIP spline, not P=k/Q. Existing tests themselves measure e≈0.9691–1.1237. | Label the preset and task as approximate; retain the existing 5% revenue criterion with an explicit explanation. |
| Medium | Curve URLs round coordinates, so reopening changes preset prices and spline derivatives. Parsing accepts `:10` as Q=0 and ignores a third colon field. | Lossless coordinate serialization, strict numeric syntax, length/point limits, and visible invalid-link feedback. Preserve unrelated query parameters and fragments. |
| Medium | Point-table change events rebuild every input and refocus the changed field, interfering with Tab and click destinations. | Reuse inputs during edits; keep validation and values synchronized without stealing focus. |
| Medium | An out-of-range quantity is clamped internally but remains invalid in the focused number input. Rounded domain bounds can also disagree with actual endpoints. | Show the actual clamped quantity and preserve exact bounds. |
| Medium | Add-point tries only the widest interval; a wide flat interval can fail although another interval has room. | Search every eligible interval and choose the widest valid insertion. |
| Medium | Dragging while tangent auto-rescaling can change the pointer mapping mid-gesture; another pointer can finish the gesture. | Keep one coordinate transform and pointer ID per gesture, then recompute the view on completion. |
| Low | First line-point instructions are immediately overwritten by rendering; announcements can race; modified link clicks are intercepted. | Preserve feedback, add Escape cancellation, debounce announcements, and honor modified clicks. |
| Low | Readout/table units are incomplete; narrow readout columns can overrun; scrollable tables have no keyboard focus target. | Add units, stack mobile readouts, constrain selects, expose focusable named table regions, and size handle targets in CSS pixels. |

The overlay graph still has two independently scaled right-axis series, with only one set
of ticks visible at a time. This is preserved to keep this PR small in product scope; the
ambitious alternative addresses this by adding aligned panels. The original four prompts
remain self-checks, not grading or evidence of student mastery.

## Mathematical method

Within a spline segment, write P(t)=At³+Bt²+Ct+D and Q=Qa+ht. Then
MR(t)=4At³+(3B+3A·Qa/h)t²+(2C+2B·Qa/h)t+(D+C·Qa/h).
Split [0,1] at the roots of its derivative, then bisect sign changes on the resulting
monotone intervals and include repeated roots at the splits. Compare revenue at all roots,
knots, and endpoints. This removes dependence on the old uniform search grid.

## Validation and limits

- Original deterministic suite: **5,125,922 checks, zero failures**, including 10,000 random curves.
- Added regression suite: **12 tests passed**, covering the reproduced peak error, full-precision
  links, malformed inputs, tangent singularities, point focus, visible quantity clamping,
  endpoint text, alternate-gap insertion, and pointer/line feedback.
- Original live site inspected in Chromium; the zero-price tangent contradiction reproduced.
- Revised controller and SVG exercised in jsdom. This is **not** a browser rendering or
  screen-reader audit. The available browser cannot open the local preview; desktop/mobile
  rendering, touch behavior, and assistive-technology verification remain review steps.

No deployment or default-branch change is proposed by opening the PR. This is a complete
alternative to the ambitious branch; merge one design, or selectively port changes.
