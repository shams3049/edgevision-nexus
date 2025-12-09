# Go sidecar for Tailscale/SSH operations (stubbed Phase 2)
FROM golang:1.23 as builder
WORKDIR /app
COPY go.mod .
COPY go.sum .
COPY main.go .
RUN GOTOOLCHAIN=auto go build -o sidecar main.go

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y openssh-client curl ca-certificates && rm -rf /var/lib/apt/lists/*
# Install tailscale
RUN curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null && \
    curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list | tee /etc/apt/sources.list.d/tailscale.list && \
    apt-get update && apt-get install -y tailscale && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/sidecar /app/sidecar
EXPOSE 9000
CMD ["/app/sidecar"]
