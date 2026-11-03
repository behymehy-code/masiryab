import { createFileRoute } from "@tanstack/react-router";
import { Planner } from "@/components/metro/planner";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Planner />;
}
