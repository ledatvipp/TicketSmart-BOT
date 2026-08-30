---
title: "Minecraft card visual research and plan review"
date: 2026-08-30
status: ready
---

# Minecraft card visual research and plan review

## Research checked

- [Official Minecraft snapshot 25w17a](https://www.minecraft.net/en-us/article/minecraft-snapshot-25w17a): HUD reference; the article describes experience/locator bars sharing the lower HUD area. Use that hierarchy as inspiration, not a request to implement locator gameplay.
- [Tatsu leveling](https://tatsu.gg/leveling): rank cards highlight member progress, ranking and customization. Retain clear profile/progression hierarchy without introducing Tatsu's global score or other mechanics.
- [Google Fonts Press Start 2P](https://github.com/google/fonts/tree/main/ofl/pressstart2p), [font description](https://raw.githubusercontent.com/google/fonts/main/ofl/pressstart2p/DESCRIPTION.en_us.html), [OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/pressstart2p/OFL.txt): upstream font and license available. Bundle unmodified font/license; use Noto Sans for Vietnamese instead of assuming pixel-font coverage.

The procedural forest/night scene, grass/diamond decoration, square inventory frame and segmented lime bar are design choices for this project, not copied assets or claims about these references. Keep the user-configurable accent on framing/details without sacrificing familiar lime progression.

## Self-review

READY: one visual phase, exclusive ownership, no new npm dependency or gameplay/security contract. Main risks are pixel-font text width, Vietnamese glyph coverage, foreground contrast and excess SVG work; mitigated by ASCII-only pixel labels, retained Noto Sans, clipped text zones and bounded geometry. Test actual raster output including long names and 0%/100% XP, plus the existing security/failure suite; do not equate passing markup assertions with visual quality. No blocking product choices.
