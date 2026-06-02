# FarmStack

FarmStack is an offline-first farm shop management app for farmers, vendors, and agro-business users. It focuses on fast, simple workflows for products, purchases, sales, suppliers, customers, stock, and GST-ready data. The app is built with Next.js and a local SQLite-backed data layer, with a planned TallyPrime sync flow.

## What is in this repo

- React + TypeScript UI (Next.js App Router)
- Local-first data layer (SQLite-backed)
- Modules for products, customers, suppliers, purchases, and sales
- TallyPrime integration planning docs

## Tech stack

- Next.js (App Router)
- React + TypeScript
- Tailwind CSS
- SQLite (local, offline-first)
- TallyPrime integration (planned, via local HTTP)

## Getting started

1. Install dependencies:
   - npm install

2. Run the dev server:
   - npm run dev

3. Open the app:
   - http://localhost:3000

## Scripts

- npm run dev: start the dev server
- npm run build: build for production
- npm run start: start the production server
- npm run lint: run eslint

## Project structure

- app/: Next.js routes and API handlers
- components/: shared UI components
- hooks/: data and UI hooks
- lib/: database and domain utilities
- src/services/: API clients
- types/: shared TypeScript types
- test-data/: sample CSV files

## Data and offline behavior

The app is designed to work offline with a local SQLite database. Data sync is planned for later. See the SQLite backend summary for details.

- SQLITE_BACKEND_COMPLETE.md

## TallyPrime integration

TallyPrime sync is planned and designed to run through a local HTTP server. The integration plan is documented here:

- TALLY_INTEGRATION_PLAN.md
- TALLY.md

## Notes

- Tally requests must be sent from a backend layer, not directly from the browser.
- Keep the UI minimal and accessible for non-technical users.

## License

Proprietary. All rights reserved.
