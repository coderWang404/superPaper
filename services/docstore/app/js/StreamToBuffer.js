import { LoggerStream, WritableBuffer } from '@superpaper/stream-utils'
import Settings from '@superpaper/settings'
import logger from '@superpaper/logger/logging-manager.js'
import { pipeline } from 'node:stream/promises'

export async function streamToBuffer(projectId, docId, stream) {
  const loggerTransform = new LoggerStream(
    Settings.max_doc_length,
    (size, isFlush) => {
      logger.warn(
        { projectId, docId, size, finishedReading: isFlush },
        'potentially large doc pulled down from gcs'
      )
    }
  )

  const buffer = new WritableBuffer()
  await pipeline(stream, loggerTransform, buffer)
  return buffer.contents()
}
