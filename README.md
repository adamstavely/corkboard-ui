# corkboard-ui

**Corkboard** is a collaborative whiteboard where a model you bring (any provider) can group notes, draft action items and build timelines. This is the frontend; the backend is [corkboard-api](https://github.com/adamstavely/corkboard-api).

Angular 21 with [Trench Coat](https://github.com/adamstavely/legendary-chainsaw) web components. Each board is a Yjs document shared live through Hocuspocus, and note text is edited with Tiptap bound to that document. Model edits can arrive the same way later without changing the canvas.

## Run it locally

Start corkboard-api first (`docker compose up -d`, then `npm run start:dev`; see its README). Then:

```bash
npm install
npm start          # http://localhost:4300; /api goes to the API on :3700 (set API_URL to change)
```

Sign in as `ada` or `grace` with the password `corkboard`. These are test users in the local Keycloak realm.

## Using the board

- **Add a note:** double-click empty space, or use Add note in the toolbar. Double-click a note (or select it and press Enter) to write in it. Select text to format it.
- **Select:** click a note, Shift-click to add more, or drag a box on the background. ⌘/Ctrl-A selects all.
- **Move and recolour:** drag selected notes; pick a colour in the toolbar. Delete or Backspace removes them.
- **Pan and zoom:** scroll to pan, or hold Space (or the middle button) and drag. Pinch or ⌘/Ctrl-scroll to zoom.
- **Undo:** ⌘/Ctrl-Z, and ⇧⌘Z or Ctrl-Y to redo.
- **Light and dark:** follows the OS until you change it under Dark mode in the account menu.
- **Together:** everyone on a board sees changes as they happen, along with each other's pointers, which notes they have selected, who is writing where, and their carets inside a note. When more than one person is on a board, their avatars stack in its top-right corner and fan out on hover.
- **Workspaces:** admins invite people by email from Members, change roles and remove people; anyone can leave. Invites show up on the boards page when the invited person signs in with that email, and you can switch between workspaces you belong to there.
- **Search:** ⌘K, or the field in the header, finds boards by title or by what their notes say.

Changes go to the server as you make them, and it saves them. Offline edits are kept and sent when you reconnect.

## How it fits together

- `features/board/board-doc.ts` is the board model: a Y.Doc with a map of nodes, each note holding its text as a Y.XmlFragment. Every change to the board goes through it.
- `features/board/board-connection.ts` connects the BoardDoc to the API's `/collab` socket with a Hocuspocus provider, and reports sync status. `presence.ts` handles pointers, selections and editing over the awareness channel.
- `features/board/canvas.ts` handles pan, zoom, selection and dragging. `note.ts` draws a note's text, and creates a Tiptap editor only for the note being edited.
- `core/auth.ts` handles OIDC sign-in with authorization code + PKCE (oidc-client-ts). Settings come from `/config.json`, which the Docker image writes from `OIDC_AUTHORITY` and `OIDC_CLIENT_ID`.

## Commands

| Command | What it does |
|---|---|
| `npm test -- --watch=false` | Unit tests (Vitest) |
| `npm run lint:tc` | Trench Coat's template lint |
| `npm run build` | Production build |
| `npm run api:sync` | Fetch corkboard-api's `openapi.json` and regenerate the client |
| `npm run tc:vendor -- <version>` | Bring in a Trench Coat release from GitHub Packages |
