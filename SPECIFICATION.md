# Elasticity, TR, MR — browser specification (v1)

## Proposed conservative revision

The implementation in this branch preserves the v1 interaction and layout. The following
corrections supersede conflicting v1 details below; they are proposals for review, not claims
of author approval:

- The MR = 0 / e = 1 result concerns positive-price **interior** revenue maxima. Boundary
  maxima do not imply that MR has one sign everywhere on a nonlinear curve.
- Revenue maxima are found among all spline knots, endpoints, and stationary points,
  isolating roots of the cubic MR on each segment. A uniform grid is not the optimizer.
- The unit-elastic spline preset and guided prompt are explicitly approximate. The existing
  5% revenue-band check is retained; it does not prove elasticity is exactly one.
- When both price and slope are zero at the right endpoint, the readout uses the one-sided
  limit e = 0, but the point formula and tangent segment ratio are undefined. A positive-price
  horizontal tangent has no finite quantity intercept and no longer forces a 10× zoom-out.
- Curve links preserve full coordinate precision and reject empty, extra, or malformed fields.
  Existing valid v1 links remain supported. Other query parameters and URL fragments survive.
- Point edits preserve input elements and ordinary keyboard focus progression. Numeric fields
  accept the same precision as the model. Invalid shared curves are explained rather than silently reset.

See [REVIEW.md](REVIEW.md) for evidence and validation.

- **Status:** decided and implemented 2026-09-30. Decisions by Eric McKee (economist; development lead), standing in for the open "questions for David." **David Friedman's review is invited but not blocking**; any change he asks for becomes a spec revision.
- **Source:** Friedman's detailed description of Proposal 6 on the [program descriptions page](http://daviddfriedman.com/Living_Paper/Program_Descriptions/program_descriptions.htm), re-read 2026-09-30. Fresh code; no legacy program exists or was inspected.
- **Code:** `js/model.js` (mathematics, no DOM), `js/graph.js` (SVG), `js/app.js` (page controller), `index.html`, `styles.css`. Tests: `tests/model-tests.cjs`.

## Learning objective

