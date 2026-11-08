---
id: doc-1fe6098555a5c16dd2ea60ebedf88dbf
title: Hero Troop Capacity Model
description: Empirical hero troop capacity formulas, diminishing returns brackets, and power correlation from TroopSize.xlsx
createdAt: '2026-11-08T15:20:01.281Z'
updatedAt: '2026-11-08T16:39:16.741Z'
tags:
  - troops,capacity,heroes,power,model
---

# Hero Troop Capacity Model

## Evidence and scope

Data source: `temp/tracking-data/TroopSize.xlsx` provided by user on 2026-11-08.
The dataset records 62 heroes across Level 1–80, Star 1–6, Equipment rank White to Orange, Power 5,844 to 36,894, and Troop sizes 623 to 812.

Existing architectural documentation (@doc/api/world-map-rpc-contracts) previously noted:
> "There is still no verified executable power/level capacity curve; the exposed squadSetting coefficients are not fitted or treated as such."

The analysis below resolves that gap with an empirical mathematical model derived directly from the ground-truth observations.

## Determinant analysis: Power as direct driver

The dataset proves that individual hero troop capacity is strictly determined by **Hero Power**:

1. **Strict Monotonicity:** Across all 62 heroes sorted by Power, Troop size is 100% strictly non-decreasing. There is zero overlap across all 48 distinct troop size values.
2. **Independence from Level / Star / Rank:**
   - Jhu (Level 70, 1★, Blue+, Power 12,236) has Troop Size 715, matching Judge (Level 50, 3★, Blue++, Power 12,212) at Troop Size 715.
   - Iris (Level 80, 2★, Purple+++, Power 23,242) has Troop Size 767, matching Somna (Level 75, 5★, Purple+, Power 23,170) at Troop Size 767.
   - Galahad (Level 70, 6★, Purple+, Power 31,637) has Troop Size 797, while Dante (Level 80, 4★, Orange, Power 36,894) has Troop Size 812.
   - White-rank heroes (Helios, Soleil at 7,287) reach Troop Size 656, while Green-rank heroes with lower power (Astrid at 6,994) have Troop Size 648.
3. **Conclusion:** Level, Star, and Equipment rank only influence Troop Size through their contribution to the hero's total **Power**.

## Rounding methodology: Floor (Round-Down / Ground)

Statistical regression comparing standard arithmetic rounding (`round`) versus floor rounding (`floor`, Vietnamese "ground"):
- **Arithmetic `round`:** 27/62 exact matches (43.5%), MAE = 0.66 troop, Max Error = 3.0 troops.
- **Floor `floor`:** **52/62 exact matches (83.9%)**, MAE = **0.21 troop**, Max Error = **2.0 troops** (100% within $\pm 2$ troops).

This confirms the game engine employs **floor / ground** (`math.floor` or integer truncation) rather than standard arithmetic rounding.

## General formulas

The progression follows concave diminishing marginal returns. Below are the two refined models using floor rounding:

### Model A: Refined Floor Hybrid Model (Recommended)

Combines the highly linear early-game tier with a concave square-root curve for mid-game and a high-tier stabilization:

$$\text{TroopSize}(\text{Power}) = \begin{cases} \max\left(623, \left\lfloor 469.5 + \dfrac{\text{Power}}{39.0} \right\rfloor\right) & \text{if } \text{Power} < 9,000 \\ \left\lfloor 578.4 + 1.24 \times \sqrt{\text{Power}} \right\rfloor & \text{if } 9,000 \le \text{Power} < 30,000 \\ \left\lfloor 695.0 + \dfrac{\text{Power}}{315.0} \right\rfloor & \text{if } \text{Power} \ge 30,000 \end{cases}$$

- **Baseline Floor:** Heroes at Level 1–2 (Power ~5,844–5,872) are pinned at a minimum capacity of **623**.
- **Bracket 1 (Early Power < 9,000):** +1 troop per ~39.0 Power (~25.6 troops per 1k Power). **23 of 26 heroes** in the active range (6,669–8,692) match with 0 error!
- **Bracket 2 (Mid Power 9,000–30,000):** Square-root diminishing curve. **25 of 30 heroes** match with 0 error!
- **Bracket 3 (High Power >= 30,000):** High-tier linear stabilization (+1 troop per ~315 Power).

**Performance metrics across all 62 heroes:**
- Exact Match (diff = 0): **52 / 62 heroes (83.9%)**
- Within $\pm 1$ troop: **59 / 62 heroes (95.2%)**
- Within $\pm 2$ troops: **62 / 62 heroes (100.0%)**
- Mean Absolute Error (MAE): **0.210 troop**
- Max Absolute Error: **2.0 troops**

### Model B: Pure Linear 3-Bracket Floor Model

For engines or shaders where square-root computations are avoided:

$$\text{TroopSize}(\text{Power}) = \begin{cases} \max\left(623, \left\lfloor 469.5 + \dfrac{\text{Power}}{39.0} \right\rfloor\right) & \text{if } \text{Power} < 9,000 \\ \left\lfloor 650.5 + \dfrac{\text{Power}}{188.0} \right\rfloor & \text{if } 9,000 \le \text{Power} < 18,000 \\ \left\lfloor 682.5 + \dfrac{\text{Power}}{275.0} \right\rfloor & \text{if } \text{Power} \ge 18,000 \end{cases}$$

