import path from 'node:path'
import fs from 'node:fs/promises'
import ProjectGetter from './ProjectGetter.mjs'
import ProjectEntityHandler from './ProjectEntityHandler.mjs'
import ProjectWorkspaceManager from './ProjectWorkspaceManager.mjs'
import ProjectFileStore from './ProjectFileStore.mjs'
import ProjectCheckpointService from './ProjectCheckpointService.mjs'
import HistoryManager from '../History/HistoryManager.mjs'
import { Project } from '../../models/Project.mjs'

async function migrateProjectToFilesystem({ projectId, userId }) {
  const project = await ProjectGetter.promises.getProject(projectId)
  if (!project) {
    throw new Error('project not found')
  }

  const workspaceRoot = ProjectWorkspaceManager.getWorkspaceRoot(projectId)
  await fs.mkdir(workspaceRoot, { recursive: true })

  const docs = await ProjectEntityHandler.promises.getAllDocs(projectId)
  for (const [projectPath, doc] of Object.entries(docs)) {
    await ProjectFileStore.writeTextFile({
      projectId,
      projectPath,
      content: Array.isArray(doc.lines) ? doc.lines.join('\n') : '',
    })
  }
  const files = await ProjectEntityHandler.promises.getAllFiles(projectId)
  for (const [projectPath, file] of Object.entries(files)) {
    if (!file.hash) {
      continue
    }
    const { stream } = await HistoryManager.promises.requestBlobWithProjectId(
      projectId,
      file.hash,
      'GET'
    )
    await ProjectFileStore.writeFileBuffer({
      projectId,
      projectPath,
      content: await streamToBuffer(stream),
    })
  }

  await writeProjectMetadata({ project, projectId, workspaceRoot })
  const checkpoint = await ProjectCheckpointService.createCheckpoint({
    projectId,
    actorType: 'migration',
    actorUserId: userId,
    summary: 'Migrate project to filesystem workspace',
  })

  const workspace = {
    rootPath: workspaceRoot,
    migratedAt: new Date(),
    finalizedAt: null,
  }
  project.storageBackend = 'filesystem'
  project.workspace = workspace
  await Project.updateOne(
    { _id: projectId },
    {
      $set: {
        storageBackend: 'filesystem',
        workspace,
      },
    }
  ).exec()

  return {
    projectId,
    workspaceRoot,
    checkpoint,
  }
}

async function writeProjectMetadata({ project, projectId, workspaceRoot }) {
  const metadataPath = path.join(workspaceRoot, '.superpaper', 'project.json')
  await fs.mkdir(path.dirname(metadataPath), { recursive: true })
  await fs.writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        projectId: String(projectId),
        name: project.name,
        rootDocId: project.rootDoc_id?.toString?.() || project.rootDoc_id || null,
        compiler: project.compiler || null,
        migratedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    'utf8'
  )
}

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export default {
  migrateProjectToFilesystem,
}
