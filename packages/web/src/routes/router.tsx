import { createBrowserRouter } from "react-router";
import { AppShell } from "../components/layout";
import { DevUI } from "../dev/DevUI";
import { AlbumDetail } from "./AlbumDetail";
import { AlbumNew } from "./AlbumNew";
import { Albums } from "./Albums";
import { Epics } from "./Epics";
import { Login } from "./Login";
import { NotFound } from "./NotFound";
import { Reports } from "./Reports";
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
    children: [
      { index: true, element: <Tasks /> },
      { path: "week", element: <Week /> },
      { path: "albums", element: <Albums /> },
      { path: "albums/new", element: <AlbumNew /> },
      // Placeholder until A-08 — A-06's cards have to lead somewhere.
      { path: "albums/:id", element: <AlbumDetail /> },
      { path: "epics", element: <Epics /> },
      { path: "reports", element: <Reports /> },
      { path: "*", element: <NotFound /> },
    ],
  },
  { path: "/login", element: <Login /> },
  { path: "/dev/ui", element: <DevUI /> },
]);