**Performance metrics:**
- Exact Match: **47 / 62 heroes (75.8%)**
- Within $\pm 1$ troop: **59 / 62 heroes (95.2%)**
- Mean Absolute Error (MAE): **0.323 troop**

## Squad capacity integration

Total march troop capacity for a 5-hero lineup:

$$\text{TotalCapacity} = \text{BaseSquad} + \sum_{i=1}^{5} \text{TroopSize}(\text{Power}_i)$$

- `BaseSquad`: Fixed account/rally base (default `950`, configurable in Settings).
- `TroopSize`: Hero capacity predicted by the model above (or default fallback `600` when power is unobserved).


## Implementation: Safe Margin (-2) for Automatic Lineups

To guarantee that automatic troop allocation never exceeds game capacity constraints, the runtime implementation in extension/experimental-data.js applies a **-2 troop safe margin**:

\text{SafeCapacity}(\text{Power}) = \max(1, \text{TroopSize}(\text{Power}) - 2)

Because the empirical model's maximum positive delta across all 62 heroes was +1 troop, subtracting 2 units guarantees:
\forall \text{Hero } h, \quad \text{SafeCapacity}(\text{Power}_h) \le \text{ActualCapacity}_h

### Runtime Precedence Hierarchy

For any lineup without a custom maxTroops setting:
1. **Explicit Server Capacity:** hero.troopCapacity if provided directly by game RPC.
2. **Inferred Ground Truth:** Solved linearly from past multi-lineup battle observations via Gaussian elimination.
3. **Power Curve Formula:** estimateHeroTroopCapacity(hero.power) with the -2 safe margin.
4. **Fallback Default:** settings.defaultHero (default 600) if hero power is unavailable or invalid (< 1000).

## Representative validation sample (Model A)

| Hero | Level | Star | Rank | Power | Actual Troop | Model A Pred | Delta |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Elmir / Jorgen | 1 | 1★ | White | 5,844 | 623 | 623 | 0 (Exact) |
| Lars | 2 | 1★ | White | 5,872 | 623 | 623 | 0 (Exact) |
| Krista | 2 | 2★ | White | 6,240 | 631 | 629 | -2 |
| Kendle | 31 | 1★ | White | 6,669 | 640 | 640 | 0 (Exact) |
| Orion / Lian / Lilith | 31 | 1★ | White | 6,853 | 645 | 645 | 0 (Exact) |
| Astrid and Lucas | 31 | 1★ | Green | 6,994 | 648 | 648 | 0 (Exact) |
| Helios / Soleil | 31 | 2★ | White | 7,287 | 656 | 656 | 0 (Exact) |
| Faceless | 35 | 1★ | Green+ | 7,521 | 662 | 662 | 0 (Exact) |
| Tristan | 31 | 1★ | Green+ | 7,622 | 665 | 664 | -1 |
| Phobos | 31 | 2★ | Green+ | 8,026 | 675 | 675 | 0 (Exact) |
| Fox | 30 | 2★ | Blue | 8,472 | 686 | 686 | 0 (Exact) |
| Wodryn | 31 | 3★ | Blue | 8,657 | 690 | 691 | +1 |
| Dorian | 40 | 1★ | Blue | 8,692 | 691 | 692 | +1 |
| Eva | 31 | 4★ | Green+ | 9,027 | 697 | 696 | -1 |
| Satori | 31 | 4★ | Blue | 9,196 | 699 | 697 | -2 |
| Heidi | 40 | 3★ | Blue+ | 10,138 | 703 | 703 | 0 (Exact) |
| Folio | 50 | 3★ | Blue+ | 10,829 | 707 | 707 | 0 (Exact) |
| Artemis | 55 | 3★ | Blue+ | 11,885 | 713 | 713 | 0 (Exact) |
| Jhu / Judge | 70/50 | 1★/3★ | Blue+ | 12,236 | 715 | 715 | 0 (Exact) |
| Mushy and Shroom | 70 | 3★ | Purple | 13,842 | 724 | 724 | 0 (Exact) |
| Aurora / Mojo | 70 | 3★ | Purple | 15,018 | 730 | 730 | 0 (Exact) |
| Alvanor | 75 | 4★ | Purple | 16,347 | 737 | 736 | -1 |
| Maya | 75 | 4★ | Purple | 17,105 | 740 | 740 | 0 (Exact) |
| Polaris | 75 | 4★ | Purple | 17,492 | 742 | 742 | 0 (Exact) |
| Thea | 70 | 4★ | Purple | 19,155 | 750 | 750 | 0 (Exact) |
| Byrna | 75 | 4★ | Purple+ | 20,843 | 757 | 757 | 0 (Exact) |
| Corvus | 80 | 3★ | Purple+ | 21,061 | 758 | 758 | 0 (Exact) |
| Astaroth | 75 | 5★ | Purple+ | 21,426 | 760 | 759 | -1 |
| Electra von Grave | 75 | 5★ | Purple | 21,739 | 761 | 761 | 0 (Exact) |
| Octavia | 80 | 3★ | Purple++ | 22,476 | 764 | 764 | 0 (Exact) |
| Iris / Somna | 80/75 | 2★/5★ | Purple+ | 23,242 | 767 | 767 | 0 (Exact) |
| Leonel | 75 | 5★ | Purple++ | 28,744 | 787 | 788 | +1 |
| Galahad | 70 | 6★ | Purple+ | 31,637 | 797 | 795 | -2 |
| Dante | 80 | 4★ | Orange | 36,894 | 812 | 812 | 0 (Exact) |
