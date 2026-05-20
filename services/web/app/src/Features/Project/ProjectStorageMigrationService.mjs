import path from 'node:path'
import fs from 'node:fs/promises'
import ProjectGetter from './ProjectGetter.mjs'
import ProjectEntityHandler from './ProjectEntityHandler.mjs'
import ProjectWorkspaceManager from './ProjectWorkspaceManager.mjs'
import ProjectFileStore from './ProjectFileStore.mjs'
import ProjectCheckpointService from './ProjectCheckpointService.mjs'

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

  await writeProjectMetadata({ project, projectId, workspaceRoot })
  const checkpoint = await ProjectCheckpointService.createCheckpoint({
    projectId,
    actorType: 'migration',
    actorUserId: userId,
    summary: 'Migrate project to filesystem workspace',
  })

  project.storageBackend = 'filesystem'
  project.workspace = {
    rootPath: workspaceRoot,
    migratedAt: new Date(),
    finalizedAt: null,
  }
  await project.save()

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

export default {
  migrateProjectToFilesystem,
}
