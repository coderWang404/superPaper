import path from 'node:path'
import crypto from 'node:crypto'
import DocstoreManager from '../Docstore/DocstoreManager.mjs'
import Errors from '../Errors/Errors.js'
import ProjectGetter from './ProjectGetter.mjs'
import { callbackifyAll } from '@superpaper/promise-utils'
import OError from '@superpaper/o-error'
import { iterablePaths } from './IterablePath.mjs'
import FolderStructureBuilder from './FolderStructureBuilder.mjs'
import ProjectFileStore from './ProjectFileStore.mjs'

/** @import {ProjectDoc, ProjectFile} from './types' */

/**
 * @param {string} projectId
 * @returns {Promise<Record<string, ProjectDoc>>}
 */
async function getAllDocs(projectId) {
  const project = await ProjectGetter.promises.getProject(projectId, {
    rootFolder: 1,
    storageBackend: 1,
  })
  if (project == null) {
    throw new Errors.NotFoundError('no project')
  }
  if (project.storageBackend === 'filesystem') {
    return await getAllFilesystemDocs(projectId)
  }

  // We get the path and name info from the project, and the lines and
  // version info from the doc store.
  const docContentsArray = await DocstoreManager.promises.getAllDocs(projectId)

  // Turn array from docstore into a dictionary based on doc id
  const docContents = {}
  for (const docContent of docContentsArray) {
    docContents[docContent._id] = docContent
  }

  const folders = _getAllFoldersFromProject(project)
  const docs = {}
  for (const { path: folderPath, folder } of folders) {
    for (const doc of iterablePaths(folder, 'docs')) {
      const content = docContents[doc._id.toString()]
      if (content != null) {
        docs[path.join(folderPath, doc.name)] = {
          _id: doc._id,
          name: doc.name,
          lines: content.lines,
          rev: content.rev,
          folder,
        }
      }
    }
  }

  return docs
}

/**
 * @param {string} projectId
 * @returns {Promise<Record<string, ProjectFile>>}
 */
async function getAllFiles(projectId) {
  const project = await ProjectGetter.promises.getProject(projectId, {
    rootFolder: 1,
    storageBackend: 1,
  })
  if (project == null) {
    throw new Errors.NotFoundError('no project')
  }
  if (project.storageBackend === 'filesystem') {
    return await getAllFilesystemFiles(projectId)
  }

  const folders = _getAllFoldersFromProject(project)
  const files = {}
  for (const { path: folderPath, folder } of folders) {
    for (const file of iterablePaths(folder, 'fileRefs')) {
      if (file != null) {
        files[path.join(folderPath, file.name)] = { ...file, folder }
      }
    }
  }
  return files
}

async function getAllEntities(projectId) {
  const project = await ProjectGetter.promises.getProject(projectId)
  if (project == null) {
    throw new Errors.NotFoundError('project not found')
  }
  if (project.storageBackend === 'filesystem') {
    const entries = await ProjectFileStore.listFiles({ projectId })
    return getAllEntitiesFromProject({
      ...project,
      rootFolder: [buildFilesystemRootFolder(entries)],
    })
  }
  const entities = getAllEntitiesFromProject(project)
  return entities
}

function getAllEntitiesFromProject(project) {
  const folders = _getAllFoldersFromProject(project)
  const docs = []
  const files = []
  for (const { path: folderPath, folder } of folders) {
    for (const doc of iterablePaths(folder, 'docs')) {
      if (doc != null) {
        docs.push({ path: path.join(folderPath, doc.name), doc })
      }
    }
    for (const file of iterablePaths(folder, 'fileRefs')) {
      if (file != null) {
        files.push({ path: path.join(folderPath, file.name), file })
      }
    }
  }
  return { docs, files, folders }
}

async function getAllDocPathsFromProjectById(projectId) {
  const project = await ProjectGetter.promises.getProject(projectId, {
    rootFolder: 1,
    storageBackend: 1,
  })
  if (project == null) {
    throw new Errors.NotFoundError('no project')
  }
  if (project.storageBackend === 'filesystem') {
    const entries = await ProjectFileStore.listFiles({ projectId })
    return getAllDocPathsFromProject({
      ...project,
      rootFolder: [buildFilesystemRootFolder(entries)],
    })
  }
  const docPaths = getAllDocPathsFromProject(project)
  return docPaths
}

function getAllDocPathsFromProject(project) {
  const folders = _getAllFoldersFromProject(project)
  const docPath = {}
  for (const { path: folderPath, folder } of folders) {
    for (const doc of iterablePaths(folder, 'docs')) {
      docPath[doc._id] = path.join(folderPath, doc.name)
    }
  }
  return docPath
}

/**
 *
 * @param {string} projectId
 * @param {string} docId
 * @param {{peek?: boolean, include_deleted?: boolean}} options
 * @return {Promise<{lines: *, rev: *, version: *, ranges: *}>}
 */
async function getDoc(projectId, docId, options = {}) {
  const { lines, rev, version, ranges } = await DocstoreManager.promises.getDoc(
    projectId,
    docId,
    options
  )
  return { lines, rev, version, ranges }
}

/**
 * @param {ObjectId | string} projectId
 * @param {ObjectId | string} docId
 */
