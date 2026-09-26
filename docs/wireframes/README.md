# UI Wireframes

Low-fidelity wireframes for the five mid-semester screens, produced during Phase 1 and
**committed before any client code is written**, so that the git history shows design
preceding implementation (constraint C-08 in the SRS).

| File | Screen | Requirements | Use cases |
|---|---|---|---|
| `01_login.svg` | Login / Register | FR-01, FR-02 | UC-01, UC-02 |
| `02_catalogue.svg` | Package catalogue with filters | FR-06, FR-08, FR-24 | UC-03 |
| `03_package_detail.svg` | Package detail: itinerary, destinations, departures | FR-07, FR-08, FR-24 | UC-06 |
| `04_booking_flow.svg` | Booking flow with success and insufficient-seats states | FR-10 – FR-13, FR-24 | UC-07 |
| `05_my_bookings.svg` | Bookings list, detail, payments, cancel dialog | FR-14, FR-18, FR-24 | UC-08, UC-10 |

## Conventions

- **Low fidelity on purpose.** Grey blocks stand for images and text; there is no colour
  scheme, type scale or branding. These fix layout, information hierarchy and state coverage —
  not appearance. The rendered UI is plain by design (constraint C-05).
- **Red italic notes** are design rationale, not UI text. They record *why* an element is
  placed where it is and which requirement it satisfies.
- **The blue panel** is the `<QueryTrace>` component. It appears on every screen that displays
  data, collapsed by default, showing row count, execution time and a "Show SQL" control. Its
  presence in the wireframes is deliberate: FR-24 is a requirement, so it is designed in from
  the start rather than added to the UI later.
- **Failure states are drawn, not assumed.** Wireframe 04 shows the insufficient-seats state
  beside the success state, because that path is where the concurrency design becomes visible
  to the user.

## Viewing and exporting

The files are SVG and open in any browser or editor:

```bash
xdg-open docs/wireframes/02_catalogue.svg     # Linux
open      docs/wireframes/02_catalogue.svg    # macOS
```

For the report and the submission ZIP, export to PNG or PDF:

```bash
# PNG, one per wireframe
for f in docs/wireframes/*.svg; do
  rsvg-convert -f png -w 1400 "$f" -o "${f%.svg}.png"
done

# or a single PDF for 03_Design/
rsvg-convert -f pdf docs/wireframes/*.svg -o docs/wireframes/Wireframes.pdf
```

(`rsvg-convert` comes from `librsvg`; Inkscape or any browser's print-to-PDF works equally
well.)

## Screens not wireframed

Screens 6–11 — agent dashboard, reports, query catalogue, SQL console, schema viewer and audit
log — are scheduled after the mid-semester cut and will be wireframed in the week they are
built, following the same convention. See `../project_plan.md` §3.
