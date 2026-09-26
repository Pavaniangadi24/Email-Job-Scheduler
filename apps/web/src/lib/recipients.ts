const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function extractRecipients(source: string): string[] {
  return [...new Set(source.match(emailPattern)?.map(address => address.toLowerCase()) ?? [])];
}