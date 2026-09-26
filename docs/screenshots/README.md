# Screenshots of the working system

Captured on 2026-09-26 by driving the running application in headless Chromium — the whole
register → search → book → view path, against the seeded database. They are evidence for
report section 10 ("Screenshots of the working system"), not mock-ups.

| File | Screen | Requirements |
|---|---|---|
| `01-catalogue-hero.png` | Catalogue, hero and search | FR-06 |
| `02-catalogue-filtered.png` | Filtered results (Hill, ≤ ₹45,000) | FR-06 |
| `03-querytrace-expanded.png` | **QueryTrace expanded** — SQL, `$n` placeholders, bound parameters, result grid | FR-24, NFR-04, NFR-08 |
| `04-register.png` | Registration | FR-01 |
| `05-package-detail.png` | Itinerary, hotels, destinations, bookable departures | FR-07, FR-08 |
| `06-booking-flow.png` | Traveller selection and summary | FR-10 |
| `07-booking-confirmed.png` | Confirmation with seats remaining | FR-10, FR-13 |
| `08-my-bookings.png` | Bookings with payments and balance due | FR-14 |
| `09-login.png` | Sign in | FR-02 |

`03-querytrace-expanded.png` is the one to put in the report. It shows the `$1`/`$2`
placeholders left uninterpolated with the bound values listed separately — the evidence that
no user input is concatenated into a statement.

Regenerate after a UI change by starting the API and Vite, then running the capture script
described in `../project_plan.md`.
