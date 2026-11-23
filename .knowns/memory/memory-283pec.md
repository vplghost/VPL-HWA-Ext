---
id: 283pec
title: Windows Native Messaging host stdio must never emit console.log to stdout
layer: project
category: failure
status: proposed
tags:
  - native-messaging,windows,debug,failure
createdAt: '2026-11-23T01:31:59.645Z'
updatedAt: '2026-11-23T01:31:59.645Z'
---

Chrome Native Messaging protocol uses binary 32-bit LE length-prefixed frames on stdin/stdout. Node.js process.stdout must never be used for logging or diagnostics because unformatted text corrupts the binary stream and triggers immediate host disconnection. Use process.stderr or dedicated file logging. Cite: @doc/architecture/native-messaging-debug-bridge-and-wasm-call-chaining
