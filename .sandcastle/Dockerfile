FROM node:22-bookworm

# Install system dependencies + headless Chromium for Chrome DevTools MCP
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  chromium \
  && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH="/usr/bin/chromium"
ENV CHROMIUM_FLAGS="--no-sandbox --headless=new --disable-gpu --disable-dev-shm-usage"

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# Rename the base image's "node" user (UID 1000) to "agent".
# This keeps UID 1000 so that --userns=keep-id (Podman) and
# --user 1000:1000 (Docker) map to the correct home directory owner.
RUN usermod -d /home/agent -m -l agent node
USER agent

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude to PATH
ENV PATH="/home/agent/.local/bin:$PATH"

# Pre-install Chrome DevTools MCP and configure it for Claude Code
RUN mkdir -p /home/agent/chrome-devtools-mcp && \
    cd /home/agent/chrome-devtools-mcp && \
    npm init -y > /dev/null 2>&1 && \
    npm install chrome-devtools-mcp@0.22.0
RUN mkdir -p /home/agent/.claude && \
    echo '{"mcpServers":{"chrome-devtools":{"command":"node","args":["/home/agent/chrome-devtools-mcp/node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js","--headless","--executablePath","/usr/bin/chromium","--chromeArg=--no-sandbox","--chromeArg=--disable-gpu","--chromeArg=--disable-dev-shm-usage"]}},"permissions":{"allow":["mcp__chrome-devtools__*"]}}' \
    > /home/agent/.claude/settings.json

WORKDIR /home/agent

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
ENTRYPOINT ["sleep", "infinity"]
