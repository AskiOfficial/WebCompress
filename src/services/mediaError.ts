export class MediaProcessingError extends Error {
  constructor(message: string, readonly technicalDetails?: string) {
    super(message);
    this.name = 'MediaProcessingError';
  }
}

export function cancelledError(): DOMException {
  return new DOMException('Operation cancelled by user.', 'AbortError');
}
