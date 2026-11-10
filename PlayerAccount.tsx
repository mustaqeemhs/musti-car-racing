import { useEffect, useState } from "react";
import { WALLET_KEY } from "./garageData";
import { isValidUsername, normalizeUsername } from "./username";
import {
  claimDailyServer,
  friendlyWalletError,
  loadPlayerState,
  sendAccountCode,
  signOutToNewGuest,
  subscribePlayerState,
  verifyAccountCode,
  type AuthMode,
  type ServerPlayerState,
  type WalletStatus,
} from "./serverWallet";

function readName(): string {
  try {
    const profile = JSON.parse(localStorage.getItem(WALLET_KEY) ?? "{}") as Record<string, unknown>;
    return typeof profile["username"] === "string" ? profile["username"] : "Racer";
  } catch {
    return "Racer";
  }
}

function saveName(name: string): boolean {
  try {
    const profile = JSON.parse(localStorage.getItem(WALLET_KEY) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(WALLET_KEY, JSON.stringify({ ...profile, username: name }));
    return true;
  } catch {
    return false;
  }
}

export function PlayerAccount() {
  const [state, setState] = useState<ServerPlayerState | null>(null);
  const [status, setStatus] = useState<WalletStatus>("connecting");
  const [name, setName] = useState("Racer");
  const [editingName, setEditingName] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<AuthMode | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  useEffect(() => {
    setName(readName());
    const unsubscribe = subscribePlayerState((next, nextStatus) => {
      setState(next);
      setStatus(nextStatus);
    });
    void loadPlayerState().catch(() => {});
    return unsubscribe;
  }, []);

  const resetAuth = () => {
    setMode(null);
    setEmail("");
    setCode("");
    setCodeSent(false);
  };

  async function claimDaily() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await claimDailyServer();
      setMessage("You claimed today's 100 Jaa'izah!");
    } catch (caught) {
      setError(friendlyWalletError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    if (!mode) return;
    setBusy(true);
    setError("");
    setMessage("");
    const result = await sendAccountCode(mode, email);
    setBusy(false);
    if (result.ok) {
      setCodeSent(true);
      setMessage(result.message);
    } else {
      setError(result.message);
    }
  }

  async function verifyCode() {
    if (!mode) return;
    setBusy(true);
    setError("");
    const result = await verifyAccountCode(mode, email, code);
    setBusy(false);
    if (result.ok) {
      setMessage(result.message);
      resetAuth();
    } else {
      setError(result.message);
    }
  }

  async function logOut() {
    if (!window.confirm("Log out of this account on this device? Your progress stays saved under your email.")) return;
    setBusy(true);
    setError("");
    try {
      await signOutToNewGuest();
      setMessage("Logged out. You are now playing as a new guest.");
      setName(readName());
    } catch (caught) {
      setError(friendlyWalletError(caught));
    } finally {
      setBusy(false);
    }
  }

  function changeName() {
    const next = normalizeUsername(name);
    if (!isValidUsername(next)) {
      setError("Choose a driver name between 3 and 18 characters.");
      return;
    }
    if (saveName(next)) {
      setName(next);
      setEditingName(false);
      setError("");
    } else {
      setError("Could not save your driver name. Check your browser storage settings.");
    }
  }

  const saved = state !== null && !state.isAnonymous;

  return (
    <section className="menu-card account-card">
      <div style={{ fontSize: 32 }}>🏎️</div>
      <h2 className="screen-title">Account</h2>
      <p className="note">MUSTI CAR RACING</p>

      {status === "connecting" && <p className="note">Connecting to your wallet…</p>}
      {status === "offline" && (
        <p className="note note-warn" role="alert">
          The game server is not reachable. You can still race, but buying, upgrades and daily rewards need a connection.
        </p>
      )}

      {state && (
        <>
          <div className="account-wallet">
            <span className="hud-label">YOUR WALLET</span>
            <strong>{state.balance.toLocaleString()} Jaa'izah</strong>
          </div>

          <div className="account-status">
            {saved ? (
              <p className="note pot-won">Progress saved to {state.email}. Log in with it on any device.</p>
            ) : (
              <p className="note note-warn">
                Your progress is not saved yet. If you clear your browser, you lose your cars and Jaa'izah. Save it with your email below.
              </p>
            )}
          </div>

          <button className="cta account-btn" disabled={busy || !state.dailyAvailable} onClick={() => void claimDaily()}>
            {state.dailyAvailable ? "CLAIM DAILY +100" : "DAILY REWARD CLAIMED"}
          </button>

          <div className="account-name">
            <span className="hud-label">DRIVER NAME</span>
            {editingName ? (
              <div className="account-row">
                <input value={name} maxLength={18} onChange={(event) => setName(event.target.value)} aria-label="Driver name" />
                <button className="btn-secondary" onClick={changeName}>SAVE</button>
              </div>
            ) : (
              <div className="account-row">
                <strong>{name}</strong>
                <button className="btn-secondary" onClick={() => setEditingName(true)}>CHANGE</button>
              </div>
            )}
          </div>

          {!mode && (
            <div className="account-actions">
              {!saved && (
                <button className="btn-secondary" onClick={() => { resetAuth(); setMode("save"); setError(""); setMessage(""); }}>
                  SAVE MY PROGRESS
                </button>
              )}
              <button className="btn-secondary" onClick={() => { resetAuth(); setMode("login"); setError(""); setMessage(""); }}>
                LOG IN (OTHER DEVICE)
              </button>
              {saved && (
                <button className="btn-secondary" disabled={busy} onClick={() => void logOut()}>
                  LOG OUT
                </button>
              )}
            </div>
          )}
        </>
      )}

      {mode && (
        <div className="account-auth">
          <h3 className="hud-label">{mode === "save" ? "SAVE MY PROGRESS" : "LOG IN"}</h3>
          {mode === "login" && !saved && (
            <p className="note">Logging in loads the account saved under your email and replaces the progress on this device.</p>
          )}
          <label htmlFor="account-email">Email address</label>
          <input id="account-email" type="email" autoComplete="email" value={email} disabled={codeSent} onChange={(event) => setEmail(event.target.value)} />
          {!codeSent ? (
            <button className="cta account-btn" disabled={busy || email.trim().length < 5} onClick={() => void sendCode()}>
              {busy ? "SENDING…" : "EMAIL ME A CODE"}
            </button>
          ) : (
            <>
              <label htmlFor="account-code">6-digit code</label>
              <input id="account-code" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={8} onChange={(event) => setCode(event.target.value)} />
              <button className="cta account-btn" disabled={busy || code.trim().length < 6} onClick={() => void verifyCode()}>
                {busy ? "CHECKING…" : "VERIFY CODE"}
              </button>
            </>
          )}
          <button className="ghost-btn" onClick={resetAuth}>Cancel</button>
        </div>
      )}

      {message && <p className="note pot-won" role="status">{message}</p>}
      {error && <p className="note note-warn" role="alert">{error}</p>}
    </section>
  );
}
