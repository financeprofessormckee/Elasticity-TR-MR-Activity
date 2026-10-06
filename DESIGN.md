# Elasticity, TR, MR — source-based design brief

Proposal 6. Source reviewed 2026-09-30: [Program Descriptions](http://daviddfriedman.com/Living_Paper/Program_Descriptions/program_descriptions.htm) and [Living Paper index](http://daviddfriedman.com/Living_Paper/living_paper.htm).

**This is a planning brief, not an approved browser specification.** Implementation is paused until prioritized with David.

## Learning objective

Connect the shape of demand to elasticity, total revenue, and marginal revenue.

## Confirmed mechanics in the source

- Students draw a demand curve with price on the vertical axis and quantity on the horizontal axis.
- Selected displays show elasticity, total revenue, and marginal revenue implied by the same demand curve. Total revenue is price multiplied by quantity; marginal revenue is its derivative with respect to quantity.
- At an interior maximum of total revenue, marginal revenue is zero and demand elasticity is one. The activity is intended to make this relationship visible.
- A calculation tool illustrates elasticity at a selected point using the tangent and its intercept segments.
- The source distinguishes a draw-and-restart version from a richer version that permits reshaping an existing curve and updates all selected derived displays.
- Derived quantities must have clearly identified units and distinguishable line styles; the source discusses selecting the displayed right-axis scale.

## Optional variants and adaptation notes

- Smooth freehand curve entry, adjustable curve control points, automatic rescaling to fit tangent intercepts, and simultaneous overlays are described alternatives rather than a selected browser scope.

## Questions for David and the browser specification

1. Should the first version accept only linear demand or permit differentiable nonlinear curves?
2. Which displays should share a plot, and which need separate labeled panels?
3. How should endpoints, zero quantity, undefined elasticity, and inadmissible curves be explained?
4. What keyboard-accessible input should supplement curve drawing?

## Source and accessibility constraints

No dedicated Elasticity archive is linked on the Living Paper index.

Write fresh browser code by default; follow source-use notes (in the authoring collection) before any reuse. Keep keyboard and single-pointer alternatives for drawing/dragging, labeled numeric data and text/table equivalents for visual output, and verified focus/reflow behavior. These adaptation requirements do not imply that the original desktop UI meets current accessibility standards.

## Next task

Review the brief with David and choose the initial curve representation and display layout after The Invisible World specification.

An eventual specification must resolve model choices, student actions and feedback, input limits and failure cases, randomness, accessibility, and meaningful mathematical/classroom acceptance scenarios. No choices above have been silently implemented.
