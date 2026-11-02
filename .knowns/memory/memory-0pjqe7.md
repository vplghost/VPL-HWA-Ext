---
id: 0pjqe7
title: Bridge Extension Context Invalidation Handling
layer: project
category: failure
status: proposed
tags:
  - bridge,extension-context
createdAt: '2026-11-02T06:44:30.693Z'
updatedAt: '2026-11-02T06:44:30.693Z'
---

Reloading an unpacked Chrome extension invalidates content script context on open pages. Click handlers on injected UI must try-catch chrome.runtime.sendMessage and advise reloading the web page.
