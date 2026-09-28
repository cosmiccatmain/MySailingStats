// Retired endpoint. Tabs still running an older build of the page call it;
// answer in JSON so they show a clear message instead of a parse error.
export function GET() {
  return Response.json({ error: "the app was updated — please reload the page" }, { status: 410 });
}
