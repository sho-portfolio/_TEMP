1 · My early read — what TAP is today

TAP is changing how our metrics look, not how they're made. We're booking surface wins as if they were structural ones — polished interfaces standing in for verified processes. From the outside, we can't see the difference, which is exactly why it's gone unchallenged.

2 · What's real, and what's missing beneath it

The wins are real — automating manual domain work saves time and pulls scattered processes into one place. But that's the trap: they look like structural progress when we can't yet prove they're more than surface-deep. We're moving fast with no shared view of how the numbers are actually made — no lineage, no consistency checks, no quality controls.

3 · Why that should worry us

We have seen exactly where this leads. A view with no governed foundation isn't a dramatic failure on day one — it's just numbers nobody can vouch for, until something breaks and traces straight back to data quality and lineage. That's the road that became remediation last time. And the cost cuts both ways: we can't show what's genuinely working, and we can't catch what's quietly accumulating.

4 · What we do first

Before we build anything else, we need a single governed view of how the numbers are actually produced — the lineage, the inputs, the controls. That's the foundation the roadmap, the priorities, and every "are we being strategic" question has to sit on.





Subject: Treasury Landscape — Data Lineage & Migration Heatmap: your review needed
What it is

The Data Lineage & Migration Heatmap (the tab labelled "Lineage & Migration Heatmap") maps how Treasury's models, metrics, processes and reports connect — i.e. which data objects (market feeds, positions, assumptions, derived outputs, reports) each one consumes and produces. It also captures how automated each of those connections is on the strategic platform. It's a single picture of our data lineage and our migration state.
How to read it

Rows = entities (the models / metrics / processes you own), grouped by domain.
Columns = data objects and reports. Each object has two columns: Dir (direction) and Mat (maturity).
A filled cell at a row–column intersection means that entity uses that object.

Simple example

Your EVE Model (a row) needs Rates & Curves (a column). In that intersection:

Dir = Input (the model takes rates in). If it produced something, you'd mark Output.
Mat = how that data actually arrives: Automated (governed) if the model pulls it from the governed platform feed, Manual if someone loads it by hand. The cell colors itself red/amber/green.

The three things we're capturing (same Manual / Automated (ungoverned) / Automated (governed) scale, all auto-colored):

Automation (entity) column — is your model/process itself onboarded to the platform?
Row 4 (feed status) — is the feed itself available on the platform?
Mat cells — is this specific connection automated?

These can differ legitimately — a model can be onboarded while still pulling one feed by hand. That gap is exactly what we're trying to find.
What I need you to do — for your rows only

Filter to your domain (Domain column).
Validate the entities themselves first. The rows are an AI-generated starting point for this demo — treat them as a rough draft, not a definitive list. Add anything missing, flag for removal anything that shouldn't be there, and correct names/types/IDs that are off. Getting the right list of entities matters before the connections do.
Check the columns (data objects & reports). These are also an AI-generated starting point — flag any that are missing, wrong, mislabeled, or that should be split or merged.
Check the direction marks. The Input/Output/Both cells are pre-filled drafts — correct anything wrong, add anything missing, mark N/A where it doesn't apply.
Fill the Mat cell beside each connection with its automation maturity.
Set your entity's onboarding status in the Automation (entity) column.

How to capture structural changes

Adding/removing/splitting an entity (a row) or a data object/report (a column) is a structural change — please don't edit rows or columns directly, as that breaks the pre-filled connections. Instead, note the change (add / remove / split / rename, with a short reason) in your reply or a running list, and these will be rebuilt into a clean version. Cell-level edits (direction marks, Mat, entity status) you can make directly in the grid.
Conventions

Blank = not yet done · N/A = doesn't apply · ? = unknown. Use the dropdowns (don't free-type) so the colors and filters work. The thin Mat columns collapse via the outline button at the top-left if you want a cleaner view while checking direction.
Everything here is an AI-generated first pass for the demo — entities, columns and connections all included. If something looks wrong or missing, it probably is, and flagging it is the point.
