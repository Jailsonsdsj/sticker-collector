import { createBrowserRouter } from "react-router";
import { AppShell } from "../components/layout";
import { RouteCrash } from "../components/RouteCrash";
import { DevUI } from "../dev/DevUI";
import { AlbumDetail } from "./AlbumDetail";
import { AlbumNew } from "./AlbumNew";
import { Albums } from "./Albums";
import { Epics } from "./Epics";
import { Login } from "./Login";
import { NotFound } from "./NotFound";
import { PuzzleNew } from "./PuzzleNew";
import { PuzzleView } from "./PuzzleView";
import { Reports } from "./Reports";
import { Settings } from "./Settings";
import { Tasks } from "./Tasks";
import { Week } from "./Week";

/**
 * One file per screen, all of them inside AppShell — so no screen can be built
 * outside the correct frame. /dev/ui deliberately sits outside it: the kitchen
 * sink is a document, not a tab.
 */
export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    // The router catches a route crash before any React boundary above it can,
    // and its default fallback prints a stack trace at the user. Every top-level
    // route gets ours instead. AppShell's own boundary still handles the tab
    // screens — it is nested closer to the throw — so this one covers AppShell
    // itself and anything the router does before a screen renders.
    errorElement: <RouteCrash />,
    children: [
      { index: true, element: <Tasks /> },
      { path: "week", element: <Week /> },
      { path: "albums", element: <Albums /> },
      { path: "albums/new", element: <AlbumNew /> },
      // Placeholder until A-08 — A-06's cards have to lead somewhere.
      { path: "albums/:id", element: <AlbumDetail /> },
      { path: "puzzles/new", element: <PuzzleNew /> },
      { path: "puzzles/:id", element: <PuzzleView /> },
      { path: "epics", element: <Epics /> },
      { path: "reports", element: <Reports /> },
      { path: "settings", element: <Settings /> },
      { path: "*", element: <NotFound /> },
    ],
  },
  // Outside the shell, so with no errorElement these two had no fallback
  // at all beyond the router's stack-trace page.
  { path: "/login", element: <Login />, errorElement: <RouteCrash /> },
  { path: "/dev/ui", element: <DevUI />, errorElement: <RouteCrash /> },
]);
