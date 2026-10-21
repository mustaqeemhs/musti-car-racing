import { createFileRoute } from "@tanstack/react-router";
import { SketchRun } from "@/game/SketchRun";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Musti Car Racing" },
      { name: "description", content: "Premium arcade pursuit racer: dodge traffic, drift, hit nitro and outrun the cops." },
      { property: "og:title", content: "Musti Car Racing" },
      { property: "og:description", content: "Drift, boost and outrun the cops in a white supercar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SketchRun,
});
