import tls from "node:tls";

let applied = false;

function isTruthy(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/**
 * Node bundles its own CA list and ignores the operating-system trust store.
 * That breaks two common deployments with "unable to verify the first
 * certificate": a TLS-inspecting egress proxy (whose leaf is signed by a
 * locally-installed corporate/proxy CA) and a host that relies on a
 * system-installed intermediate. Merging the OS trust store into Node's
 * defaults restores trust without weakening verification — public CAs (VTOP's
 * real certificate) keep validating against the bundled roots. Idempotent.
 *
 * The runtime CA APIs require Node >= 22.15; on older runtimes this is a no-op
 * and trust falls back to the NODE_EXTRA_CA_CERTS environment variable.
 */
export function applySystemCATrust(): void {
  if (applied) return;
  applied = true;

  // Last-resort opt-out for hosts behind a TLS-inspecting proxy whose CA is
  // not installed in the OS trust store (so the merge below cannot help). This
  // disables certificate verification process-wide and exposes the connection
  // to interception — only enable it on a network you trust.
  if (isTruthy(process.env.VTOP_INSECURE_TLS)) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    console.error(
      "VtopMCP: VTOP_INSECURE_TLS is set — TLS certificate verification is DISABLED.",
    );
    return;
  }

  if (
    typeof tls.getCACertificates !== "function" ||
    typeof tls.setDefaultCACertificates !== "function"
  ) {
    return;
  }

  try {
    tls.setDefaultCACertificates([
      ...tls.getCACertificates("default"),
      ...tls.getCACertificates("system"),
    ]);
  } catch (err) {
    console.error("VtopMCP: could not merge system CA certificates:", err);
  }
}
