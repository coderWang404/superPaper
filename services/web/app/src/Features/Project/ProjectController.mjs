import _ from 'lodash'
import OError from '@superpaper/o-error'
import crypto from 'node:crypto'
import pProps from 'p-props'
import logger from '@superpaper/logger'
import { expressify } from '@superpaper/promise-utils'
import mongodb from 'mongodb-legacy'
import ProjectDeleter from './ProjectDeleter.mjs'
import { DeletedProjectReasons } from './DeletedProjectReasons.mjs'
import ProjectDuplicator from './ProjectDuplicator.mjs'
import ProjectCreationHandler from './ProjectCreationHandler.mjs'
import EditorController from '../Editor/EditorController.mjs'
import ProjectHelper from './ProjectHelper.mjs'
import metrics from '@superpaper/metrics'
import { User } from '../../models/User.mjs'
import Settings from '@superpaper/settings'
import AuthorizationManager from '../Authorization/AuthorizationManager.mjs'
import InactiveProjectManager from '../InactiveData/InactiveProjectManager.mjs'
import ProjectUpdateHandler from './ProjectUpdateHandler.mjs'
import ProjectGetter from './ProjectGetter.mjs'
import PrivilegeLevels from '../Authorization/PrivilegeLevels.mjs'
import SessionManager from '../Authentication/SessionManager.mjs'
import Sources from '../Authorization/Sources.mjs'
import TokenAccessHandler from '../TokenAccess/TokenAccessHandler.mjs'
import CollaboratorsGetter from '../Collaborators/CollaboratorsGetter.mjs'
import ProjectEntityHandler from './ProjectEntityHandler.mjs'
import ProjectFileStore from './ProjectFileStore.mjs'
import TpdsProjectFlusher from '../ThirdPartyDataStore/TpdsProjectFlusher.mjs'
import Features from '../../infrastructure/Features.mjs'
import UserController from '../User/UserController.mjs'
import AnalyticsManager from '../Telemetry/TelemetryManager.mjs'
import LocalsHelper from '../FeatureRollouts/LocalsHelper.mjs'
import SplitTestHandler from '../FeatureRollouts/FeatureRolloutHandler.mjs'
import SplitTestSessionHandler from '../FeatureRollouts/FeatureRolloutSessionHandler.mjs'
import SpellingHandler from '../Spelling/SpellingHandler.mjs'
import AdminAuthorizationHelper from '../Helpers/AdminAuthorizationHelper.mjs'
import ProjectAuditLogHandler from './ProjectAuditLogHandler.mjs'
import PublicAccessLevels from '../Authorization/PublicAccessLevels.mjs'
import TagsHandler from '../Tags/TagsHandler.mjs'
import TutorialHandler from '../Tutorial/TutorialHandler.mjs'
import Modules from '../../infrastructure/Modules.mjs'
import { z, zz, parseReq } from '../../infrastructure/Validation.mjs'
import UserGetter from '../User/UserGetter.mjs'
import UserSettingsHelper from './UserSettingsHelper.mjs'

const { hasAdminAccess } = AdminAuthorizationHelper
const { ObjectId } = mongodb
/**
 * @import { GetProjectsRequest, GetProjectsResponse, Project } from "./types"
 */

const updateProjectAdminSettingsSchema = z.object({
  params: z.object({
    Project_id: zz.coercedObjectId(ObjectId),
  }),
  body: z.object({
    publicAccessLevel: z
      .enum(
        [PublicAccessLevels.PRIVATE, PublicAccessLevels.TOKEN_BASED],
        'unexpected access level'
      )
      .optional(),
  }),
})

const updateProjectSettingsSchema = z.object({
  params: z.object({
    Project_id: zz.coercedObjectId(),
  }),
  body: z.object({
    compiler: z.string().optional(),
    imageName: z.string().optional(),
    mainBibliographyDocId: zz.objectId().optional(),
    name: z.string().optional(),
    rootDocId: zz.objectId().optional(),
    spellCheckLanguage: z.string().optional(),
  }),
})

