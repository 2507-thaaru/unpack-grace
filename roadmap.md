# Settlement Unpacking Agent — frontend

- [x] Verify live backend API
- [x] Design system tokens (dark-first + light toggle) in `src/styles.css`
- [x] Server proxy route `/api/proxy/$` to the pipeline API
- [x] Typed API client + query options (`src/lib/api.ts`)
- [x] 21st.dev Hero component
- [x] App shell (sidebar, header, theme toggle, re-run pipeline)
- [x] Landing page `/`
- [x] Input Data explorer `/input-data`
- [x] How It Works `/how-it-works`
- [x] Results Dashboard `/dashboard`
- [x] Route head metadata on every page

## Notes
- Tunnel URL is ephemeral; override with the `SETTLEMENT_API_URL` env var when it changes.
