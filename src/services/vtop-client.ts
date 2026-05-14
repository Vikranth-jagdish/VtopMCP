import axios, { AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

const DEFAULT_BASE_URL = "https://vtopcc.vit.ac.in/vtop";

export class VtopClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private authenticated = false;
  private csrfToken: string | null = null;
  private authorizedID: string | null = null;

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
          Referer: this.baseUrl + "/login",
        },
        maxRedirects: 5,
        timeout: 30_000,
      })
    );
  }

  get isAuthenticated(): boolean {
    return this.authenticated;
  }

  /**
   * Extract CSRF token from HTML response.
   * VTOP includes it as: <input type="hidden" name="_csrf" value="...">
   */
  private extractCsrf(html: string): void {
    const match = html.match(
      /name="_csrf"\s+(?:content|value)="([^"]+)"|value="([^"]+)"\s+name="_csrf"/
    );
    if (match) {
      this.csrfToken = match[1] ?? match[2];
    }
  }

  /**
   * Step 1: Load the landing page and call prelogin/setup to initialize session.
   * This mirrors the Android app's flow: GET /vtop/login then POST /vtop/prelogin/setup
   *
   * The landing page is a portal selector (Student/Employee/Parent/Alumni). It
   * has no captcha. POSTing prelogin/setup with flag=VTOP returns the actual
   * student login page, which embeds the captcha image.
   */
  private async initSession(): Promise<string> {
    // Reset state
    this.authenticated = false;
    this.authorizedID = null;

    // Load the landing page (portal selector) to seed cookies + CSRF
    const landingRes = await this.client.get("/login");
    this.extractCsrf(landingRes.data);

    // POST prelogin/setup with flag=VTOP to get the actual login page
    const setupForm = new URLSearchParams();
    setupForm.append("flag", "VTOP");
    if (this.csrfToken) setupForm.append("_csrf", this.csrfToken);
    const setupRes = await this.client.post("/prelogin/setup", setupForm, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const loginHtml: string = setupRes.data;
    this.extractCsrf(loginHtml);
    return loginHtml;
  }

  /**
   * Get CAPTCHA image as base64 string.
   * The VTOP login page embeds the captcha as a base64 <img> inside #captchaBlock.
   */
  async getCaptcha(): Promise<string> {
    const html = await this.initSession();

    // Extract captcha image from: <img src="data:image/png;base64,..." /> inside #captchaBlock
    // The Android app does: $('#captchaBlock img').get(0).src
    const captchaMatch = html.match(
      /id="captchaBlock"[^>]*>[\s\S]*?<img[^>]+src="(data:image\/[^;]+;base64,[^"]+)"/
    );

    if (captchaMatch) {
      return captchaMatch[1];
    }

    // Fallback: look for any base64 image in the page that looks like a captcha
    const imgMatch = html.match(
      /<img[^>]+src="(data:image\/(?:png|jpeg|jpg);base64,[A-Za-z0-9+/=]+)"/
    );

    if (imgMatch) {
      return imgMatch[1];
    }

    throw new Error(
      "Could not find captcha image on login page. The page structure may have changed."
    );
  }

  /**
   * Login to VTOP with username, password, and captcha solution.
   *
   * The Android app submits: POST /vtop/login with form fields:
   *   username, password, captchaStr, gResponse, _csrf
   *
   * On success, the response contains an input with id="authorizedIDX"
   * which is needed for all subsequent requests.
   */
  async login(
    username: string,
    password: string,
    captcha: string
  ): Promise<{ success: boolean; message: string }> {
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);
    formData.append("captchaStr", captcha);
    formData.append("gResponse", captcha);
    if (this.csrfToken) {
      formData.append("_csrf", this.csrfToken);
    }

    try {
      const res = await this.client.post("/login", formData, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      const html: string = res.data;

      // Check for login success: presence of authorizedIDX hidden input
      const authMatch = html.match(
        /id="authorizedIDX"\s+value="([^"]+)"|value="([^"]+)"\s+id="authorizedIDX"/
      );

      if (authMatch) {
        this.authorizedID = authMatch[1] ?? authMatch[2];
        this.authenticated = true;
        this.extractCsrf(html);
        return { success: true, message: "Successfully logged in to VTOP." };
      }

      // Check specific error patterns (from Android app's regex patterns)
      const lower = html.toLowerCase();
      if (/invalid\s*captcha/.test(lower)) {
        return {
          success: false,
          message:
            "Invalid captcha. Call get_captcha again and retry with the new captcha.",
        };
      }
      if (/invalid\s*(user\s*name|login\s*id|user\s*id)\s*\/\s*password/.test(lower)) {
        return {
          success: false,
          message: "Invalid username or password.",
        };
      }
      if (/account\s*is\s*locked/.test(lower)) {
        return {
          success: false,
          message: "Account is locked. Please contact VIT administration.",
        };
      }
      if (/maximum\s*fail\s*attempts\s*reached/.test(lower)) {
        return {
          success: false,
          message:
            "Maximum login attempts reached. Open VTOP in your browser to reset.",
        };
      }

      // If we got redirected to a page with authorizedIDX via content load
      // Try loading /content page to get the home page
      try {
        const contentRes = await this.client.get("/content");
        const contentHtml: string = contentRes.data;
        const contentAuthMatch = contentHtml.match(
          /id="authorizedIDX"\s+value="([^"]+)"|value="([^"]+)"\s+id="authorizedIDX"/
        );
        if (contentAuthMatch) {
          this.authorizedID = contentAuthMatch[1] ?? contentAuthMatch[2];
          this.authenticated = true;
          this.extractCsrf(contentHtml);
          return { success: true, message: "Successfully logged in to VTOP." };
        }
      } catch {
        // Ignore content page errors
      }

      this.authenticated = false;
      return {
        success: false,
        message:
          "Login failed with unknown error. Try getting a new captcha and retrying.",
      };
    } catch (err: unknown) {
      this.authenticated = false;
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Login request failed: ${msg}` };
    }
  }

  /** Logout and clear session */
  async logout(): Promise<void> {
    try {
      await this.client.get("/processLogout");
    } catch {
      // Ignore logout errors
    }
    this.authenticated = false;
    this.authorizedID = null;
    this.csrfToken = null;
  }

  /**
   * Get list of available semesters.
   * Uses the timetable page to extract semester dropdown options.
   * Endpoint: POST academics/common/StudentTimeTableChn
   */
  async getSemesters(): Promise<{ id: string; name: string }[]> {
    this.ensureAuthenticated();

    const html = await this.postWithAuth(
      "academics/common/StudentTimeTableChn",
      { verifyMenu: "true", nocache: String(Date.now()) }
    );

    const semesters: { id: string; name: string }[] = [];
    const optionRegex =
      /<option\s+value="([^"]*)"[^>]*>([^<]+)<\/option>/gi;
    let match;

    while ((match = optionRegex.exec(html)) !== null) {
      const id = match[1].trim();
      const name = match[2].trim();
      if (id) {
        semesters.push({ id, name });
      }
    }

    return semesters;
  }

  /**
   * Fetch an authenticated page with POST.
   * Automatically includes authorizedID, _csrf, and semesterSubId.
   */
  async fetchPage(
    endpoint: string,
    payload?: Record<string, string>
  ): Promise<string> {
    this.ensureAuthenticated();
    return this.postWithAuth(endpoint, payload);
  }

  private ensureAuthenticated(): void {
    if (!this.authenticated || !this.authorizedID) {
      throw new Error(
        "Not authenticated. Call get_captcha and login first."
      );
    }
  }

  /**
   * POST to a VTOP endpoint with standard auth parameters.
   * All VTOP data requests use:
   *   authorizedID, _csrf, and optionally semesterSubId + verifyMenu
   */
  private async postWithAuth(
    endpoint: string,
    extraParams?: Record<string, string>
  ): Promise<string> {
    const formData = new URLSearchParams();
    formData.append("authorizedID", this.authorizedID!);
    if (this.csrfToken) {
      formData.append("_csrf", this.csrfToken);
    }

    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        formData.append(key, value);
      }
    }

    try {
      const res = await this.client.post(endpoint, formData, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      const html: string = res.data;

      if (process.env.VTOP_DUMP_HTML && process.env.VTOP_DUMP_DIR) {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const safe = endpoint.replace(/[^\w-]+/g, "_");
        await fs.writeFile(
          path.join(process.env.VTOP_DUMP_DIR, `${safe}.html`),
          html
        );
      }

      // Detect session expiry or unauthorized access
      const lower = html.toLowerCase();
      if (
        lower.includes("not authorized") ||
        lower.includes("session expired") ||
        lower.includes("vtopLoginForm")
      ) {
        this.authenticated = false;
        this.authorizedID = null;
        throw new Error(
          "Session expired. Please call get_captcha and login again."
        );
      }

      return html;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message.includes("Session expired")
      ) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch ${endpoint}: ${msg}`);
    }
  }
}