const _ProjectController = {
  _isInPercentageRollout(rolloutName, objectId, percentage) {
    if (Settings.bypassPercentageRollouts === true) {
      return true
    }
    const data = `${rolloutName}:${objectId.toString()}`
    const md5hash = crypto.createHash('md5').update(data).digest('hex')
    const counter = parseInt(md5hash.slice(26, 32), 16)
    return counter % 100 < percentage
  },

  async updateProjectSettings(req, res) {
    const { params, body } = parseReq(req, updateProjectSettingsSchema)
    const projectId = params.Project_id

    if (body.compiler != null) {
      await EditorController.promises.setCompiler(projectId, body.compiler)
    }

    if (body.imageName != null) {
      await EditorController.promises.setImageName(projectId, body.imageName)
    }

    if (body.name != null) {
      await EditorController.promises.renameProject(projectId, body.name)
    }

    if (body.spellCheckLanguage != null) {
      await EditorController.promises.setSpellCheckLanguage(
        projectId,
        body.spellCheckLanguage
      )
    }

    if (body.rootDocId != null) {
      await EditorController.promises.setRootDoc(projectId, body.rootDocId)
    }

    if (body.mainBibliographyDocId != null) {
      await EditorController.promises.setMainBibliographyDoc(
        projectId,
        body.mainBibliographyDocId
      )
    }

    res.sendStatus(204)
  },

  async updateProjectAdminSettings(req, res) {
    const { params, body } = parseReq(req, updateProjectAdminSettingsSchema)
    const projectId = params.Project_id
    const user = SessionManager.getSessionUser(req.session)
    if (!Features.hasFeature('link-sharing')) {
      return res.sendStatus(403) // return Forbidden if link sharing is not enabled
    }

    if (body.publicAccessLevel != null) {
      await EditorController.promises.setPublicAccessLevel(
        projectId,
        body.publicAccessLevel
      )

      await ProjectAuditLogHandler.promises.addEntry(
        projectId,
        'toggle-access-level',
        user._id,
        req.ip,
        { publicAccessLevel: body.publicAccessLevel, status: 'OK' }
      )
      res.sendStatus(204)
    } else {
      res.sendStatus(500)
    }
  },

  async deleteProject(req, res) {
    const projectId = req.params.Project_id
    const user = SessionManager.getSessionUser(req.session)
    await ProjectDeleter.promises.deleteProject(projectId, {
      deleterUser: user,
      ipAddress: req.ip,
      deletedReason: DeletedProjectReasons.USER,
    })
    ProjectAuditLogHandler.addEntryInBackground(
      projectId,
      'project-deleted',
      user._id,
      req.ip
    )
    res.sendStatus(200)
  },

  async archiveProject(req, res) {
    const projectId = req.params.Project_id
    const userId = SessionManager.getLoggedInUserId(req.session)
    await ProjectDeleter.promises.archiveProject(projectId, userId)
    ProjectAuditLogHandler.addEntryInBackground(
      projectId,
      'project-archived',
      userId,
      req.ip
    )
    res.sendStatus(200)
  },

  async unarchiveProject(req, res) {
    const projectId = req.params.Project_id
    const userId = SessionManager.getLoggedInUserId(req.session)
    await ProjectDeleter.promises.unarchiveProject(projectId, userId)
    ProjectAuditLogHandler.addEntryInBackground(
      projectId,
      'project-unarchived',
      userId,
      req.ip
    )
    res.sendStatus(200)
  },

  async trashProject(req, res) {
    const projectId = req.params.project_id
    const userId = SessionManager.getLoggedInUserId(req.session)
    await ProjectDeleter.promises.trashProject(projectId, userId)
    ProjectAuditLogHandler.addEntryInBackground(
      projectId,
      'project-trashed',
      userId,
      req.ip
    )
    res.sendStatus(200)
  },

  async untrashProject(req, res) {
    const projectId = req.params.project_id
    const userId = SessionManager.getLoggedInUserId(req.session)
    await ProjectDeleter.promises.untrashProject(projectId, userId)
    ProjectAuditLogHandler.addEntryInBackground(
      projectId,
      'project-untrashed',
      userId,
      req.ip
    )
    res.sendStatus(200)
  },

  async expireDeletedProjectsAfterDuration(_req, res) {
    await ProjectDeleter.promises.expireDeletedProjectsAfterDuration()
    res.sendStatus(200)
  },

  async expireDeletedProject(req, res) {
    const { projectId } = req.params
    await ProjectDeleter.promises.expireDeletedProject(projectId)
    res.sendStatus(200)
  },

  async restoreProject(req, res) {
    const userId = SessionManager.getLoggedInUserId(req.session)
    const projectId = req.params.Project_id
    await ProjectDeleter.promises.restoreProject(projectId)
    ProjectAuditLogHandler.addEntryInBackground(
      projectId,
      'project-restored',
      userId,
      req.ip
    )
    res.sendStatus(200)
  },

  async cloneProject(req, res, next) {
    res.setTimeout(5 * 60 * 1000) // allow extra time for the copy to complete
    metrics.inc('cloned-project')
    const projectId = req.params.Project_id
    let { projectName, isDebugCopy, cloneHistory, cloneRanges, tags } = req.body
    const currentUser = SessionManager.getSessionUser(req.session)
    if (!hasAdminAccess(currentUser)) {
      isDebugCopy = false
      cloneHistory = false
      cloneRanges = false
    }
    logger.debug({ projectId, projectName, isDebugCopy }, 'cloning project')
    if (!SessionManager.isUserLoggedIn(req.session)) {
      return res.json({ redir: '/register' })
    }
    const { first_name: firstName, last_name: lastName, email } = currentUser
    try {
      const project = await ProjectDuplicator.promises.duplicate(
        currentUser,
        projectId,
        projectName,
        tags,
        { isDebugCopy, cloneHistory, cloneRanges }
      )
      ProjectAuditLogHandler.addEntryInBackground(
        projectId,
        'project-cloned',
        currentUser._id,
        req.ip
      )
      res.json({
        name: project.name,
        lastUpdated: project.lastUpdated,
        project_id: project._id,
        owner_ref: project.owner_ref,
        owner: {
          first_name: firstName,
          last_name: lastName,
          email,
          _id: currentUser._id,
        },
      })
    } catch (err) {
      OError.tag(err, 'error cloning project', {
        projectId,
        userId: currentUser._id,
      })
      return next(err)
    }
  },

  async newProject(req, res) {
    const currentUser = SessionManager.getSessionUser(req.session)
    const {
      first_name: firstName,
      last_name: lastName,
      email,
      _id: userId,
    } = currentUser
    const projectName =
      req.body.projectName != null ? req.body.projectName.trim() : undefined
    const { template } = req.body

    const project = await (template === 'example'
      ? ProjectCreationHandler.promises.createExampleProject(
          userId,
          projectName
        )
      : ProjectCreationHandler.promises.createBasicProject(userId, projectName))

    ProjectAuditLogHandler.addEntryInBackground(
      project._id,
      'project-created',
      project.owner_ref,
      req.ip
    )

    res.json({
      project_id: project._id,
      owner_ref: project.owner_ref,
      owner: {
        first_name: firstName,
        last_name: lastName,
        email,
        _id: userId,
      },
    })
  },

  async renameProject(req, res) {
    const projectId = req.params.Project_id
    const newName = req.body.newProjectName
    await EditorController.promises.renameProject(projectId, newName)
    res.sendStatus(200)
  },

  async userProjectsJson(req, res) {
    const userId = SessionManager.getLoggedInUserId(req.session)
    let projects = await ProjectGetter.promises.findAllUsersProjects(
      userId,
      'name lastUpdated publicAccesLevel archived trashed owner_ref'
    )

    // _buildProjectList already converts archived/trashed to booleans so isArchivedOrTrashed should not be used here
    projects = ProjectController._buildProjectList(projects, userId)
      .filter(p => !(p.archived || p.trashed))
      .map(p => ({ _id: p.id, name: p.name, accessLevel: p.accessLevel }))

    res.json({ projects })
  },

  async projectEntitiesJson(req, res) {
    const projectId = req.params.Project_id
    const project = await ProjectGetter.promises.getProject(projectId)

    const { docs, files } =
      ProjectEntityHandler.getAllEntitiesFromProject(project)
    const entities = docs
      .concat(files)
      // Sort by path ascending
      .sort((a, b) => (a.path > b.path ? 1 : a.path < b.path ? -1 : 0))
      .map(e => ({
        path: e.path,
        type: e.doc != null ? 'doc' : 'file',
      }))
    res.json({ project_id: projectId, entities })
  },

  async projectFileTreeJson(req, res) {
    const projectId = req.params.Project_id
    const project = await ProjectGetter.promises.getProject(projectId)
    let rootFolder = project.rootFolder[0]

    if (project.storageBackend === 'filesystem') {
      const entries = await ProjectFileStore.listFiles({ projectId })
      rootFolder = ProjectEntityHandler.buildFilesystemRootFolder(
        entries,
        project.rootFolder?.[0]
      )
    }

    res.json({ project_id: projectId, rootFolder: [rootFolder] })
  },

  async loadEditor(req, res, next) {
    const timer = new metrics.Timer('load-editor')
    if (!Settings.editorIsOpen) {
      return res.render('general/closed', { title: 'updating_site' })
    }

    let anonymous, userId, sessionUser
    if (SessionManager.isUserLoggedIn(req.session)) {
      sessionUser = SessionManager.getSessionUser(req.session)
      userId = SessionManager.getLoggedInUserId(req.session)
      anonymous = false
    } else {
      sessionUser = null
      anonymous = true
      userId = null
    }

    const projectId = req.params.Project_id

    // should not be used in place of split tests query param overrides (?my-split-test-name=my-variant)
    function shouldDisplayFeature(name, variantFlag) {
      if (req.query && req.query[name]) {
        return req.query[name] === 'true'
      } else {
        return variantFlag === true
      }
    }

    const splitTests = [
      'bibtex-visual-editor',
      'compile-log-events',
      'visual-preview',
      'external-socket-heartbeat',
      'null-test-share-modal',
      'pdf-caching-prefetch-large',
      'pdf-caching-prefetching',
      'revert-file',
      'revert-project',
      !anonymous && 'ro-mirror-on-client',
      'track-pdf-download',
      'word-count-client',
      'chat-edit-delete',
      'editor-context-menu',
      'email-notifications',
      'editor-tabs',
      'superpaper-code',
      'export-docx',
      'sharing-updates',
    ].filter(Boolean)

    const getUserValues = async userId =>
      pProps(
        _.mapValues({
          user: (async () => {
            const user = await User.findById(
              userId,
              'email first_name last_name referal_id signUpDate featureSwitches features featuresEpoch alphaProgram isAdmin ace labsProgram labsExperiments completedTutorials aiFeatures'
            ).exec()
            // Handle case of deleted user
            if (!user) {
              UserController.logout(req, res, next)
              return
            }
            logger.debug({ projectId, userId }, 'got user')
            return user
          })(),
          learnedWords: SpellingHandler.promises.getUserDictionary(userId),
          projectTags: TagsHandler.promises.getTagsForProject(
            userId,
            projectId
          ),
          isTokenMember: CollaboratorsGetter.promises.userIsTokenMember(
            userId,
            projectId
          ),
          isInvitedMember:
            CollaboratorsGetter.promises.isUserInvitedMemberOfProject(
              userId,
              projectId
            ),
        })
      )

    try {
      const responses = await pProps({
        userValues: userId ? getUserValues(userId) : defaultUserValues(),
        project: ProjectGetter.promises.getProject(projectId, {
          _id: 1,
          name: 1,
          active: 1,
          deferredTpdsFlushCounter: 1,
          lastUpdated: 1,
          owner_ref: 1,
          superpaper: 1,
          tokens: 1,
        }),
      })

      const { project, userValues } = responses

      await Promise.all([
        InactiveProjectManager.promises.reactivateProjectIfRequired(project),
        TpdsProjectFlusher.promises.flushProjectToTpdsIfNeeded(project),
      ])

      const {
        user,
        learnedWords,
        projectTags,
        isTokenMember,
        isInvitedMember,
      } = userValues

      const getSplitTestAssignment = async splitTest => {
        return await SplitTestHandler.promises.getAssignment(
          req,
          res,
          splitTest
        )
      }
      const splitTestAssignments = {}
      await Promise.all(
        splitTests.map(async splitTest => {
          splitTestAssignments[splitTest] =
            await getSplitTestAssignment(splitTest)
        })
      )

      // PDF caching, these tests are archived but we are keeping the frontend code unchanged for now
      LocalsHelper.setSplitTestVariant(
        res.locals,
        'pdf-caching-cached-url-lookup',
        Settings.cachedUrlLookupEnabled ? 'enabled' : 'disabled'
      )
      LocalsHelper.setSplitTestVariant(
        res.locals,
        'pdf-caching-mode',
        Settings.pdfCachingMode ? 'enabled' : 'disabled'
      )

      const anonRequestToken = TokenAccessHandler.getRequestToken(
        req,
        projectId
      )
      const imageNames = await ProjectHelper.getAllowedImagesForUser(user)

      const privilegeLevel =
        await AuthorizationManager.promises.getPrivilegeLevelForProject(
          userId,
          projectId,
          anonRequestToken
        )

      await Modules.promises.hooks.fire('enforceCollaboratorLimit', projectId)
      if (isTokenMember) {
        // Check explicitly that the user is in read write token refs, while this could be inferred
        // from the privilege level, the privilege level of token members might later be restricted
        const isReadWriteTokenMember =
          await CollaboratorsGetter.promises.userIsReadWriteTokenMember(
            userId,
            projectId
          )
        if (isReadWriteTokenMember) {
          // Check for an edge case where a user is both in read write token access refs but also
          // an invited read write member. Ensure they are not redirected to the sharing updates page
          // We could also delete the token access ref if the user is already a member of the project
          const isInvitedReadWriteMember =
            await CollaboratorsGetter.promises.isUserInvitedReadWriteMemberOfProject(
              userId,
              projectId
            )
          if (!isInvitedReadWriteMember) {
            return res.redirect(`/project/${projectId}/sharing-updates`)
          }
        }
      }

      if (privilegeLevel == null || privilegeLevel === PrivilegeLevels.NONE) {
        return res.sendStatus(401)
      }

      let wsUrl = Settings.wsUrl
      let metricName = 'load-editor-ws'
      if (
        Settings.wsUrlV2 &&
        Settings.wsUrlV2Percentage > 0 &&
        (new ObjectId(projectId).getTimestamp() / 1000) % 100 <
          Settings.wsUrlV2Percentage
      ) {
        wsUrl = Settings.wsUrlV2
        metricName += '-v2'
      }
      if (req.query && req.query.ws === 'fallback') {
        // `?ws=fallback` will connect to the bare origin, and ignore
        //   the custom wsUrl. Hence it must load the client side
        //   javascript from there too.
        // Not resetting it here would possibly load a socket.io v2
        //  client and connect to a v0 endpoint.
        wsUrl = undefined
        metricName += '-fallback'
      }
      metrics.inc(metricName)

      // don't need to wait for these to complete
      ProjectUpdateHandler.promises
        .markAsOpened(projectId)
        .catch(err =>
          logger.error({ err, projectId }, 'failed to mark project as opened')
        )
      SplitTestSessionHandler.promises
        .sessionMaintenance(req, userId ? user : null)
        .catch(err =>
          logger.error({ err }, 'failed to update split test info in session')
        )

      const ownerFeatures = await UserGetter.promises.getUserFeatures(
        project.owner_ref
      )
      if (userId) {
        const projectAccess =
          await CollaboratorsGetter.promises.getProjectAccess(projectId)
        const { namedEditors, pendingEditors, tokenEditors } =
          projectAccess.getStats()

        let mode = 'edit'
        if (privilegeLevel === PrivilegeLevels.READ_ONLY) {
          mode = 'view'
        }

        const projectOpenedSegmentation = {
          role: privilegeLevel,
          mode,
          ownerId: project.owner_ref,
          projectId: project._id,
          namedEditors,
          pendingEditors,
          tokenEditors,
        }
        AnalyticsManager.recordEventForUserInBackground(
          userId,
          'project-opened',
          projectOpenedSegmentation
        )
        User.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { lastActive: new Date() } }
        )
          .exec()
          .catch(err =>
            logger.error(
              { err, userId },
              'failed to update lastActive for user'
            )
          )
      }

      const debugPdfDetach = shouldDisplayFeature('debug_pdf_detach')

      const detachRole = req.params.detachRole

      const template =
        detachRole === 'detached'
          ? 'project/ide-react-detached'
          : 'project/ide-react'

      const capabilities = [...req.capabilitySet]

      if (Features.hasFeature('chat')) {
        capabilities.push('chat')
      }

      if (Features.hasFeature('link-sharing')) {
        capabilities.push('link-sharing')
      }

      let fullFeatureSet = user?.features
      if (!anonymous) {
        fullFeatureSet = await UserGetter.promises.getUserFeatures(userId)
      }

      const showAiFeatures = false

      const userSettings = await UserSettingsHelper.buildUserSettings(
        req,
        res,
        user
      )

      const initialLoadingScreenTheme = getInitialLoadingScreenTheme(
        userSettings?.overallTheme
      )

      res.render(template, {
        title: project.name,
        priority_title: true,
        bodyClasses: ['editor'],
        project_id: project._id,
        projectName: project.name,
        canUseClsiCache: Boolean(Settings.apis?.clsiCache?.instances?.length),
        user: {
          id: userId,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          referal_id: user.referal_id,
          signUpDate: user.signUpDate,
          featureSwitches: user.featureSwitches,
          features: fullFeatureSet,
          alphaProgram: user.alphaProgram,
          labsProgram: user.labsProgram,
          inactiveTutorials: TutorialHandler.getInactiveTutorials(user),
          isAdmin: hasAdminAccess(user),
        },
        initialLoadingScreenTheme,
        userSettings,
        labsExperiments: user.labsExperiments ?? [],
        privilegeLevel,
        anonymous,
        isTokenMember,
        isRestrictedTokenMember: AuthorizationManager.isRestrictedUser(
          userId,
          privilegeLevel,
          isTokenMember,
          isInvitedMember
        ),
        capabilities,
        roMirrorOnClientNoLocalStorage:
          Settings.adminOnlyLogin || project.name.startsWith('Debug: '),
        languages: Settings.languages,
        learnedWords,
        editorThemes: THEME_LIST,
        legacyEditorThemes: LEGACY_THEME_LIST,
        maxDocLength: Settings.max_doc_length,
        maxReconnectGracefullyIntervalMs:
          Settings.maxReconnectGracefullyIntervalMs,
        imageNames,
        gitBridgePublicBaseUrl: Settings.gitBridgePublicBaseUrl,
        gitBridgeEnabled: Features.hasFeature('git-bridge'),
        wsUrl,
        debugPdfDetach,
        userRestrictions: Array.from(req.userRestrictions || []),
        showAiFeatures,
        detachRole,
        metadata: { viewport: false },
        fixedSizeDocument: true,
        otMigrationStage: project.superpaper?.history?.otMigrationStage ?? 0,
        projectTags,
        compileSettings: {
          compileTimeout: ownerFeatures?.compileTimeout,
        },
      })
      timer.done()
    } catch (err) {
      OError.tag(err, 'error getting details for project page')
      return next(err)
    }
  },

  async _refreshFeatures(req, user) {
    return user
  },
  _buildProjectList(allProjects, userId) {
    let project
    const {
      owned,
      review,
      readAndWrite,
      readOnly,
      tokenReadAndWrite,
      tokenReadOnly,
    } = allProjects
    const projects = []
    for (project of owned) {
      projects.push(
        ProjectController._buildProjectViewModel(
          project,
          'owner',
          Sources.OWNER,
          userId
        )
      )
    }
    // Invite-access
    for (project of readAndWrite) {
      projects.push(
        ProjectController._buildProjectViewModel(
          project,
          'readWrite',
          Sources.INVITE,
          userId
        )
      )
    }
    for (project of review) {
      projects.push(
        ProjectController._buildProjectViewModel(
          project,
          'review',
          Sources.INVITE,
          userId
        )
      )
    }
    for (project of readOnly) {
      projects.push(
        ProjectController._buildProjectViewModel(
          project,
          'readOnly',
          Sources.INVITE,
          userId
        )
      )
    }
    // Token-access
    //   Only add these projects if they're not already present, this gives us cascading access
    //   from 'owner' => 'token-read-only'
    for (project of tokenReadAndWrite) {
      if (
        projects.filter(p => p.id.toString() === project._id.toString())
          .length === 0
      ) {
        projects.push(
          ProjectController._buildProjectViewModel(
            project,
            'readAndWrite',
            Sources.TOKEN,
            userId
          )
        )
      }
    }
    for (project of tokenReadOnly) {
      if (
        projects.filter(p => p.id.toString() === project._id.toString())
          .length === 0
      ) {
        projects.push(
          ProjectController._buildProjectViewModel(
            project,
            'readOnly',
            Sources.TOKEN,
            userId
          )
        )
      }
    }

    return projects
  },
  _buildProjectViewModel(project, accessLevel, source, userId) {
    const archived = ProjectHelper.isArchived(project, userId)
    // If a project is simultaneously trashed and archived, we will consider it archived but not trashed.
    const trashed = ProjectHelper.isTrashed(project, userId) && !archived

    const model = {
      id: project._id,
      name: project.name,
      lastUpdated: project.lastUpdated,
      lastUpdatedBy: project.lastUpdatedBy,
      publicAccessLevel: project.publicAccesLevel,
      accessLevel,
      source,
      archived,
      trashed,
      owner_ref: project.owner_ref,
      isV1Project: false,
    }
    if (accessLevel === PrivilegeLevels.READ_ONLY && source === Sources.TOKEN) {
      model.owner_ref = null
      model.lastUpdatedBy = null
    }
    return model
  },
}

