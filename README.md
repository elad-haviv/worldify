# Worldify — AI-Native Worldbuilding & Spatio-Temporal Lore Studio

**Worldify** is a local-first worldbuilding studio unifying a Markdown knowledge wiki, force-directed knowledge graph, multi-mode cartography (Azgaar-style procedural Voronoi maps, cosmological orreries, and raster/blueprint maps), custom calendar & timeline engines, spatio-temporal entity tracking, and an integrated story studio with BYOK AI capabilities.

---

## Core Modules & Capabilities

1. **Multi-Project & Connected Worlds Cosmology (`CosmologyWorldsView`)**
   - Manage multiple independent projects (pre-loaded with *"The Shattered Crown of Aethelgard"* and *"Helios Fringe: Sector 9"*).
   - Each project contains multiple connected worlds, planes, moons, or star systems arranged on an interactive orbital/planar **Cosmological Orrery**, linked by planar rifts, orbital tethers, and wormholes.

2. **Markdown Wiki, Categories, Tags & Custom Templates (`WikiView` & `TemplatesView`)**
   - Full Markdown editor with live side-by-side preview, interactive `[[WikiLink]]` badges, hover preview cards, red-link stub creation, and bidirectional backlink indexing.
   - Customizable **Templates** with typed schema fields (`text`, `number`, `select`, `entity_ref`) plus unlimited ad-hoc custom properties per entry.
   - Inline AI tools: **Expand Lore**, **Sensory Atmosphere**, **Plot Hooks**, and **Auto-Link Mentions**.

3. **Force-Directed Knowledge Graph (`KnowledgeGraphView`)**
   - Interactive physics-simulated graph of all Wiki entries and connections (combining `[[WikiLink]]` mentions, template `entity_ref` properties, and explicit semantic edges).
   - Filter by World, Category, Connection Type, Local 1-Hop Neighborhood, or **Current Timeline Cursor**.
   - **Degrees-of-Lore Shortest Path Finder**: Find the shortest chain of relationships connecting any two entities.

4. **Multi-Mode Interactive Cartography (`MapView`)**
   - **Azgaar-Style Procedural Fantasy Map Generator**: Seeded `d3-delaunay` Voronoi mesh with Lloyd relaxation, FBM heightmaps, latitude temperature & moisture bands, Whittaker biomes, downhill rivers, habitability-scored Burgs (Capitals & Cities), and expanding Political States. Includes one-click **"Promote Burg / Realm to Wiki Entity"**.
   - **Raster / Tactical Blueprint Maps**: Upload custom map images or use built-in architectural blueprints with calibrated distance scales.
   - **Cosmological Maps**: Planar and orbital charts.
   - **Interactive Drawing & Layer Stack**: Toggle layers, place Entity Markers, draw Trade Routes / Journey Paths, draw Territorial Zones, add Typography Labels, and measure travel times with the **Distance Ruler**.

5. **Custom Calendars, Traversable Timelines & Spatio-Temporal Integration (`TimelineView` & `GlobalTimelineBar`)**
   - Design custom calendars with custom weekdays, variable-length months, intercalary festival days, historical eras, and multiple moons with automatic orbital phase calculation.
   - Scrubbing or playing the **Global Timeline Bar** dynamically morphs territorial borders (`MapZone` temporal snapshots) and animates characters/items traveling along map paths (`EntitySpatialKeyframe` interpolation).

6. **Story Studio & Continuity Engine (`StoryStudioView`)**
   - Write multi-chapter, multi-scene stories set in your project with `[[WikiLink]]` integration, a **Dedicated Story Timeline**, and a **Story Journey Map**.
   - **Live Spatio-Temporal Continuity Auditor**: Automatically validates character lifespans (birth/death ticks) and travel speeds between consecutive scenes against map scale.

7. **AI Lore Copilot (`AICopilotDrawer` & `aiService.ts`)**
   - Supports **Bring-Your-Own-Key (BYOK)** for Google Gemini, OpenAI, and Anthropic, plus a built-in **Local Context-Grounded Lore Synthesizer**.
   - Automatically injects 1-hop Knowledge Graph neighbors, current Custom Calendar date & moon phases, and Map geography into prompts, staging all proposed canon additions in one-click review cards.

---

## Getting Started

```bash
npm install
npm run dev
```
