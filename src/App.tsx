import { useEffect, useState } from "react";
import { MapScreen } from "./screens/MapScreen";
import { RoomScreen } from "./screens/RoomScreen";
import { NameGate, loadIdentity } from "./components/NameGate";
import { landmarkByKey } from "./data/landmarks";

type Pending = { code: string; locKey: string; host: boolean };
type Route = { name: "map" } | { name: "room"; code: string; locKey: string; host: boolean };

export function App() {
  const [route, setRoute] = useState<Route>({ name: "map" });
  const [identity, setIdentity] = useState(loadIdentity());
  const [pending, setPending] = useState<Pending | null>(null);

  // Deep-link: ?room=CODE&loc=KEY means someone shared an invite.
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const code = p.get("room");
    const loc = p.get("loc");
    if (code && loc && landmarkByKey(loc)) {
      enter({ code: code.toUpperCase(), locKey: loc, host: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enter(p: Pending) {
    if (loadIdentity()) {
      setUrl(p.code, p.locKey);
      setRoute({ name: "room", code: p.code, locKey: p.locKey, host: p.host });
    } else {
      setPending(p);
    }
  }

  function leaveToMap() {
    history.replaceState(null, "", location.pathname);
    setRoute({ name: "map" });
  }

  if (pending) {
    return (
      <NameGate
        title={pending.host ? "Host a room" : "Join the room"}
        onDone={(name, avatar) => {
          setIdentity({ name, avatar });
          setUrl(pending.code, pending.locKey);
          setRoute({ name: "room", code: pending.code, locKey: pending.locKey, host: pending.host });
          setPending(null);
        }}
      />
    );
  }

  if (route.name === "room" && identity) {
    return (
      <RoomScreen
        code={route.code}
        locKey={route.locKey}
        host={route.host}
        identity={identity}
        onLeave={leaveToMap}
      />
    );
  }

  return <MapScreen onHost={(locKey, code) => enter({ code, locKey, host: true })} />;
}

function setUrl(code: string, locKey: string) {
  const p = new URLSearchParams();
  p.set("room", code);
  p.set("loc", locKey);
  history.replaceState(null, "", `${location.pathname}?${p.toString()}`);
}