function getInitialLoadingScreenTheme(overallThemeSetting) {
  switch (overallThemeSetting) {
    case 'light-':
      return 'light'
    case '':
      return 'dark'
    case 'system':
      return 'system'
    default:
      return 'dark'
  }
}

const defaultSettingsForAnonymousUser = userId => ({
  id: userId,
  ace: {
    mode: 'none',
    theme: 'textmate',
    fontSize: '12',
    autoComplete: true,
    spellCheckLanguage: '',
    pdfViewer: '',
    syntaxValidation: true,
  },
  featureSwitches: {
    github: false,
  },
  alphaProgram: false,
  aiFeatures: {
    enabled: false,
  },
})

const defaultUserValues = () => ({
  user: defaultSettingsForAnonymousUser(null),
  learnedWords: [],
  projectTags: [],
  isTokenMember: false,
  isInvitedMember: false,
})

const THEME_LIST = [
  { name: 'cobalt', dark: true },
  { name: 'dracula', dark: true },
  { name: 'eclipse', dark: false },
  { name: 'monokai', dark: true },
  { name: 'superpaper', dark: false },
  { name: 'superpaper_dark', dark: true },
  { name: 'textmate', dark: false },
]

const LEGACY_THEME_LIST = [
  { name: 'ambiance', dark: true },
  { name: 'chaos', dark: true },
  { name: 'chrome', dark: false },
  { name: 'clouds', dark: false },
  { name: 'clouds_midnight', dark: true },
  { name: 'crimson_editor', dark: false },
  { name: 'dawn', dark: false },
  { name: 'dreamweaver', dark: false },
  { name: 'github', dark: false },
  { name: 'gob', dark: true },
  { name: 'gruvbox', dark: true },
  { name: 'idle_fingers', dark: true },
  { name: 'iplastic', dark: false },
  { name: 'katzenmilch', dark: false },
  { name: 'kr_theme', dark: true },
  { name: 'kuroir', dark: false },
  { name: 'merbivore', dark: true },
  { name: 'merbivore_soft', dark: true },
  { name: 'mono_industrial', dark: true },
  { name: 'nord_dark', dark: true },
  { name: 'pastel_on_dark', dark: true },
  { name: 'solarized_dark', dark: true },
  { name: 'solarized_light', dark: false },
  { name: 'sqlserver', dark: false },
  { name: 'terminal', dark: true },
  { name: 'tomorrow', dark: false },
  { name: 'tomorrow_night', dark: true },
  { name: 'tomorrow_night_blue', dark: true },
  { name: 'tomorrow_night_bright', dark: true },
  { name: 'tomorrow_night_eighties', dark: true },
  { name: 'twilight', dark: true },
  { name: 'vibrant_ink', dark: true },
  { name: 'xcode', dark: false },
]

