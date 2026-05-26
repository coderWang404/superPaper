type OpenDocWithId<T> = (docId: string) => Promise<T | undefined>

export async function openPreferredOrFallbackDoc<T>({
  preferredDocId,
  fallbackDocId,
  openDocWithId,
}: {
  preferredDocId?: string | null
  fallbackDocId?: string | null
  openDocWithId: OpenDocWithId<T>
}): Promise<T | undefined> {
  if (preferredDocId) {
    const opened = await openDocWithId(preferredDocId)
    if (opened || !fallbackDocId || fallbackDocId === preferredDocId) {
      return opened
    }
  }

  if (fallbackDocId) {
    return await openDocWithId(fallbackDocId)
  }
}
