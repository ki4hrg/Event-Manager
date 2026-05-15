export function formatBreakoutSessionName(
  sessionName: string,
  groupName: string | null | undefined
): string {
  if (!groupName) return sessionName;
  return `${groupName} ${sessionName}`;
}
