---
id: doc-fbe34e0607fd53cd19f5633d33b06da4
title: 'HWA Control Panel Deployment & Local Testing Guide'
description: 'Local/LAN Node dev testing, Docker, Jenkins build & push pipeline, and Kubernetes PV/PVC deployment for HWA-ControlPanel'
createdAt: '2026-11-28T15:40:38.998Z'
updatedAt: '2026-11-28T15:47:06.773Z'
tags:
  - control-panel,docker,jenkins,kubernetes,local-dev
---

# HWA Control Panel Deployment & Local Testing Guide

## 1. Local & LAN Testing (No Docker)
1. Install deps once: `npm --prefix HWA-ControlPanel install`\n2. Run server: `npm run cp:dev` (or `node HWA-ControlPanel/src/server.mjs`).
3. Server binds `0.0.0.0:8080`, prints both **Local** (`http://localhost:8080`) and **LAN IP** (`http://192.168.x.x:8080`), and stores SQLite at `HWA-ControlPanel/data/control-panel.db` (gitignored).
4. Enter the LAN URL in the Extension Control Panel tab, click Check Connection, scan the QR from your phone on the same Wi-Fi, and enter the 6-digit OTP.

## 2. Jenkins Docker Build & Push Pipeline
- Pipeline file: `HWA-ControlPanel/Jenkinsfile` (next to `HWA-ControlPanel/Dockerfile`).
- Required Jenkins configuration (never hardcode secrets in Git):
  - **Credentials**: Username with password credential ID (default `hwa-registry-creds`, override via `HWA_REGISTRY_CREDENTIALS_ID`).
  - **Environment**: `HWA_REGISTRY_URL` (e.g. `registry.example.com`), `HWA_CP_IMAGE_NAME` (e.g. `hwa/hwa-control-panel`).
- Stages: `Checkout` -> `Docker Build` -> `Docker Push` (`--password-stdin`, tags commit short SHA + optional `latest`) -> `post { always { docker logout } }`.

## 3. Kubernetes Deployment (PV/PVC)
- Manifests in `HWA-ControlPanel/k8s/`: `pvc.yaml`, `deployment.yaml`, `service.yaml`, `ingress.yaml`.
- `deployment.yaml` uses `replicas: 1` and `strategy: { type: Recreate }` for safe single-writer SQLite access on `ReadWriteOnce` PVC mounted at `/data`.
- Probes: `/healthz` (liveness) and `/readyz` (readiness, verifies SQLite).
- Environment variables: `HOST` (`0.0.0.0`), `PORT` (`8080`), `DATA_DIR` (`/data`), `COOKIE_SECURE` (`auto`), optional `BOOTSTRAP_KEY` (via K8s Secret).

## 4. Mobile WebView Usage (CP-03)
- Open the Extension **Control Panel** tab (`📱`), enter your HTTPS or LAN endpoint, click **Check Connection**, and enable the bridge.
- Scan the QR code once on your mobile phone (pre-fills `?guid=...`), enter the 6-digit OTP shown on the Extension, and tap **Connect & Remember (1 Year)** to store the `hwa_cp_session` HttpOnly cookie.
- The mobile dashboard is **on-demand**: tap **Refresh** to request a fresh snapshot (WebSocket `/ws/web` opens only while waiting for Refresh or an emergency command result, then closes automatically).
- **Emergency Recall All Gatherers** uses 2-tap confirmation within 5 seconds. Use **Revoke Sessions** in the Extension tab anytime to invalidate all mobile cookies immediately.
