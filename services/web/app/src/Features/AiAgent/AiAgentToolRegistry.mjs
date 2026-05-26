import path from 'node:path'
import crypto from 'node:crypto'
import { z } from 'zod'
import { AgentEvent } from '../../models/AgentEvent.mjs'
import { createPatch } from './AiAgentPatchManager.mjs'
import ProjectEntityHandler from '../Project/ProjectEntityHandler.mjs'
import CompileManager from '../Compile/CompileManager.mjs'

// Compatibility catalog for settings, plugin manifests, and reviewed patch
// workflows. The normal project agent runtime is Cline-backed and must not route
// model turns through this legacy JSON tool registry.
const DEFAULT_READ_CHARS = 12_000
const MAX_READ_CHARS = 50_000
const DEFAULT_SEARCH_RESULTS = 20
const MAX_SEARCH_RESULTS = 50
const SENSITIVE_PATH_PATTERNS = [
  /^\/?\.env(?:\.|$)/i,
  /^\/?secrets(?:\/|$)/i,
  /^\/?credentials\./i,
  /^\/?渠道\.txt$/i,
  /\.pem$/i,
  /\.key$/i,
]

const ListFilesInputSchema = z.object({
  pathPrefix: z.string().trim().max(500).optional(),
  extensions: z.array(z.string().trim().min(1).max(20)).max(20).optional(),
})

const ReadFileInputSchema = z.object({
  path: z.string().trim().min(1).max(500),
  maxChars: z.number().int().positive().max(MAX_READ_CHARS).optional(),
})

const SearchInputSchema = z.object({
  query: z.string().trim().min(1).max(200),
  extensions: z.array(z.string().trim().min(1).max(20)).max(20).optional(),
  maxResults: z.number().int().positive().max(MAX_SEARCH_RESULTS).optional(),
})

const GetMapInputSchema = z.object({
  maxFiles: z.number().int().positive().max(200).optional(),
})

const EmptyInputSchema = z.object({}).default({})
const CompileRunInputSchema = z.object({
  stopOnFirstError: z.boolean().optional(),
})
const PatchProposeInputSchema = z.object({
  summary: z.string().trim().max(1000).optional(),
  operations: z
    .array(
      z.discriminatedUnion('type', [
        z.object({
          type: z.literal('replace_text'),
          path: z.string().trim().min(1).max(500),
          oldText: z.string().min(1).max(50_000),
          newText: z.string().max(50_000),
        }),
        z.object({
          type: z.literal('create_doc'),
          path: z.string().trim().min(1).max(500),
          content: z.string().max(50_000),
        }),
        z.object({
          type: z.literal('delete_doc'),
          path: z.string().trim().min(1).max(500),
        }),
        z.object({
          type: z.literal('rename_entity'),
          path: z.string().trim().min(1).max(500),
          newName: z.string().trim().min(1).max(255),
        }),
        z.object({
          type: z.literal('move_entity'),
          path: z.string().trim().min(1).max(500),
          targetFolderPath: z.string().trim().min(1).max(500),
        }),
      ])
    )
    .min(1)
    .max(8),
})

const TOOL_DEFINITIONS = [
  {
    name: 'project.list_files',
    description: 'List project docs and uploaded files with basic metadata.',
    inputSchema: ListFilesInputSchema,
    inputExample: { pathPrefix: '/', extensions: ['.tex'] },
    access: 'read',
    requiresApproval: false,
    category: 'project',
    riskLevel: 'low',
    execute: listFiles,
  },
  {
    name: 'project.read_file',
    description: 'Read a text document from the current project.',
    inputSchema: ReadFileInputSchema,
    inputExample: { path: '/main.tex' },
    access: 'read',
    requiresApproval: false,
    category: 'project',
    riskLevel: 'low',
    execute: readFile,
  },
  {
    name: 'project.search',
    description: 'Search project text documents by plain substring.',
    inputSchema: SearchInputSchema,
    inputExample: { query: '\\label', extensions: ['.tex'], maxResults: 20 },
    access: 'read',
    requiresApproval: false,
    category: 'project',
    riskLevel: 'low',
    execute: searchProject,
  },
  {
    name: 'project.get_map',
    description: 'Build a compact LaTeX project map with labels and includes.',
    inputSchema: GetMapInputSchema,
    inputExample: { maxFiles: 100 },
    access: 'read',
    requiresApproval: false,
    category: 'project',
    riskLevel: 'low',
    execute: getProjectMap,
  },
  {
    name: 'editor.get_selection',
    description: 'Return the current editor selection supplied by the browser.',
    inputSchema: EmptyInputSchema,
    inputExample: {},
    access: 'read',
    requiresApproval: false,
    category: 'editor',
    riskLevel: 'low',
    execute: getSelection,
  },
  {
    name: 'compile.get_last_result',
    description: 'Return the last compile result when one is attached to the session.',
    inputSchema: EmptyInputSchema,
    inputExample: {},
    access: 'read',
    requiresApproval: false,
    category: 'compile',
    riskLevel: 'low',
    execute: getLastCompileResult,
  },
  {
    name: 'compile.run',
    description: 'Run a controlled project compile and return a compact result.',
    inputSchema: CompileRunInputSchema,
    inputExample: { stopOnFirstError: true },
    access: 'read',
    requiresApproval: false,
    category: 'compile',
    riskLevel: 'medium',
    execute: runCompile,
  },
  {
    name: 'patch.propose',
    description:
      'Create a pending replace_text, create_doc, delete_doc, rename_entity, or move_entity patch for user review. This does not edit files.',
    inputSchema: PatchProposeInputSchema,
    inputExample: {
      summary: 'Create a smoke-test file',
      operations: [
        {
          type: 'create_doc',
          path: '/agent-real-channel-smoke.tex',
          content: 'ROOT_CHANNEL_AGENT_ACT_OK\n',
        },
      ],
    },
    access: 'write',
    requiresApproval: true,
    category: 'patch',
    riskLevel: 'medium',
    execute: proposePatch,
  },
]

