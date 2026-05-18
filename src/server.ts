import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "./services/vtop-client.js";
import { registerAuthTools } from "./tools/auth.js";
import { registerAttendanceTool } from "./tools/attendance.js";
import { registerTimetableTool } from "./tools/timetable.js";
import { registerMarksTool } from "./tools/marks.js";
import { registerExamScheduleTool } from "./tools/exam-schedule.js";
import { registerGradesTool } from "./tools/grades.js";
import { registerProfileTool } from "./tools/profile.js";
import { registerCurriculumTool } from "./tools/curriculum.js";

export function createServer(): { server: McpServer; client: VtopClient } {
  const server = new McpServer({
    name: "vtop-mcp",
    version: "0.1.0",
  });

  const client = new VtopClient();

  // Register all tools
  registerAuthTools(server, client);
  registerAttendanceTool(server, client);
  registerTimetableTool(server, client);
  registerMarksTool(server, client);
  registerExamScheduleTool(server, client);
  registerGradesTool(server, client);
  registerProfileTool(server, client);
  registerCurriculumTool(server, client);

  return { server, client };
}
