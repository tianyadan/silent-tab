# Silent Tab Standalone Implementation Plan

**Goal:** Build `silent-tab` as a self-contained Go daemon plus Chrome MV3 extension.

**Architecture:** A minimal `net/http` Go service owns REST, SSE, WebSocket, authentication, loopback enforcement and task dispatch. The native-JavaScript extension connects to that daemon and executes fixed browser actions against permitted domains.

**Tech Stack:** Go, `net/http`, `gorilla/websocket`, Chrome Manifest V3, native JavaScript, shell scripts

**Spec:** `docs/design.md`

## Global Constraints

- Default bind address is `127.0.0.1:8765`.
- Use only `SILENT_TAB_*` environment variables and Silent Tab naming.
- Keep fixed action validation and reject arbitrary JavaScript.
- Do not add unit tests in this iteration.

## Review Focus

- Empty token must prevent startup rather than expose the WebSocket.
- Non-loopback callers must not access local or authenticated APIs by default.
- An offline extension must return a bounded structured error.
- SSE must flush meta, delta and terminal events without buffering.
- Background ChatGPT calls must not activate the current tab.

---

### Task 1: Standalone Go service

**Files:**
- Create: `go.mod`, `go.sum`, `cmd/silent-tab/main.go`
- Create: `internal/browsercontrol/types.go`, `internal/browsercontrol/broker.go`
- Create: `internal/server/config.go`, `internal/server/server.go`

**Interfaces:**
- Consumes: `SILENT_TAB_ADDR`, `SILENT_TAB_TOKEN`, `SILENT_TAB_ALLOWED_DOMAINS`, `SILENT_TAB_ALLOW_REMOTE`
- Produces: `/healthz`, `/api/browser/ws`, `/status`, `/tasks`, `/chatgpt/stream`, `/local/chatgpt`, `/local/chatgpt/stream`

- [ ] Extract the task protocol and broker without unrelated application imports.
- [ ] Implement environment config and a `net/http` server with loopback and bearer middleware.
- [ ] Implement synchronous JSON and SSE handlers, including the flat local ChatGPT request.
- [ ] Run `gofmt`, `go mod tidy`, `go test ./...`, and `go build ./cmd/silent-tab`.

### Task 2: Silent Tab extension rename and configuration

**Files:**
- Move: the extension source to `extension/`
- Modify: `extension/manifest.json`, UI HTML/JS/CSS, service worker, documentation
- Modify: `scripts/build-extension.sh`

**Interfaces:**
- Consumes: Go WebSocket endpoint and token
- Produces: `dist/extension` and `dist/silent-tab-extension.zip`

- [ ] Apply Silent Tab branding, copy and default backend URL.
- [ ] Keep ChatGPT adapter, streaming and non-active-tab behavior unchanged.
- [ ] Update build paths and run JavaScript syntax plus existing protocol checks.

### Task 3: Startup, documentation and smoke verification

**Files:**
- Create: `.env.example`, `scripts/start.sh`
- Modify: `README.md`, `.gitignore`

**Interfaces:**
- Consumes: built Go service and extension
- Produces: one-command local startup and documented curl examples

- [ ] Add self-contained token generation and environment loading.
- [ ] Document installation, API usage, silent-tab limitations and future adapter structure.
- [ ] Rename the project directory to `silent-tab` and preserve its Git repository.
- [ ] Start the daemon, verify health/status/offline response, and rerun build checks.
