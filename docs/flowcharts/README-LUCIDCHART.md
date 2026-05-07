# Using this flowchart in Lucidchart

Lucidchart does **not** expose a public “generate diagram from code” API for this repo. These files are built so you can **bring the chart into Lucidchart** on your machine and keep working there.

## What’s in this folder

| File | Purpose |
|------|---------|
| `ticket-system-v3-main-flow.mmd` | **Mermaid** source — edit this, then run `npm run docs:flowchart` to rebuild images |
| `ticket-system-v3-main-flow.svg` | **Vector** download — best quality for slides and zoom |
| `ticket-system-v3-main-flow.png` | **Raster** download — easy to insert into Lucidchart as an image |

## Option A — Insert as image (fastest)

1. Download **`ticket-system-v3-main-flow.png`** or **`.svg`** from this folder.
2. Open your Lucidchart document.
3. Use **Insert → Image** (or drag the file onto the canvas).
4. Optionally trace or rebuild shapes on top if you want editable Lucidchart shapes.

## Option B — Third-party diagram.net then Lucidchart

1. Open [diagrams.net](https://app.diagrams.net/) (draw.io).
2. **Arrange → Insert → Advanced → Mermaid** (if available in your build), or rebuild manually using the PNG/SVG as a backdrop.
3. Export from diagrams.net in a format Lucidchart accepts (**File → Export as**), then in Lucidchart use **Import** if your plan supports that format (often **Visio .vsdx** or image).

## Regenerate after editing the `.mmd` file

From the project root:

```bash
npm run docs:flowchart
```

Requires devDependency `@mermaid-js/mermaid-cli` (installed with `npm install`).
