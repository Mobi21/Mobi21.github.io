import { MapPinOff } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, StateView } from "../components/primitives";

/** Keep the exact rejected destination visible; React escapes it at render time. */
export function invalidLocationLabel(pathname: string, search = "") {
  return `${pathname}${search}`;
}

export function InvalidRouteRecovery() {
  const location = useLocation();
  const navigate = useNavigate();
  const invalidLocation = invalidLocationLabel(location.pathname, location.search);

  return (
    <section className="invalid-route" aria-labelledby="invalid-route-title">
      <StateView
        state="unavailable"
        headingLevel={1}
        icon={<MapPinOff size={22} aria-hidden="true" />}
        title={<span id="invalid-route-title">This Kora location isn’t available.</span>}
        body={<>There is no page at <code>{invalidLocation}</code>. The address is preserved so you can correct it or choose a safe destination.</>}
        action={(
          <>
            <Button tone="primary" onClick={() => navigate("/life/today")}>Go to Today</Button>
            <Button onClick={() => navigate("/kora")}>Open Kora</Button>
          </>
        )}
      />
    </section>
  );
}