const toolsByName = new Map(TOOL_DEFINITIONS.map(tool => [tool.name, tool]))

export class AiAgentToolError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AiAgentToolError'
    this.code = code
  }
}

export function listToolDefinitions() {
  return TOOL_DEFINITIONS.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.inputSchema),
    inputExample: tool.inputExample || {},
    access: tool.access,
    requiresApproval: tool.requiresApproval,
    category: tool.category,
    riskLevel: tool.riskLevel,
  }))
}

export async function executeTool({
  name,
  input = {},
  projectId,
  userId,
  sessionId,
  selection,
}) {
  const tool = toolsByName.get(name)
  if (!tool) {
    throw new AiAgentToolError('AGENT_TOOL_NOT_FOUND', 'Agent tool not found')
  }
  const parsedInput = tool.inputSchema.parse(input || {})
  return tool.execute({
    projectId,
    userId,
    sessionId,
    input: parsedInput,
    selection,
  })
}

async function listFiles({ projectId, input }) {
  const [docs, files] = await Promise.all([
    ProjectEntityHandler.promises.getAllDocs(projectId),
    ProjectEntityHandler.promises.getAllFiles(projectId),
  ])
  const pathPrefix = input.pathPrefix ? normalizeProjectPath(input.pathPrefix) : '/'
  const extensions = normalizeExtensions(input.extensions)

  return {
    docs: Object.entries(docs)
      .filter(([docPath]) => pathMatches(docPath, pathPrefix, extensions))
      .map(([docPath, doc]) => ({
        path: docPath,
        type: 'doc',
        chars: getDocText(doc).length,
        lines: Array.isArray(doc.lines) ? doc.lines.length : 0,
      }))
      .sort(comparePathItems),
    files: Object.keys(files)
      .filter(filePath => pathMatches(filePath, pathPrefix, extensions))
      .map(filePath => ({
        path: filePath,
        type: 'file',
      }))
      .sort(comparePathItems),
  }
}

async function readFile({ projectId, input }) {
  const requestedPath = normalizeProjectPath(input.path)
  assertSafePath(requestedPath)

  const docs = await ProjectEntityHandler.promises.getAllDocs(projectId)
  const doc = docs[requestedPath]
  if (!doc) {
    throw new AiAgentToolError('AGENT_FILE_NOT_FOUND', 'Project file not found')
  }

  const maxChars = input.maxChars || DEFAULT_READ_CHARS
  const content = getDocText(doc)
  const truncated = content.length > maxChars
  return {
    path: requestedPath,
    docId: doc._id?.toString?.() || null,
    rev: doc.rev ?? null,
    sha256: sha256(content),
    content: truncated ? content.slice(0, maxChars) : content,
    truncated,
  }
}

async function searchProject({ projectId, input }) {
  const docs = await ProjectEntityHandler.promises.getAllDocs(projectId)
  const extensions = normalizeExtensions(input.extensions)
  const query = input.query.toLowerCase()
  const maxResults = input.maxResults || DEFAULT_SEARCH_RESULTS
  const results = []

  for (const [docPath, doc] of Object.entries(docs).sort(comparePathEntries)) {
    if (!pathMatches(docPath, '/', extensions)) {
      continue
    }
    const lines = Array.isArray(doc.lines) ? doc.lines : []
    for (let index = 0; index < lines.length; index += 1) {
      const line = String(lines[index])
      if (!line.toLowerCase().includes(query)) {
        continue
      }
      results.push({
        path: docPath,
        line: index + 1,
        preview: line.slice(0, 500),
      })
      if (results.length >= maxResults) {
        return {
          query: input.query,
          results,
          truncated: true,
        }
      }
    }
  }

  return {
    query: input.query,
    results,
    truncated: false,
  }
}

