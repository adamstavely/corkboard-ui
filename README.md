# corkboard-ui

**Corkboard** is a collaborative whiteboard where a model you bring (any provider) can group notes, draft action items and build timelines. This is the frontend; the backend is [corkboard-api](https://github.com/adamstavely/corkboard-api).

Angular 21 with [Trench Coat](https://github.com/adamstavely/legendary-chainsaw) web components. Each board is a Yjs document shared live through Hocuspocus, and note text is edited with Tiptap bound to that document. Model edits can arrive the same way later without changing the canvas.

## Run it locally

Start corkboard-api first (`docker compose up -d`, then `npm run start:dev`; see its README). Then:

```bash
npm install
npm start          # http://localhost:4300; /api goes to the API on :3700 (set API_URL to change)
```

Locally, the API's development picker is on: pick who you are, or add yourself (a name and an email). Deployed (`NODE_ENV=production` on the API), people sign up and in with passkeys instead, and add more under Settings. Deploying: see the API's [operations guide](https://github.com/adamstavely/corkboard-api/blob/main/docs/OPERATIONS.md).

## Using the board

The board fills the window. Its controls float over it: the menu, title and board menu top left; facilitation, chat,
comments, who's here, notifications, Present and Share top right; the tools down the left; zoom and the map bottom
right; and the assistant's **Ask AI** launcher in the corner.

- **Tools:** pick one in the rail, or press its key: Select (V), Sticky note (N adds one at once), Text (T),
  Rectangle (R), Oval (O), Arrow (L), Pen (P), Frame (F), Comment (C). A placing tool puts its thing where you click,
  or the size you drag, then goes back to Select; Esc puts a tool down. Create has tables, links, files and the
  kanban, timeline and matrix views; note templates sit under their own button.
- **Arrows:** straight, right-angle or curved, 1–6 px, solid, dashed or dotted. A small style bar shows while the
  arrow tool is picked, and over an arrow you select.
- **What's selected:** a toolbar over it changes colour (sticky notes and shapes), shape or text size, arranges
  several, asks AI about them, tags, reacts, comments, locks, and under More duplicates, connects and deletes. It
  stays while you write in a note.
- **Pan and zoom:** scroll to pan, or hold Space (or the middle button) and drag; pinch or ⌘/Ctrl-scroll to zoom;
  ⇧1 fits everything. The ? in the bottom right lists every shortcut.
- **Undo:** ⌘/Ctrl-Z, and ⇧⌘Z or Ctrl-Y to redo; also below the rail.
- **Search:** ⌘K opens search and the board's commands; ⌘F finds on the board.
- **Assistant:** Ask AI (or ⌘.) opens Trench Coat's assistant beside the board, with starters and dictation. It
  reads the board, or the notes you've selected, and can add notes, group them into frames, draft action items and
  more; what it changed can be undone from History. An empty board offers starters at the bottom too.
- **Together:** everyone on a board sees changes as they happen, with each other's pointers and selections.
- **Workspaces:** owners invite people from Members; each invite makes a link to send them, and they join through
  it. Roles: readers see boards, commenters also comment, updaters also change them, owners also manage members,
  sharing and AI models.
- **AI models:** owners connect Claude, or any OpenAI-compatible server, from AI models.
- **Light and dark:** follows the OS until you change Dark mode in the account menu.

Changes go to the server as you make them, and it saves them. Until the server has them they're also kept in this
browser, so edits made offline survive leaving the board or reloading, and are sent when it's next open; leaving with
unsent edits asks first.

## How it fits together

- `features/board/board-doc.ts` is the board model: a Y.Doc with a map of nodes, each note holding its text as a Y.XmlFragment. Every change to the board goes through it.
- `features/board/board-connection.ts` connects the BoardDoc to the API's `/collab` socket with a Hocuspocus provider, and reports sync status. `presence.ts` handles pointers, selections and editing over the awareness channel.
- `features/board/canvas.ts` handles pan, zoom, selection and dragging. `note.ts` draws a note's text, and creates a Tiptap editor only for the note being edited.
- `core/auth.ts` remembers who you picked on the "Who are you?" page (`features/who`) in localStorage, and sends their id as the bearer token. **Switch person** in the account menu picks again.

## Commands

| Command | What it does |
|---|---|
| `npm test -- --watch=false` | Unit tests (Vitest) |
| `npm run lint:tc` | Trench Coat's template lint |
| `npm run build` | Production build |
| `npm run api:sync` | Fetch corkboard-api's `openapi.json` and regenerate the client |
| `npm run tc:vendor -- <version>` | Bring in a Trench Coat release from GitHub Packages |
