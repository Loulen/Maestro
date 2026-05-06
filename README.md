# Maestro

Visual orchestrator for deterministic Claude Code pipelines.

## Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) >= 22

## Local development

### Frontend (Vite HMR)

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server starts on `http://localhost:5173` and proxies `/ws` to the daemon at `127.0.0.1:5172`.

### Daemon

```bash
cargo run -p maestro-daemon
# or with a custom port:
MAESTRO_PORT=5172 cargo run -p maestro-daemon -- --port 5172
```

The daemon binds to `127.0.0.1:5172` by default. In dev mode it shows a placeholder page — use the Vite dev server for frontend work.

### Production build

```bash
cd frontend && npm run build && cd ..
cargo build --release -p maestro-daemon
```

The release binary embeds the frontend `dist/` via `rust-embed` and serves it at `/`.

### CLI

```bash
cargo run -p maestro-cli -- --help
```

## Build & test commands

| Purpose             | Command                                              |
| ------------------- | ---------------------------------------------------- |
| Type-check Rust     | `cargo check --workspace --all-targets`              |
| Test Rust           | `cargo test --workspace`                             |
| Lint Rust           | `cargo clippy --workspace --all-targets -- -D warnings` |
| Format Rust         | `cargo fmt --all --check`                            |
| Type-check frontend | `cd frontend && npm run typecheck`                   |
| Test frontend       | `cd frontend && npm run test`                        |
| Lint frontend       | `cd frontend && npm run lint`                        |
| Build frontend      | `cd frontend && npm run build`                       |

## Architecture

See [CONTEXT.md](CONTEXT.md) for the domain glossary and `docs/adr/` for architectural decisions.