async function getProjectMap({ projectId, input }) {
  const docs = await ProjectEntityHandler.promises.getAllDocs(projectId)
  const maxFiles = input.maxFiles || 100
  const fileEntries = Object.entries(docs).sort(comparePathEntries).slice(0, maxFiles)
  const files = fileEntries.map(([docPath, doc]) => {
    const content = getDocText(doc)
    return {
      path: docPath,
      chars: content.length,
      includes: extractLatexCommands(content, ['input', 'include']),
      bibliographies: extractLatexCommands(content, ['bibliography', 'addbibresource']),
      labels: extractLatexCommands(content, ['label']).slice(0, 100),
      refs: extractLatexCommands(content, ['ref', 'eqref', 'autoref', 'cref']).slice(0, 100),
      citations: extractCitationKeys(content).slice(0, 100),
      bibKeys: path.extname(docPath).toLowerCase() === '.bib'
        ? extractBibKeys(content).slice(0, 200)
        : [],
    }
  })

  return {
    rootDoc: docs['/main.tex'] ? '/main.tex' : files[0]?.path || null,
    files,
    truncated: Object.keys(docs).length > maxFiles,
  }
}

async function getSelection({ selection }) {
  if (!selection?.text?.trim()) {
    return {
      available: false,
      message: 'No editor selection was supplied for this agent turn.',
    }
  }
  return {
    available: true,
    docId: selection.docId || null,
    path: selection.path || null,
    text: selection.text,
  }
}

async function getLastCompileResult({ projectId, sessionId }) {
  if (!sessionId) {
    return {
      available: false,
      message: 'No agent session is attached to this tool call.',
    }
  }

  const event = await AgentEvent.findOne({
    projectId,
    sessionId,
    type: 'compile_result',
  })
    .sort({ sequence: -1 })
    .exec()

  if (!event) {
    return {
      available: false,
      message: 'No compile result has been recorded for this agent session.',
    }
  }

  return {
    available: true,
    patchId: event.payload?.patchId || null,
    result: event.payload?.result || null,
  }
}

async function runCompile({ projectId, userId, input }) {
  try {
    return publicCompileResult(
      await CompileManager.promises.compile(projectId, userId, {
        isAutoCompile: false,
        fileLineErrors: true,
        stopOnFirstError: input.stopOnFirstError === true,
      })
    )
  } catch {
    return {
      ok: false,
      status: 'failed',
      message: 'Compile request failed',
    }
  }
}

async function proposePatch({ projectId, userId, sessionId, input }) {
  const patch = await createPatch({
    projectId,
    userId,
    sessionId,
    summary: input.summary,
    operations: input.operations,
  })

  return {
    patchId: patch.id,
    requiresApproval: true,
    patch,
  }
}

function publicCompileResult(result) {
  return {
    ok: true,
    status: result.status || 'unknown',
    buildId: result.buildId || null,
    clsiServerId: result.clsiServerId || null,
    outputFiles: (result.outputFiles || [])
      .slice(0, 50)
      .map(file => ({
        path: file.path,
        type: file.type || null,
        size: typeof file.size === 'number' ? file.size : null,
      })),
    validationProblems: Array.isArray(result.validationProblems)
      ? result.validationProblems.slice(0, 25)
      : result.validationProblems || null,
    timings: result.timings || null,
  }
}

function normalizeProjectPath(projectPath) {
  const normalized = path.posix.normalize(`/${projectPath}`.replaceAll('\\', '/'))
  if (normalized.includes('..')) {
    throw new AiAgentToolError('AGENT_INVALID_PATH', 'Invalid project path')
  }
  return normalized
}

function assertSafePath(projectPath) {
  if (SENSITIVE_PATH_PATTERNS.some(pattern => pattern.test(projectPath))) {
    throw new AiAgentToolError('AGENT_SENSITIVE_PATH', 'Sensitive path is blocked')
  }
}

function normalizeExtensions(extensions) {
  if (!extensions?.length) {
    return null
  }
  return new Set(
    extensions.map(extension =>
      extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`
    )
  )
}

function pathMatches(projectPath, pathPrefix, extensions) {
  const normalized = normalizeProjectPath(projectPath)
  if (!normalized.startsWith(pathPrefix)) {
    return false
  }
  return !extensions || extensions.has(path.extname(normalized).toLowerCase())
}

function comparePathItems(left, right) {
  return left.path.localeCompare(right.path)
}

function comparePathEntries([left], [right]) {
  return left.localeCompare(right)
}

function getDocText(doc) {
  return Array.isArray(doc.lines) ? doc.lines.join('\n') : ''
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function extractLatexCommands(content, commandNames) {
  const names = commandNames.join('|')
  const regex = new RegExp(`\\\\(?:${names})(?:\\[[^\\]]*\\])?\\{([^}]*)\\}`, 'g')
  const values = []
  let match
  while ((match = regex.exec(content))) {
    values.push(...match[1].split(',').map(value => value.trim()).filter(Boolean))
  }
  return [...new Set(values)]
}

function extractCitationKeys(content) {
  return extractLatexCommands(content, ['cite', 'citep', 'citet', 'parencite', 'textcite'])
}

function extractBibKeys(content) {
  const regex = /@\w+\s*\{\s*([^,\s]+)\s*,/g
  const keys = []
  let match
  while ((match = regex.exec(content))) {
    keys.push(match[1])
  }
  return [...new Set(keys)]
}
