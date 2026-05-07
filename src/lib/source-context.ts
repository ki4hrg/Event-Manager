export function getSourceCancelPath(
  eventId: string,
  functionId: string | undefined,
  presentationId: string | undefined,
  fallback: string
): string {
  if (presentationId) return `/events/${eventId}/presentations/${presentationId}`;
  if (functionId) return `/events/${eventId}/functions/${functionId}`;
  return fallback;
}

export function getSourceBackLabel(
  functionId: string | undefined,
  presentationId: string | undefined,
  fallback: string
): string {
  if (presentationId) return "Back to Presentation";
  if (functionId) return "Back to Function";
  return fallback;
}

export function extractSourceName(
  source: { name: string } | { title: string } | null | undefined
): string | undefined {
  if (!source) return undefined;
  if ("title" in source) return source.title;
  if ("name" in source) return source.name;
  return undefined;
}
