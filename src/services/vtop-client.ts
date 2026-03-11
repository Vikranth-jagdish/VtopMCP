import axios, { AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

const DEFAULT_BASE_URL = "https://vtopcc.vit.ac.in";

export class VtopClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private authenticated = false;
  private csrfToken: string | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.VTOP_BASE_URL ?? DEFAULT_BASE_URL;

    const jar = new CookieJar();
    this.client = wrapper(
      axios.create({
        jar,
        baseURL: this.baseUrl,
        withCredentials: true,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        maxRedirects: 5,
        timeout: 30_000,
      })
    );
  }

  get isAuthenticated(): boolean {
    return this.authenticated;
  }

  /** Initialize session by loading the login page to get cookies */
  private async initSession(): Promise<void> {
    const res = await this.client.get("/vtop/open/page");
    const html: string = res.data;

    // Extract CSRF token if present (commonly in a hidden input or meta tag)
    const csrfMatch = html.match(
      /name="_csrf"\s+(?:content|value)="([^"]+)"/
    );
    if (csrfMatch) {
      this.csrfToken = csrfMatch[1];
    }
  }

  /** Fetch the captcha image as a base64-encoded string */
  async getCaptcha(): Promise<string> {
    // Always init a fresh session before getting captcha
    await this.initSession();

    const res = await this.client.get("/vtop/captcha", {
      responseType: "arraybuffer",
    });

    const base64 = Buffer.from(res.data as ArrayBuffer).toString("base64");
    const contentType =
      (res.headers["content-type"] as string) ?? "image/png";
    return `data:${contentType};base64,${base64}`;
  }

  /** Login to VTOP with credentials and captcha solution */
  async login(
    username: string,
    password: string,
    captcha: string
  ): Promise<{ success: boolean; message: string }> {
    const formData = new URLSearchParams();
    formData.append("uname", username);
    formData.append("passwd", password);
    formData.append("captchaCheck", captcha);
    if (this.csrfToken) {
      formData.append("_csrf", this.csrfToken);
    }

    try {
      const res = await this.client.post("/vtop/doLogin", formData, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      const html: string = res.data;

      // Check for common login failure indicators
      if (
        html.includes("Invalid") ||
        html.includes("invalid") ||
        html.includes("captcha") ||
        html.includes("CAPTCHA")
      ) {
        this.authenticated = false;
        return {
          success: false,
          message:
            "Login failed. Check credentials and captcha. You may need to get a new captcha and retry.",
        };
      }

      this.authenticated = true;
      return { success: true, message: "Successfully logged in to VTOP." };
    } catch (err: unknown) {
      this.authenticated = false;
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Login request failed: ${msg}` };
    }
  }

  /** Logout and clear session */
  async logout(): Promise<void> {
    try {
      await this.client.get("/vtop/doLogout");
    } catch {
      // Ignore logout errors
    }
    this.authenticated = false;
    this.csrfToken = null;
  }

  /** Fetch an authenticated page. Returns raw HTML. */
  async fetchPage(
    endpoint: string,
    payload?: Record<string, string>
  ): Promise<string> {
    if (!this.authenticated) {
      throw new Error(
        "Not authenticated. Call get_captcha and login first."
      );
    }

    try {
      let res;
      if (payload) {
        const formData = new URLSearchParams(payload);
        if (this.csrfToken) {
          formData.append("_csrf", this.csrfToken);
        }
        res = await this.client.post(endpoint, formData, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } else {
        res = await this.client.get(endpoint);
      }

      const html: string = res.data;

      // Detect session expiry
      if (
        html.includes("doLogin") ||
        html.includes("Session Expired") ||
        html.includes("session expired")
      ) {
        this.authenticated = false;
        throw new Error(
          "Session expired. Please get a new captcha and login again."
        );
      }

      return html;
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("Session expired")) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch ${endpoint}: ${msg}`);
    }
  }
}