async function getDocPathByProjectIdAndDocId(projectId, docId) {
  const project = await ProjectGetter.promises.getProject(projectId, {
    rootFolder: 1,
    storageBackend: 1,
  })
  if (project == null) {
    throw new Errors.NotFoundError('no project')
  }
  if (project.storageBackend === 'filesystem') {
    const entries = await ProjectFileStore.listFiles({ projectId })
    const filesystemProject = {
      ...project,
      rootFolder: [buildFilesystemRootFolder(entries)],
    }
    const docPath = await getDocPathFromProjectByDocId(
      filesystemProject,
      docId
    )
    if (docPath == null) {
      throw new Errors.NotFoundError('no doc')
    }
    return docPath
  }
  const docPath = await getDocPathFromProjectByDocId(project, docId)
  if (docPath == null) {
    throw new Errors.NotFoundError('no doc')
  }
  return docPath
}

function _recursivelyFindDocInFolder(basePath, docId, folder) {
  const docInCurrentFolder = (folder.docs || []).find(
    currentDoc => currentDoc._id.toString() === docId.toString()
  )
  if (docInCurrentFolder != null) {
    return path.join(basePath, docInCurrentFolder.name)
  } else {
    let docPath, childFolder
    for (childFolder of iterablePaths(folder, 'folders')) {
      docPath = _recursivelyFindDocInFolder(
        path.join(basePath, childFolder.name),
        docId,
        childFolder
      )
      if (docPath != null) {
        return docPath
      }
    }
    return null
  }
}

/**
 * @param {Project} project
 * @param {ObjectId | string} docId
 * @param {Function} callback
 */
async function getDocPathFromProjectByDocId(project, docId) {
  const docPath = _recursivelyFindDocInFolder('/', docId, project.rootFolder[0])
  return docPath
}

async function _getAllFolders(projectId) {
  const project = await ProjectGetter.promises.getProject(projectId, {
    rootFolder: 1,
  })

  if (project == null) {
    throw new Errors.NotFoundError('no project')
  }
  const folders = _getAllFoldersFromProject(project)
  return folders
}

function _getAllFoldersFromProject(project) {
  const folders = []
  try {
    const processFolder = (basePath, folder) => {
      folders.push({ path: basePath, folder })
      if (folder.folders) {
        for (const childFolder of iterablePaths(folder, 'folders')) {
          if (childFolder.name != null) {
            const childPath = path.join(basePath, childFolder.name)
            processFolder(childPath, childFolder)
          }
        }
      }
    }
    processFolder('/', project.rootFolder[0])
    return folders
  } catch (err) {
    throw OError.tag(err, 'Error getting folders', { projectId: project._id })
  }
}

async function getAllFilesystemDocs(projectId) {
  const entries = await ProjectFileStore.listFiles({ projectId })
  const docs = {}
  for (const entry of entries.filter(entry => entry.type === 'doc')) {
    const file = await ProjectFileStore.readTextFile({
      projectId,
      projectPath: entry.projectPath,
    })
    const doc = createFilesystemDoc(entry.projectPath)
    docs[entry.projectPath] = {
      _id: doc._id,
      name: doc.name,
      lines: file.content.split('\n'),
      rev: 0,
      folder: null,
      storageBackend: 'filesystem',
      sha256: file.sha256,
    }
  }
  return docs
}

async function getAllFilesystemFiles(projectId) {
  const entries = await ProjectFileStore.listFiles({ projectId })
  const files = {}
  for (const entry of entries.filter(entry => entry.type === 'file')) {
    const file = createFilesystemFile(entry.projectPath)
    files[entry.projectPath] = {
      ...file,
      folder: null,
      storageBackend: 'filesystem',
      bytes: entry.bytes,
    }
  }
  return files
}

function buildFilesystemRootFolder(entries) {
  const docEntries = []
  const fileEntries = []
  for (const entry of entries) {
    if (entry.type === 'doc') {
      docEntries.push({
        path: entry.projectPath,
        doc: createFilesystemDoc(entry.projectPath),
      })
    } else {
      fileEntries.push({
        path: entry.projectPath,
        file: createFilesystemFile(entry.projectPath),
      })
    }
  }
  return FolderStructureBuilder.buildFolderStructure(docEntries, fileEntries)
}

function createFilesystemDoc(projectPath) {
  return {
    _id: deterministicObjectId(`doc:${projectPath}`),
    name: path.basename(projectPath),
  }
}

function createFilesystemFile(projectPath) {
  return {
    _id: deterministicObjectId(`file:${projectPath}`),
    name: path.basename(projectPath),
  }
}

function deterministicObjectId(input) {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 24)
}

const ProjectEntityHandler = {
  getAllDocs,
  getAllFiles,
  getAllEntities,
  getAllDocPathsFromProjectById,
  getDoc,
  getDocPathByProjectIdAndDocId,
  getDocPathFromProjectByDocId,
  _getAllFolders,
}

export default {
  ...callbackifyAll(ProjectEntityHandler, {
    multiResult: {
      getDoc: ['lines', 'rev', 'version', 'ranges'],
    },
  }),
  promises: ProjectEntityHandler,
  getAllEntitiesFromProject,
  getAllDocPathsFromProject,
  buildFilesystemRootFolder,
  _getAllFoldersFromProject,
}
