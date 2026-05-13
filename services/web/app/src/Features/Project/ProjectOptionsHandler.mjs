import { Project } from '../../models/Project.mjs'
import settings from '@superpaper/settings'
import { callbackify } from 'node:util'
import { db, ObjectId } from '../../infrastructure/mongodb.mjs'
import Errors from '../Errors/Errors.js'
import mongodb from 'mongodb-legacy'
import OError from '@superpaper/o-error'
const safeCompilers = ['xelatex', 'pdflatex', 'latex', 'lualatex']

const { ReturnDocument } = mongodb

const ProjectOptionsHandler = {
  /**
   * @param {string} compiler
   * @return {string}
   */
  normalizeCompiler(compiler) {
    compiler = compiler.toLowerCase()
    if (!safeCompilers.includes(compiler)) {
      throw new OError('invalid compiler', { compiler })
    }
    return compiler
  },

  async setCompiler(projectId, compiler) {
    if (!compiler) {
      return
    }
    compiler = ProjectOptionsHandler.normalizeCompiler(compiler)
    const conditions = { _id: projectId }
    const update = { compiler }
    return Project.updateOne(conditions, update, {})
  },

  /**
   * @param {string} imageName
   * @return {string | undefined}
   */
  normalizeImageName(imageName) {
    if (!imageName || !Array.isArray(settings.allowedImageNames)) {
      return undefined
    }
    imageName = imageName.toLowerCase()
    const isAllowed = settings.allowedImageNames.find(
      allowed => imageName === allowed.imageName
    )
    if (!isAllowed) {
      throw new OError('invalid imageName', { imageName })
    }
    return settings.imageRoot + '/' + imageName
  },

  async setImageName(projectId, imageName) {
    imageName = ProjectOptionsHandler.normalizeImageName(imageName)
    if (!imageName) {
      return
    }
    const conditions = { _id: projectId }
    const update = { imageName }
    return Project.updateOne(conditions, update, {})
  },

  async setSpellCheckLanguage(projectId, languageCode) {
    if (!Array.isArray(settings.languages)) {
      return
    }
    const language = settings.languages.find(
      language => language.code === languageCode
    )
    if (languageCode && !language) {
      throw new OError('invalid languageCode', { languageCode })
    }
    const conditions = { _id: projectId }
    const update = { spellCheckLanguage: languageCode }
    return Project.updateOne(conditions, update, {})
  },

  async setHistoryRangesSupport(projectId, enabled) {
    const conditions = { _id: new ObjectId(projectId) }
    const update = {
      $set: { 'superpaper.history.rangesSupportEnabled': enabled },
    }
    // NOTE: Updating the Mongoose model with the same query doesn't work. Maybe
    // because rangesSupportEnabled is not part of the schema?
    return db.projects.updateOne(conditions, update)
  },

  async setOTMigrationStage(projectId, nextStage) {
    const project = await db.projects.findOneAndUpdate(
      { _id: new ObjectId(projectId) },
      // Use $max to ensure that we never downgrade the migration stage.
      { $max: { 'superpaper.history.otMigrationStage': nextStage } },
      {
        returnDocument: ReturnDocument.AFTER,
        projection: { 'superpaper.history.otMigrationStage': 1 },
      }
    )
    if (!project) throw new Errors.NotFoundError('project does not exist')
    const { otMigrationStage } = project.superpaper.history
    return { otMigrationStage }
  },
}

export default {
  setCompiler: callbackify(ProjectOptionsHandler.setCompiler),
  setImageName: callbackify(ProjectOptionsHandler.setImageName),
  setSpellCheckLanguage: callbackify(
    ProjectOptionsHandler.setSpellCheckLanguage
  ),
  setHistoryRangesSupport: callbackify(
    ProjectOptionsHandler.setHistoryRangesSupport
  ),
  promises: ProjectOptionsHandler,
}
