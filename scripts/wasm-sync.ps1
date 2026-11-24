#!/usr/bin/env pwsh
<#
.SYNOPSIS
  One-shot WASM Symbol Sync, Dual-Build & Test Pipeline for VPL-HWA-Ext.
.DESCRIPTION
  Automates downloading core WASM assets (symbols.json + build.wasm.gz only),
  resolving IL2CPP Table Indices / Static Addresses / Struct Offsets into
  src/data/wasmSymbols.ts, and running tests + dual-build with compact output.
  Exit codes:
    0 = All symbols resolved (and build/tests passed unless -SkipBuild)
    2 = One or more required WASM symbols could not be resolved
    3 = Build or test failure
#>
[CmdletBinding()]
param(
  [string]$BuildUrl = '',
  [string]$SymbolsUrl = '',
  [string]$WasmUrl = '',
  [string]$GameVersion = '',
  [string]$BuildHash = '',
  [switch]$SkipDownload,
  [switch]$SkipBuild,
  [switch]$BumpPatch,
  [switch]$JsonSummary
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $RepoRoot

try {
  # Stage 1: Selective Download (symbols.json + build.wasm.gz only, skipping build.data.gz)
  if (-not $SkipDownload) {
    $dlArgs = @('hwa-sim/scripts/download-wasm-assets.mjs', '--core-wasm-only')
    if ($BuildUrl) { $dlArgs += @('--build-url', $BuildUrl) }
    if ($SymbolsUrl) { $dlArgs += @('--symbols-url', $SymbolsUrl) }
    if ($WasmUrl) { $dlArgs += @('--wasm-url', $WasmUrl) }

    if (-not $JsonSummary) {
      Write-Host '[1/3] Downloading core WASM assets (symbols.json + build.wasm.gz)...' -ForegroundColor Cyan
    }
    & node @dlArgs | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Error "Download failed with exit code $LASTEXITCODE"
      exit 3
    }
  }

  # Stage 2: Resolve WASM Symbols & Emit src/data/wasmSymbols.ts
  $resArgs = @('hwa-sim/scripts/resolve-wasm-symbols.mjs', '--json-summary')
  if ($GameVersion) { $resArgs += @('--version', $GameVersion) }
  if ($BuildHash) { $resArgs += @('--build-hash', $BuildHash) }

  if (-not $JsonSummary) {
    Write-Host '[2/3] Resolving WASM symbols & generating src/data/wasmSymbols.ts...' -ForegroundColor Cyan
  }
  $resolverOutput = & node @resArgs 2>&1
  $resolverExit = $LASTEXITCODE
  $resolverLine = ($resolverOutput | Select-Object -Last 1)

  if ($resolverExit -ne 0) {
    if ($JsonSummary) {
      Write-Output $resolverLine
    } else {
      Write-Host "[ERROR] Resolver failed (exit $resolverExit): $resolverLine" -ForegroundColor Red
    }
    exit 2
  }

  $summaryObj = $null
  try { $summaryObj = $resolverLine | ConvertFrom-Json } catch { $summaryObj = @{ ok = $true; raw = $resolverLine } }

  if (-not $JsonSummary) {
    Write-Host ("      Resolved $($summaryObj.resolvedCount) symbols (changed: $($summaryObj.changedCount), version: $($summaryObj.newVersion))") -ForegroundColor Green
  }

  # Stage 3: Optional Bump + Test + Dual-Build
  $testStatus = 'skipped'
  $buildStatus = 'skipped'

  if (-not $SkipBuild) {
    if ($BumpPatch) {
      if (-not $JsonSummary) { Write-Host '[3a/3] Bumping patch version...' -ForegroundColor Cyan }
      & node scripts/bump-version.mjs patch | Out-Null
      if ($LASTEXITCODE -ne 0) { exit 3 }
    }

    if (-not $JsonSummary) { Write-Host '[3b/3] Running test suite (npm test)...' -ForegroundColor Cyan }
    $testOut = & npm test 2>&1
    if ($LASTEXITCODE -ne 0) {
      if ($JsonSummary) {
        @{ ok = $false; stage = 'test'; error = ($testOut | Select-Object -Last 15) -join "`n" } | ConvertTo-Json -Compress
      } else {
        $testOut | Select-Object -Last 25 | Write-Host -ForegroundColor Red
      }
      exit 3
    }
    $testStatus = 'passed'

    if (-not $JsonSummary) { Write-Host '[3c/3] Running dual-build (npm run build)...' -ForegroundColor Cyan }
    $buildOut = & npm run build 2>&1
    if ($LASTEXITCODE -ne 0) {
      if ($JsonSummary) {
        @{ ok = $false; stage = 'build'; error = ($buildOut | Select-Object -Last 15) -join "`n" } | ConvertTo-Json -Compress
      } else {
        $buildOut | Select-Object -Last 25 | Write-Host -ForegroundColor Red
      }
      exit 3
    }
    $buildStatus = 'passed'
  }

  if ($JsonSummary) {
    $final = [ordered]@{
      ok = $true
      previousVersion = $summaryObj.previousVersion
      newVersion = $summaryObj.newVersion
      resolvedCount = $summaryObj.resolvedCount
      changedCount = $summaryObj.changedCount
      unresolved = $summaryObj.unresolved
      staticAddrs = $summaryObj.staticAddrs
      structOffsets = $summaryObj.structOffsets
      tests = $testStatus
      build = $buildStatus
    }
    $final | ConvertTo-Json -Depth 5 -Compress
  } else {
    Write-Host "[DONE] WASM sync complete (tests: $testStatus, build: $buildStatus)." -ForegroundColor Green
  }
  exit 0
}
finally {
  Pop-Location
}
