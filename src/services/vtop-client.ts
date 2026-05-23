import axios, { AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import { HttpsProxyAgent } from "https-proxy-agent";
import { createCookieAgent } from "http-cookie-agent/http";
import {
  COURSE_CODE_PATTERN,
  ENDPOINTS,
  NOT_AUTH_MSG,
  SESSION_EXPIRED_MSG,
} from "./constants.js";
import { applySystemCATrust } from "./tls.js";
import {
  parseCalendarMonths,
  parseAcademicCalendar,
  calDateMonthKey,
} from "./vtop-parser.js";
import type { CalendarDay } from "./attendance-calc.js";
import { pMap } from "./concurrency.js";

const DEFAULT_BASE_URL = "https://vtopcc.vit.ac.in/vtop";

// An https-proxy agent that also reads/writes the cookie jar at the socket
// level. axios-cookiejar-support's wrapper() refuses a foreign http(s).Agent,
// so when proxying we hand cookie handling to this composed agent instead.
const HttpsProxyCookieAgent = createCookieAgent(HttpsProxyAgent);

/**
 * Resolve a proxy URL from the environment, or undefined for a direct
 * connection. VTOP serves a Google reCAPTCHA (which this server can't read)
 * instead of the OCR-able image captcha when its risk score is high, and a
 * datacenter/cloud egress IP (e.g. a PaaS host) reliably trips that. Routing
 * VTOP traffic through a residential/mobile proxy lowers the score so the image
 * variant is served. VTOP_PROXY_URL scopes the proxy to VTOP only; HTTPS_PROXY
 * is honored as a fallback.
 */
function resolveProxyUrl(): string | undefined {
  return (
    process.env.VTOP_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    undefined
  );
}

const AUTH_ID_RE =
  /id="authorizedIDX"\s+value="([^"]+)"|value="([^"]+)"\s+id="authorizedIDX"/;

const CSRF_RE =
  /name="_csrf"\s+(?:content|value)="([^"]+)"|value="([^"]+)"\s+name="_csrf"/;

/**
 * Maximum semesters to probe when auto-detecting the active term. VIT runs
 * Fall / Winter / Summer; the active term is always one of the three most
 * recent dropdown entries. Bounds worst-case latency on first data call to
 * ~3 × one round-trip.
 */
const MAX_PROBE_SEMESTERS = 3;

/**
 * When the captcha image isn't found, summarize what VTOP actually returned so
 * the failure is diagnosable from the client (e.g. a reCAPTCHA variant, a WAF /
 * region block, or a genuine markup change) without dumping the whole page.
 */
function describeLoginPage(html: string): string {
  const lower = html.toLowerCase();
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim().slice(0, 90);
  const markers: string[] = [];
  // A real sitekey means reCAPTCHA is actually rendered; the bare hidden
  // g-recaptcha-response field is just dormant template markup, present even
  // when the normal image captcha is shown.
  if (/data-sitekey="[^"]+"/i.test(html)) markers.push("reCAPTCHA-active");
  else if (/g-recaptcha-response/i.test(lower)) markers.push("recaptcha-field-dormant");
  if (/hcaptcha/.test(lower)) markers.push("hCaptcha");
  if (/cloudflare|cf-ray|attention required|cf-chl/.test(lower)) markers.push("cloudflare/WAF");
  if (/access denied|forbidden|not authorized|blocked|unusual traffic|region/.test(lower))
    markers.push("block-text");
  if (lower.includes("captchablock")) markers.push("captchaBlock");
  if (lower.includes("captchastr")) markers.push("captchaStr-field");
  if (/<form[^>]+action="[^"]*login/i.test(lower)) markers.push("login-form");
  const imgCount = (html.match(/<img/gi) ?? []).length;
  const hasDataImg = /<img[^>]+src="data:image/i.test(html);
  return (
    `[diagnostic] htmlLen=${html.length} title="${title}" imgs=${imgCount} ` +
    `dataImg=${hasDataImg} markers=[${markers.join(",") || "none"}]`
  );
}

export class VtopClient {
  // All session state and caches below are PER-INSTANCE (one VtopClient per
  // user — see http.ts client-pool). They must never be made static/module-level,
  // or one user's data would leak to another. Node is single-threaded so these
  // fields aren't subject to data races across concurrent requests.
  private client: AxiosInstance;
  private baseUrl: string;
  private authenticated = false;
  private csrfToken: string | null = null;
  private authorizedID: string | null = null;
  private cachedActiveSemesterId: string | null = null;
  private cachedGradeHistoryHtml: string | null = null;
  private cachedCalendarSem: string | null = null;
  private cachedCalendarMonths: string[] | null = null;
  private cachedCalendarDays: Record<string, CalendarDay[]> = {};
  // Timetable is static for a semester — cache it so getCurrentSemesterId,
  // calculate_attendance and get_today_classes don't refetch it.
  private cachedTimetableHtml = new Map<string, string>();

  constructor(baseUrl?: string) {
    applySystemCATrust();
    this.baseUrl = baseUrl ?? process.env.VTOP_BASE_URL ?? DEFAULT_BASE_URL;

    const jar = new CookieJar();
    const config = {
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
    };

    const proxyUrl = resolveProxyUrl();
    if (proxyUrl) {
      // Proxy path: a single agent both tunnels through the proxy and syncs the
      // cookie jar (so we skip wrapper(), which can't coexist with our agent).
      // proxy:false stops axios's own env-proxy logic from double-tunneling.
      console.error(
        `VtopMCP: routing VTOP traffic through proxy ${proxyUrl.replace(/\/\/[^@/]+@/, "//***@")}`,
      );
      this.client = axios.create({
        ...config,
        httpsAgent: new HttpsProxyCookieAgent(proxyUrl, { cookies: { jar } }),
        proxy: false,
      });
    } else {
      // Direct path: axios-cookiejar-support manages cookies via its own agent.
      this.client = wrapper(axios.create({ ...config, jar }));
    }
  }

  get isAuthenticated(): boolean {
    return this.authenticated;
  }

  private extractCsrf(html: string): void {
    const match = html.match(CSRF_RE);
    if (match) this.csrfToken = match[1] ?? match[2];
  }

  /**
   * Extract authorizedID from a post-login response and, if found, also
   * refresh the CSRF token from the same HTML. Returns true on success.
   */
  private absorbAuthFromHtml(html: string): boolean {
    const match = html.match(AUTH_ID_RE);
    if (!match) return false;
    this.authorizedID = match[1] ?? match[2];
    this.authenticated = true;
    this.extractCsrf(html);
    return true;
  }

  /**
   * The /vtop/login page is a portal selector (Student/Employee/Parent/
   * Alumni) with no captcha. To reach the actual login page we GET it for
   * cookies, then POST /prelogin/setup?flag=VTOP to receive the student
   * login HTML (which embeds the captcha image).
   */
  private async initSession(): Promise<string> {
    this.authenticated = false;
    this.authorizedID = null;

    const landingRes = await this.client.get("/login");
    this.extractCsrf(landingRes.data);

    const setupForm = new URLSearchParams();
    setupForm.append("flag", "VTOP");
    if (this.csrfToken) setupForm.append("_csrf", this.csrfToken);
    const setupRes = await this.client.post("/prelogin/setup", setupForm, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    this.extractCsrf(setupRes.data);
    return setupRes.data;
  }

  /** Diagnostic only: return the raw prelogin HTML that should contain the captcha. */
  async debugLoginPageHtml(): Promise<string> {
    return this.initSession();
  }

  /**
   * Fetch the login page and pull the embedded base64 captcha out of it.
   * The Android app does the equivalent of $('#captchaBlock img').src.
   */
  async getCaptcha(): Promise<string> {
    // VTOP serves one of two login pages by risk score: an OCR-able image
    // captcha, or a Google reCAPTCHA (which this server can't read). The variant
    // flips between prelogin rounds, so when reCAPTCHA shows up we re-roll the
    // session a few times to try to land on the image variant before giving up.
    const MAX_ATTEMPTS = 4;
    let lastHtml = "";
    let sawRecaptcha = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const html = await this.initSession();
      lastHtml = html;

      const match =
        html.match(
          /id="captchaBlock"[^>]*>[\s\S]*?<img[^>]+src="(data:image\/[^;]+;base64,[^"]+)"/,
        ) ??
        html.match(
          /<img[^>]+src="(data:image\/(?:png|jpeg|jpg);base64,[A-Za-z0-9+/=]+)"/,
        );
      if (match) return match[1];

      if (/data-sitekey="[^"]+"/i.test(html)) sawRecaptcha = true;

      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
      }
    }

    if (sawRecaptcha) {
      throw new Error(
        "VTOP kept serving a Google reCAPTCHA instead of the image captcha across " +
          `${MAX_ATTEMPTS} attempts, so no readable captcha could be obtained. VTOP shows ` +
          "reCAPTCHA when its risk score is high — typically from a datacenter/cloud IP " +
          "(e.g. the hosting provider) or many recent login attempts. Wait a few minutes " +
          `and try again. ${describeLoginPage(lastHtml)}`,
      );
    }

    throw new Error(
      `Could not find captcha image on login page. ${describeLoginPage(lastHtml)}`,
    );
  }

  /**
   * Submit credentials + captcha. On success the response contains a hidden
   * <input id="authorizedIDX"> whose value is required on every subsequent
   * authenticated POST. VTOP also rotates the CSRF token here.
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
    if (this.csrfToken) formData.append("_csrf", this.csrfToken);

    try {
      const res = await this.client.post("/login", formData, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const html: string = res.data;

      if (this.absorbAuthFromHtml(html)) {
        return { success: true, message: "Successfully logged in to VTOP." };
      }

      const lower = html.toLowerCase();
      if (/invalid\s*captcha/.test(lower)) {
        return {
          success: false,
          message:
            "Invalid captcha. Call get_captcha again and retry with the new captcha.",
        };
      }
      if (
        /invalid\s*(user\s*name|login\s*id|user\s*id)\s*\/\s*password/.test(
          lower
        )
      ) {
        return { success: false, message: "Invalid username or password." };
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

      // Some VTOP deployments redirect post-login through /content rather
      // than returning the home page inline; try that as a fallback.
      try {
        const contentRes = await this.client.get("/content");
        if (this.absorbAuthFromHtml(contentRes.data)) {
          return { success: true, message: "Successfully logged in to VTOP." };
        }
      } catch {
        /* ignore */
      }

      this.authenticated = false;
      return {
        success: false,
        message:
          "Login failed with unknown error. Try getting a new captcha and retrying.",
      };
    } catch (err: unknown) {
      this.authenticated = false;
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      // VTOP returns a Tomcat 404 on POST /login when the session wasn't armed
      // by the prelogin handshake — i.e. this captcha belongs to a different
      // session than the one we're posting from. The captcha can't be replayed
      // on a fresh session, so the only recovery is a brand-new captcha.
      if (status === 404 || /status code 404/.test(String(err))) {
        return {
          success: false,
          message:
            "Login could not be completed: VTOP did not recognize this captcha's " +
            "session (it returned 404). Call get_captcha again to get a fresh captcha, " +
            "then call login with that new captcha.",
        };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Login request failed: ${msg}` };
    }
  }

  async logout(): Promise<void> {
    try {
      await this.client.get("/processLogout");
    } catch {
      /* ignore */
    }
    this.authenticated = false;
    this.authorizedID = null;
    this.csrfToken = null;
    this.cachedActiveSemesterId = null;
    this.cachedGradeHistoryHtml = null;
    this.cachedCalendarSem = null;
    this.cachedCalendarMonths = null;
    this.cachedCalendarDays = {};
    this.cachedTimetableHtml.clear();
  }

  /** Timetable HTML for a semester, cached for the session (it doesn't change). */
  async getTimetableHtml(semesterId: string): Promise<string> {
    const cached = this.cachedTimetableHtml.get(semesterId);
    if (cached) return cached;
    const html = await this.fetchPage(ENDPOINTS.timetable, { semesterSubId: semesterId });
    this.cachedTimetableHtml.set(semesterId, html);
    return html;
  }

  /**
   * Auto-detect the semester the student is actively enrolled in.
   *
   * Cannot just pick semesters[0]: VIT's dropdown lists Fall/Winter/Summer
   * regardless of enrolment, and Summer Term (≈May–July) is mostly arrears
   * so many students see it at index 0 with nothing in it. Probe the
   * timetable for each of the most recent few semesters and return the
   * first that has real course rows. Cached for the rest of the session.
   */
  async getCurrentSemesterId(): Promise<string> {
    if (this.cachedActiveSemesterId) return this.cachedActiveSemesterId;

    const semesters = await this.getSemesters();
    if (semesters.length === 0) {
      throw new Error("No semesters available on VTOP for this account.");
    }

    // Probe the recent semesters' timetables concurrently, then pick the first
    // (in dropdown order) that has real course rows. Caches the winning
    // timetable HTML so the data tools don't refetch it.
    const candidates = semesters.slice(0, MAX_PROBE_SEMESTERS);
    const probes = await Promise.allSettled(
      candidates.map((sem) => this.postWithAuth(ENDPOINTS.timetable, { semesterSubId: sem.id })),
    );
    for (let i = 0; i < candidates.length; i++) {
      const r = probes[i];
      if (r.status === "fulfilled" && COURSE_CODE_PATTERN.test(r.value)) {
        this.cachedActiveSemesterId = candidates[i].id;
        this.cachedTimetableHtml.set(candidates[i].id, r.value);
        return candidates[i].id;
      }
    }
    // A session-expiry on any probe should surface so the caller can re-login,
    // rather than silently falling back to the wrong semester.
    const authFail = probes.find(
      (r): r is PromiseRejectedResult =>
        r.status === "rejected" &&
        r.reason instanceof Error &&
        r.reason.message.startsWith("NOT_AUTHENTICATED"),
    );
    if (authFail) throw authFail.reason;

    this.cachedActiveSemesterId = semesters[0].id;
    return semesters[0].id;
  }

  async getSemesters(): Promise<{ id: string; name: string }[]> {
    this.ensureAuthenticated();
    const html = await this.postWithAuth(ENDPOINTS.timetableForSemesters, {
      verifyMenu: "true",
      nocache: String(Date.now()),
    });

    const semesters: { id: string; name: string }[] = [];
    const optionRegex = /<option\s+value="([^"]*)"[^>]*>([^<]+)<\/option>/gi;
    let match;
    while ((match = optionRegex.exec(html)) !== null) {
      const id = match[1].trim();
      const name = match[2].trim();
      if (id) semesters.push({ id, name });
    }
    return semesters;
  }

  /**
   * Fetch grade-history HTML, caching it for the rest of the session.
   * Both get_grade_history and get_curriculum_progress parse this same
   * response, so we don't want to hit VTOP twice when chained.
   */
  async getGradeHistoryHtml(): Promise<string> {
    if (this.cachedGradeHistoryHtml) return this.cachedGradeHistoryHtml;
    const html = await this.fetchPage(ENDPOINTS.gradeHistory, {
      verifyMenu: "true",
      nocache: String(Date.now()),
    });
    this.cachedGradeHistoryHtml = html;
    return html;
  }

  /**
   * Fetch the academic calendar (instructional days, holidays, day-order
   * overrides) for the months overlapping [fromISO, toISO]. Three-step VTOP
   * flow: load the calendar page for context, fetch the month buttons, then
   * fetch each needed month's day table. Month list + parsed months are cached
   * per semester for the session.
   */
  async getCalendar(
    semesterId: string,
    fromISO: string,
    toISO: string,
  ): Promise<CalendarDay[]> {
    this.ensureAuthenticated();
    const x = () => new Date().toUTCString();

    if (this.cachedCalendarSem !== semesterId || !this.cachedCalendarMonths) {
      // Loading the page first establishes the calendar context; the month-list
      // and month actions 404 otherwise (same nav-state quirk as login).
      await this.postWithAuth(ENDPOINTS.calendarPreview, {});
      const listHtml = await this.postWithAuth(ENDPOINTS.calendarMonthList, {
        paramReturnId: "getListForSemester",
        semSubId: semesterId,
        classGroupId: "COMB",
        x: x(),
      });
      this.cachedCalendarMonths = parseCalendarMonths(listHtml);
      this.cachedCalendarSem = semesterId;
      this.cachedCalendarDays = {};
    }

    const fromYM = fromISO.slice(0, 7);
    const toYM = toISO.slice(0, 7);
    const wanted = this.cachedCalendarMonths.filter((cd) => {
      const ym = calDateMonthKey(cd);
      return ym && ym >= fromYM && ym <= toYM;
    });
    // Fetch any uncached months in the range concurrently.
    const missing = wanted.filter((cd) => !this.cachedCalendarDays[cd]);
    await pMap(missing, async (cd) => {
      const html = await this.postWithAuth(ENDPOINTS.calendarMonth, {
        calDate: cd,
        semSubId: semesterId,
        classGroupId: "COMB",
        x: x(),
      });
      this.cachedCalendarDays[cd] = parseAcademicCalendar(html, cd);
    });

    const out: CalendarDay[] = [];
    for (const cd of wanted) out.push(...(this.cachedCalendarDays[cd] ?? []));
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }

  async fetchPage(
    endpoint: string,
    payload?: Record<string, string>
  ): Promise<string> {
    this.ensureAuthenticated();
    return this.postWithAuth(endpoint, payload);
  }

  private ensureAuthenticated(): void {
    if (!this.authenticated || !this.authorizedID) {
      throw new Error(NOT_AUTH_MSG);
    }
  }

  private async postWithAuth(
    endpoint: string,
    extraParams?: Record<string, string>
  ): Promise<string> {
    const formData = new URLSearchParams();
    formData.append("authorizedID", this.authorizedID!);
    if (this.csrfToken) formData.append("_csrf", this.csrfToken);
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

      const lower = html.toLowerCase();
      if (
        lower.includes("not authorized") ||
        lower.includes("session expired") ||
        lower.includes("vtoploginform")
      ) {
        this.authenticated = false;
        this.authorizedID = null;
        throw new Error(SESSION_EXPIRED_MSG);
      }

      return html;
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith("NOT_AUTHENTICATED")) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch ${endpoint}: ${msg}`);
    }
  }
}
