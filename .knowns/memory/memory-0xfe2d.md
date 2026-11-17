---
id: 0xfe2d
title: Legend Draft candidate decoding via session prefix and 14-byte stream cipher
layer: project
category: pattern
status: proposed
tags:
  - draft
  - legend-draft
  - cryptanalysis
createdAt: '2026-11-17T11:37:12.099Z'
updatedAt: '2026-11-17T11:37:12.099Z'
---

In Legend Draft (randomDraft), draft payload uses a 14-byte repeating XOR stream cipher. Comparing ciphertexts across matches yields KeyDelta14 = Target[28..41] ^ Ref[28..41]. Ground-truth sessions are indexed by 8-byte ciphertext prefix in src/utils/legendDraftDecoder.ts to provide instant 100% exact candidates without WebAssembly memory scan delays. Cite: @doc/architecture/legend-draft-system
