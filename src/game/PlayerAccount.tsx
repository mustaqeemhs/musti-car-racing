
import { useEffect, useState } from "react";
import { isValidUsername, normalizeUsername } from "./username";

type GuestProfile = {
  username: string;
  balance: number;
  lastDailyReward: string;
};

const STORAGE_KEY = "musti-car-racing-guest-v1";

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function readGuest(): GuestProfile | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    const guest = JSON.parse(saved) as GuestProfile;
    if (
      typeof guest.username !== "string" ||
      typeof guest.balance !== "number" ||
      !Number.isFinite(guest.balance) ||
      guest.balance < 0
    ) {
      return null;
    }

    return guest;
  } catch {
    return null;
  }
}

export function PlayerAccount() {
  const [guest, setGuest] = useState<GuestProfile | null>(null);
  const [username, setUsername] = useState("musti");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);

  useEffect(() => {
    setGuest(readGuest());
    setReady(true);
  }, []);

  function saveGuest(next: GuestProfile) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setGuest(next);
      setError("");
      return true;
    } catch {
      setError("Could not save your guest profile. Check your browser storage settings.");
      return false;
    }
  }

  function startPlaying() {
    const name = normalizeUsername(username);
    if (!isValidUsername(name)) {
      setError("Choose a username between 3 and 18 characters.");
      return;
    }

    if (guest) {
      if (saveGuest({ ...guest, username: name })) setEditingUsername(false);
    } else {
      if (saveGuest({
        username: name,
        balance: 1000,
        lastDailyReward: "",
      })) setEditingUsername(false);
    }
  }

  function claimDailyReward() {
    if (!guest) return;

    const today = todayKey();
    if (guest.lastDailyReward === today) {
      setError("You've already claimed today's 100 Jaa'izah.");
      return;
    }

    saveGuest({
      ...guest,
      balance: guest.balance + 100,
      lastDailyReward: today,
    });
  }

  function changeUsername() {
    setUsername(guest?.username ?? "");
    setEditingUsername(true);
    setError("");
  }

  if (!ready) {
    return <section className="menu-card">Loading driver profile…</section>;
  }

  const panel: React.CSSProperties = {
    width: "100%",
    maxWidth: 480,
    margin: "0 auto",
    padding: "clamp(18px, 4vw, 30px)",
    boxSizing: "border-box",
    borderRadius: 20,
    background: "linear-gradient(155deg, #172238, #0b1220)",
    border: "1px solid #34435d",
    color: "#f8fafc",
  };

  const input: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: 14,
    marginTop: 12,
    borderRadius: 10,
    border: "1px solid #40516c",
    background: "#0d1729",
    color: "white",
    fontSize: 16,
  };

  const button: React.CSSProperties = {
    width: "100%",
    padding: 14,
    marginTop: 12,
    borderRadius: 10,
    border: "1px solid #40516c",
    background: "#164e63",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
  };

  return (
    <section style={panel}>
      <div style={{ fontSize: 32 }}>🏎️</div>
      <h2 style={{ marginBottom: 6 }}>Driver Profile</h2>
      <p style={{ color: "#aabbd3", marginTop: 0 }}>
        MUSTI CAR RACING · GUEST MODE
      </p>

      {guest && !editingUsername ? (
        <>
          <div
            style={{
              background: "#0d1729",
              border: "1px solid #34435d",
              borderRadius: 14,
              padding: 18,
              marginTop: 20,
            }}
          >
            <p style={{ marginTop: 0, color: "#aabbd3" }}>RACING AS</p>
            <h3 style={{ margin: "0 0 16px", overflowWrap: "anywhere" }}>
              {guest.username}
            </h3>
            <p style={{ color: "#aabbd3", marginBottom: 5 }}>YOUR WALLET</p>
            <div style={{ color: "#fbbf24", fontSize: 28, fontWeight: 900 }}>
              {guest.balance.toLocaleString()} Jaa'izah
            </div>
          </div>

          <button style={{ ...button, background: "#b45309" }} onClick={claimDailyReward}>
            CLAIM DAILY +100
          </button>
          <button style={button} onClick={changeUsername}>
            CHANGE USERNAME
          </button>

          <p style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.5 }}>
            Guest progress is saved in this browser on this device. Clearing
            browser data can erase it. Guest usernames are local only; reserve a
            separate globally unique online username in Multiplayer. Online
            sign-in never transfers your wallet or progression.
          </p>
        </>
      ) : (
        <>
          <p>Choose a driver name to enter the race. No email or password needed.</p>
          <label htmlFor="guest-username">Driver username</label>
          <input
            id="guest-username"
            style={input}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") startPlaying();
            }}
            placeholder="musti"
            maxLength={18}
            autoComplete="nickname"
          />
          <button style={{ ...button, background: "#ea580c" }} onClick={startPlaying}>
            {guest ? "SAVE USERNAME" : "PLAY AS GUEST"}
          </button>
          <p style={{ color: "#fbbf24" }}>New drivers start with 1,000 Jaa'izah.</p>
        </>
      )}

      {error && (
        <p role="alert" style={{ color: "#fca5a5", fontSize: 14 }}>
          {error}
        </p>
      )}
    </section>
  );
}
