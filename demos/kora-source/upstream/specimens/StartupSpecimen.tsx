import "@fontsource-variable/mona-sans";
import { createRoot } from "react-dom/client";
import { createMemoryRouter } from "react-router-dom";
import { App, createAppMemoryRouter } from "../app/App";
import { ApplicationRouteError } from "../app/ApplicationRouteError";
import type { ConnectionValue } from "../app/connection-context";
import { RuntimeRequestError } from "../lib/runtime";
import "../styles/tokens.css";
import "../styles/app.css";
import "../styles/shell.css";
import {
  IntegratedAppQualification,
  syntheticConnection,
} from "./IntegratedAppQualification";
import "./startup-specimen.css";

type Fixture =
  | "opening"
  | "delayed"
  | "access-missing"
  | "access-stale"
  | "incompatible"
  | "unavailable"
  | "invalid"
  | "route-error";

const requested = new URLSearchParams(window.location.search).get(
  "state",
) as Fixture | null;
const fixtures: Fixture[] = [
  "opening",
  "delayed",
  "access-missing",
  "access-stale",
  "incompatible",
  "unavailable",
  "invalid",
  "route-error",
];
const fixture: Fixture = requested && fixtures.includes(requested)
  ? requested
  : "opening";

const failureCodes = {
  "access-missing": "review_access_missing",
  "access-stale": "runtime_unauthorized",
  incompatible: "runtime_incompatible",
  unavailable: "runtime_unavailable",
} as const;

function BrokenQualificationRoute(): never {
  throw new Error("Synthetic route qualification failure");
}

const connection: ConnectionValue =
  fixture === "opening" || fixture === "delayed"
    ? syntheticConnection({ phase: "starting" })
    : fixture in failureCodes
      ? syntheticConnection({
          phase: "failed",
          error: new RuntimeRequestError(
            "Synthetic localhost qualification failure.",
            {
              code: failureCodes[fixture as keyof typeof failureCodes],
              requestId: "synthetic-review",
            },
          ),
        })
      : syntheticConnection();

const router =
  fixture === "route-error"
    ? createMemoryRouter(
        [
          {
            path: "*",
            element: <BrokenQualificationRoute />,
            errorElement: <ApplicationRouteError />,
          },
        ],
        { initialEntries: ["/qualification/broken"] },
      )
    : createAppMemoryRouter([
        fixture === "invalid"
          ? "/unknown/place?from=startup-review"
          : "/qualification/startup",
      ]);

createRoot(document.getElementById("root")!).render(
  <IntegratedAppQualification router={router} connection={connection}>
    <App router={router} />
  </IntegratedAppQualification>,
);