const ProjectController = {
  archiveProject: expressify(_ProjectController.archiveProject),
  cloneProject: expressify(_ProjectController.cloneProject),
  deleteProject: expressify(_ProjectController.deleteProject),
  expireDeletedProject: expressify(_ProjectController.expireDeletedProject),
  expireDeletedProjectsAfterDuration: expressify(
    _ProjectController.expireDeletedProjectsAfterDuration
  ),
  loadEditor: expressify(_ProjectController.loadEditor),
  newProject: expressify(_ProjectController.newProject),
  projectEntitiesJson: expressify(_ProjectController.projectEntitiesJson),
  projectFileTreeJson: expressify(_ProjectController.projectFileTreeJson),
  renameProject: expressify(_ProjectController.renameProject),
  restoreProject: expressify(_ProjectController.restoreProject),
  trashProject: expressify(_ProjectController.trashProject),
  unarchiveProject: expressify(_ProjectController.unarchiveProject),
  untrashProject: expressify(_ProjectController.untrashProject),
  updateProjectAdminSettings: expressify(
    _ProjectController.updateProjectAdminSettings
  ),
  updateProjectSettings: expressify(_ProjectController.updateProjectSettings),
  userProjectsJson: expressify(_ProjectController.userProjectsJson),
  _buildProjectList: _ProjectController._buildProjectList,
  _buildProjectViewModel: _ProjectController._buildProjectViewModel,
  _isInPercentageRollout: _ProjectController._isInPercentageRollout,
  _refreshFeatures: _ProjectController._refreshFeatures,
}

export default ProjectController
