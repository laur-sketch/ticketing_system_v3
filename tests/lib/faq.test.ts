import { describe, expect, it } from "vitest";
import {
  googleSlidesEmbedSrc,
  isDirectVideoUrl,
  isFaqStoredFileName,
  parseFaqCatalog,
  vimeoEmbedSrc,
  youtubeEmbedSrc,
} from "@/lib/faq";

describe("FAQ helpers", () => {
  it("builds YouTube and Vimeo embed URLs", () => {
    expect(youtubeEmbedSrc("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(youtubeEmbedSrc("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(vimeoEmbedSrc("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
  });

  it("embeds Google Slides and detects direct video files", () => {
    expect(
      googleSlidesEmbedSrc("https://docs.google.com/presentation/d/abc123/edit"),
    ).toContain("/presentation/d/abc123/embed");
    expect(isDirectVideoUrl("https://cdn.example.com/guide.mp4")).toBe(true);
    expect(isDirectVideoUrl("https://example.com/notes.pdf")).toBe(false);
  });

  it("drops incomplete catalog rows", () => {
    const catalog = parseFaqCatalog({
      items: [
        { id: "1", kind: "video", title: "Walkthrough", url: "https://youtu.be/dQw4w9WgXcQ" },
        { id: "2", kind: "presentation", title: "Missing source" },
        { id: "3", kind: "presentation", title: "Deck", url: "https://example.com/deck.pdf" },
      ],
    });
    expect(catalog.items.map((item) => item.id)).toEqual(["1", "3"]);
    expect(isFaqStoredFileName("not-a-file.pdf")).toBe(false);
  });
});
