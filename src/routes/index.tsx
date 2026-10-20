import { createFileRoute } from "@tanstack/react-router";
import { SketchRun } from "@/game/SketchRun";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Police Pursuit — Sketch Run" },
      { name: "description", content: "Arcade getaway racer in graphite sketch style. Dodge traffic and outrun the cops." },
      { property: "og:title", content: "Police Pursuit — Sketch Run" },
      { property: "og:description", content: "Dodge traffic and outrun the cops in a pencil-sketch supercar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SketchRun,
});
