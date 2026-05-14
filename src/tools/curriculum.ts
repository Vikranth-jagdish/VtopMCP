import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseCurriculumProgress } from "../services/vtop-parser.js";
import { EmptySchema } from "../schemas/index.js";
import { mkJsonTool } from "./_helpers.js";

export function registerCurriculumTool(
  server: McpServer,
  client: VtopClient
) {
  mkJsonTool(
    server,
    "get_curriculum_progress",
    "Get degree progress: total credits earned vs required (and remaining), per-category breakdown (Foundation Core, Discipline Core, Discipline Electives, Open Electives, Projects/Internship, etc.), per-basket completion (HSM Elective, Foreign Language, Extra-curricular, ...), CGPA, and grade-letter counts across all semesters. Use this for any 'how many credits left?', 'how close am I to graduating?', 'which baskets do I still need?', or 'how many of each grade have I gotten?' questions. If the response contains NOT_AUTHENTICATED, immediately call get_captcha → login (no need to ask the user — credentials are pre-configured via env vars) and then retry this tool. Requires login.",
    EmptySchema.shape,
    async () => parseCurriculumProgress(await client.getGradeHistoryHtml())
  );
}
