import { useNavigate } from "react-router";
import { Button, EmptyState } from "../components/ui";

export function NotFound() {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon="✕"
      title="Nothing here"
      description="That screen does not exist."
      action={<Button onClick={() => navigate("/")}>Back to today</Button>}
    />
  );
}
