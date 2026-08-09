# CODAP R Sidebar

A [CODAP v3](https://codap3.concord.org) plugin that translates a learner's CODAP moves into an annotated, runnable [tidyverse](https://www.tidyverse.org) R script in real time — with an embedded [webR](https://docs.r-wasm.org/webr/latest/) console so learners can prove to themselves that the code does what CODAP did.

Built from the [CODAP plugin starter project](https://github.com/concord-consortium/codap-plugin-starter-project) for ecosystem compatibility.

- **Requirements:** `docs/brainstorms/2026-08-09-codap-r-sidebar-requirements.md`
- **Implementation plan:** `docs/plans/2026-08-09-001-feat-codap-r-sidebar-plan.md`

## Development

### Getting Started
1. Clone this repository and `cd` into the new folder.
2. Install the dependencies `npm install`.
3. Run the development server `npm start`.
4. Open [localhost:8080](http://localhost:8080) (or use port 8081 if you are already using 8080).

   It's ok if you see an error like `handleResponse: CODAP request timed out: [...]` in the console. This just means that the plugin is running outside of CODAP, so it is not receiving responses to API requests — the sidebar shows a "Not connected to CODAP" banner in this mode.

### Testing

#### Jest Tests
Jest runs three projects (see `jest.config.js`):
- `components` — React/DOM tests (jsdom)
- `engine` — pure translation/observer/model tests (node)
- `webr-corpus` — golden `.R` fixtures executed under real webR (node, serial)

```
npm test                # all projects
npm run test:components
npm run test:engine
npm run test:corpus     # serial; boots webR once
```

#### Playwright Tests
End-to-end tests drive the plugin inside hosted CODAP v3, including an axe accessibility scan.

Before running tests for the first time install the Playwright browsers:
```
npx playwright install
```

```
npm run test:playwright        # headless
npm run test:playwright:open   # with UI
```

### Testing in CODAP

There are two ways to test the plugin in CODAP:
- running it locally on https and using the deployed CODAP
- running it and CODAP locally on http

#### HTTPS
1. Start the plugin with `npm run start:secure`. You need to first set up a local http certificate if you haven't done so: https://github.com/concord-consortium/codap/blob/main/v3/README.md#run-using-https
2. Run CODAP v3 with the `di` parameter: https://codap3.concord.org/?di=https://localhost:8080/

#### HTTP
1. Start the plugin webserver `npm start` (port 8080 by default)
2. Check out the CODAP v3 source, install the dependencies, and start the dev server: https://github.com/concord-consortium/codap/blob/main/v3/README.md#initial-steps
3. Open CODAP with the plugin embedded: `http://localhost:8081/?di=http://localhost:8080`

For further information see the [CODAP Data Interactive Plugin API](https://github.com/concord-consortium/codap/wiki/CODAP-Data-Interactive-Plugin-API).
