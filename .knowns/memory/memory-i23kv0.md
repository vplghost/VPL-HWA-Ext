---
id: i23kv0
title: Unity WebGL WASM Table Hook for Cipher Decryption
layer: project
category: pattern
status: proposed
tags:
  - wasm
  - draft
  - hook
createdAt: '2026-11-23T20:25:51.885Z'
updatedAt: '2026-11-23T20:25:51.885Z'
---

When RPC payloads are encrypted with session-bound Stream XOR Ciphers, hooking the cipher decryption function at WebAssembly Table Index 330804 (BaseXORCipher_decrypt) in Unity WebGL allows direct retrieval of plaintext UTF-16 System.String from memory heap, bypassing dynamic session key requirements. See @doc/architecture/legend-draft-system and @task-VHE-VAGQQH.
