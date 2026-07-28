import { deriveAuthKey, type LoginResponse, type SaltResponse } from "@sticker-collector/shared";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { Button, Input } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { setToken } from "../lib/session";

/**
 * The passphrase never leaves the browser.
 *
 * The server hands out the salt and the iteration count, PBKDF2 runs here, and
 * only the derived key is posted (architecture.md §0.2). That is not merely a
 * privacy nicety: 600k iterations would blow the Worker's 10 ms CPU budget, so
 * stretching client-side is what makes the security property affordable.
 */
export function Login() {
  const navigate = useNavigate();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { salt, iterations } = await api<SaltResponse>("/api/auth/salt");
      const authKey = await deriveAuthKey(passphrase, salt, iterations);
      const { token } = await api<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: { authKey },
      });
      setToken(token);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "Too many attempts. Wait a few minutes."
          : "That passphrase does not match.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <h1 className="mb-2 font-display text-5xl leading-display tracking-display uppercase italic">
        Sticker
        <br />
        Collector
      </h1>
      <p className="mb-8 font-body text-md text-ink-secondary">
        One player, one wallet. Finish your work, earn the coins, fill the album.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Input
          id="passphrase"
          type="password"
          label="Passphrase"
          autoComplete="current-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          error={error ?? undefined}
        />
        <Button type="submit" tone="lime" block loading={busy} disabled={!passphrase.trim()}>
          Unlock
        </Button>
      </form>
    </main>
  );
}