Build an intuitive feel for elasticity by drawing a demand curve and watching its elasticity, total revenue and marginal revenue respond as the curve is reshaped. The central relationship: where total revenue is at a maximum, elasticity is one and marginal revenue is zero. A second lesson is that the tangent-segment trick (Friedman's textbook geometry) gives the same elasticity as the formula.

## Kept from the source

- Price is on the vertical axis and quantity on the horizontal. The student draws a demand curve with a **straight-line tool** or a **smoothed curve tool**. The curve tool grows toward the cursor at a speed proportional to the distance, which compensates for shaky pointer input.
- Toggles select which of **elasticity, TR and MR** are drawn. They can be selected before or after drawing, and the selected series update live while the curve is drawn or reshaped.
- A separate right-hand axis carries a different unit. When more than one right-axis series is selected, a **button cycles the right axis** between them, changing its label, numbers and units.
- Each series has its own line style, and each toggle shows a sample of its line.
- **Version 2 reshape:** handles along the curve can be moved. The demand curve is a smooth curve through them, and every selected series changes with it.
- **Calc tool:** pick a point on the demand curve to see elasticity calculated there as the ratio of the two tangent segments. The calculation is shown in a box beside the graph. When a tangent intercept falls outside the plot, the view **shrinks automatically** so the whole tangent fits (Friedman's "elegant solution").
- Mathematics: elasticity e = −(dQ/dP)·(P/Q); TR = P·Q; MR = dTR/dQ.

## Decisions (answers to the DESIGN.md questions)

| Topic | Decision | Rationale |
|---|---|---|
| Version | **Version 2** (reshapeable). It includes everything in version 1. An explorer, not a scored game. | Friedman calls version 2 "better." The source defines no scoring. |
| Units | A generic good: price $0–$10.00 per unit; quantity 0–100 units per week. TR in dollars per week; MR in dollars per unit. | Round numbers keep the arithmetic in the tangent calculation checkable by hand. |
| Curve model | Demand is P(Q) through **2–12 control points**, each in the 0–100 × $0–$10 box, with quantity strictly increasing and price strictly decreasing (gaps ≥ 0.5 units and ≥ $0.05). Joined by a **monotone cubic Hermite spline** (Fritsch–Butland tangents), so the curve never slopes upward between points. Two points give exactly a straight line. The curve covers only its points' quantity range; it may reach either axis or stop short. | Linear and nonlinear demand in one representation. Monotone interpolation stops reshaping from creating upward-sloping kinks that would make elasticity negative. |
| Entry methods | (1) **Line tool:** click two points (no drag); their order does not matter. (2) **Curve tool:** freehand sketch with Friedman's smoothing. On release the path is cleaned to its downward-sloping part and resampled to 7 control points. This drag path is optional. (3) **Presets:** straight line, unit-elastic (P·Q constant), bowed in (convex), bowed out (concave). (4) **Point table:** type Q and P for each control point; add and remove rows. | (4) is the complete keyboard and screen-reader route. (1) is the single-pointer, no-drag route required by WCAG 2.5.7. (2) is Friedman's curve tool. |
| Reshape | Every control point has a square handle with a hit area of at least 24 px. Handles can be dragged, or focused with Tab and moved with the arrow keys (0.5 units / $0.05 per press; Shift ×10). A move that would break the ordering is stopped at the nearest valid position, with a message. | Friedman's reshape tool, with keyboard parity. |
| Displays | Toggles (pressed/not pressed) for Elasticity, TR and MR. Demand: solid blue. Elasticity: thick maroon. TR: dashed green. MR: dotted orange. **MR is drawn on the price axis**, because it has the same unit ($ per unit); the axis extends below zero when MR is negative. The right axis carries elasticity (0–5) or TR (auto-scaled). Its zero aligns with the price axis's zero, and a "Right axis" button cycles when both are shown. Elasticity above 5 is clipped, with a note. | **Departure:** the source lists MR among the right-axis choices. Placing it on the price axis puts MR and demand on one scale, which is the textbook picture (MR starts at the demand intercept and lies below demand). |
| Selected quantity | A single **selected quantity** (slider and number input; with the Reshape / pick tool, a click on the graph away from a handle, or on a handle without dragging it; Enter on a focused handle) drives the readout: P, e, TR and MR at that quantity. **Show tangent calculation** draws the tangent there and labels the two segments. | One point of focus serves both the readout and the Calc tool. |
| Calc box | Shows the point, the slope, both intercepts, then e = lower segment ÷ upper segment = (Q-intercept − Q) ÷ Q, beside e = −(1/slope)·(P/Q), and states that the two agree. | Friedman's box. Along a straight tangent, the segment ratio equals the ratio of their quantity spans. |
| Auto-rescale | When the tangent is shown, the view grows to include both intercepts, rounded to a nice scale and capped at 10× the base range. Beyond the cap, the text reports the intercept's value. The view returns to the base range when the tangent is hidden or fits. Control points stay inside the base box. | Friedman's automatic shrink. The cap keeps a nearly flat tangent from shrinking the curve to nothing. |
| TR maximum | The global maximum of TR over the curve is found numerically. If it lies inside the curve's quantity range, a vertical guide and markers show e = 1 and MR = 0 there. If it lies at an end of the curve, a note explains why (demand stays elastic, or stays inelastic, across the whole curve). | The central lesson, made explicit. |
| Edge cases | Q = 0: elasticity undefined (shown as "∞"). P = 0: e = 0. A flat stretch of the spline (slope 0): e shown as "∞" and MR = P. Line-tool points that would slope upward, or be vertical or horizontal, are refused with an explanation. A sketch with fewer than two usable points is refused. | |
| Text equivalents | Readout at the selected quantity. A table of values at 11 evenly spaced quantities across the curve. A visually hidden graph description, regenerated after every change. A polite live region announces tool results. | The graph is never the only source of a value. |
| Guided prompts (**addition**) | Four optional self-checked tasks, each shown as "not yet / done": (1) put the selected quantity at the TR peak (within 1.5 units); (2) make demand unit-elastic across its whole range, checked as total revenue within 5% of its average (unit elasticity everywhere is the same thing as constant TR; a curve through five or more points with P × Q equal passes, but spline end slopes keep e itself from staying within ±0.1 near the ends — measured); (3) on a straight line, choose a quantity above the midpoint price, where e > 1; (4) show the tangent calculation on a curved demand (3 or more points). No score. | The source has no exercises. These make the lessons checkable in class without adding grading. |
| Sharing | `?pts=q:p,q:p,…` (Q to 0.1, P to 0.01) reproduces a curve; "Link to this curve" gives it. No storage. | Lets an instructor hand a class the same curve. |

## Failure cases handled

Out-of-box and out-of-order entries (table, handles and line tool); fewer than 2 or more than 12 points (Remove is disabled at 2, Add at 12); a sketch that is too short or slopes upward; a selected quantity outside the curve (clamped to the curve's range); an intercept beyond the rescale cap.

## Accessibility design (audit still required before release)

- Every action works by keyboard: native buttons, selects, number inputs and a range slider; focusable handles with arrow-key movement; the point table. Drawing never requires a pointer, and pointer drawing never requires dragging (Line tool).
- The SVG is a labelled group. Its plotted marks are hidden from assistive technology; a regenerated text description and the tables carry the information. Handles are buttons with labels that give their values.
- Series differ by line pattern and weight as well as color, and the legend is text.
- Primary buttons are at least 44 px and other controls at least 32 px. The layout reflows to one column below 900 px with no horizontal page scroll at 320 px.

## Acceptance scenarios (automated)

1. **Linear:** P = 10 − 0.1Q. e = 1 exactly at Q = 50. MR = 10 − 0.2Q everywhere. The TR maximum is at Q = 50 with MR = 0. Above the midpoint price, e > 1.
2. **Unit-elastic preset:** e within 0.02 of 1 between its end segments and within 0.95–1.15 overall; TR within 5% of its mean. Guided prompt 2 passes for the preset and for five hand-entered points with P × Q = 200, and fails for three.
3. **Monotone spline:** for 10,000 random valid point sets, the spline passes through every point and its slope is ≤ 0 everywhere, so elasticity is never negative.
4. **Tangent geometry:** at sampled points on random curves, (Q-intercept − Q)/Q equals −(1/slope)·(P/Q) to 1e-9.
5. **TR maximum:** at an interior maximum, |MR| < 0.01 and |e − 1| < 0.01.
6. **Validation:** out-of-order, out-of-box and too-close points are rejected. Clamped handle moves stay valid. Sketches are cleaned to downward-sloping points.
7. **Sharing:** encoding a curve into the URL and decoding it gives the same points, to the stated precision.

## Deferred variants (from the source)

Moving a curve between programs (e.g. from Proposal 17, Experimental Monopolist); printing; showing several curves at once for comparison; an optional supply-side analogue.
