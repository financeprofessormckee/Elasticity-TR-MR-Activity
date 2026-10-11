# Elasticity, TR, MR

**[Click Here to Launch the Interactive Activity](https://financeprofessormckee.github.io/Elasticity-TR-MR-Activity/)**

> **Status:** v1 prototype under review with David Friedman. Not yet accessibility-audited
> for teaching release.

Connect the shape of demand to elasticity, total revenue, and marginal revenue. Students draw a demand curve with a straight-line or smoothed-curve tool, reshape it by dragging handles (or with the keyboard), and watch elasticity, total revenue, and marginal revenue respond live.

## Educator Guide: Classroom Integration

This activity is a browser adaptation of Proposal 6 in David Friedman's
[Living Paper](http://daviddfriedman.com/Living_Paper/living_paper.htm) catalog of teaching programs
([original program descriptions](http://daviddfriedman.com/Living_Paper/Program_Descriptions/program_descriptions.htm)).

### The Economic Model

* **Definitions:** elasticity e = −(dQ/dP)·(P/Q); TR = P·Q; MR = dTR/dQ.
* **Central relationship:** at a positive-price interior maximum of total revenue, elasticity is one and marginal revenue is zero. A maximum at the boundary of the drawn range need not satisfy this condition.
* **Calc tool:** elasticity at any point shown as the ratio of the two tangent segments (Friedman's textbook geometry), with the view rescaling so the tangent fits.

The full model, its adaptations from Friedman's description, and acceptance cases are in
[SPECIFICATION.md](SPECIFICATION.md). The recorded source brief is in [DESIGN.md](DESIGN.md).

### Running it locally

Open `index.html` in a browser. There's no build step, installation, or server, and
everything is local. Model tests run with Node: `node tests/model-tests.cjs`.

Run the model and DOM regression suites with Node 20 or later: `npm ci && npm test`.
The only installed dependency is for development tests; the activity has no runtime dependencies.
The detailed review, reproduced issues, and validation limits are in [REVIEW.md](REVIEW.md).

The editable “nearly unit-elastic” preset is a spline through constant-revenue points,
not the exact function P = 200/Q. Its approximation is intentional and explicitly labelled.

### License and Citation

The source code for this web application is licensed under the [MIT License](LICENSE). You
are free to use, modify, and distribute the software, consistent with the Living Paper's
request that code based on Friedman's proposals remain open source.

The economic concepts are David Friedman's. The West Texas A&M University name, seal, and
branding assets are not covered by the license and do not imply institutional endorsement
of derivative works. If you use or adapt this activity, please cite this repository.

---
*Economic concepts: [David Friedman](http://daviddfriedman.com/Living_Paper/living_paper.htm). Development: [Eric McKee](https://github.com/financeprofessormckee),
Paul and Virginia Engler College of Business, West Texas A&M University.*
