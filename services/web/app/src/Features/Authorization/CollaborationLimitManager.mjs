// @ts-check

import { callbackify } from '@superpaper/promise-utils'

async function allowedNumberOfCollaboratorsInProject() {
  return -1
}

async function allowedNumberOfCollaboratorsForUser() {
  return -1
}

async function canAcceptEditCollaboratorInvite() {
  return true
}

async function canAddXEditCollaborators() {
  return true
}

async function canChangeCollaboratorPrivilegeLevel() {
  return true
}

export default {
  allowedNumberOfCollaboratorsInProject: callbackify(
    allowedNumberOfCollaboratorsInProject
  ),
  allowedNumberOfCollaboratorsForUser: callbackify(
    allowedNumberOfCollaboratorsForUser
  ),
  canAcceptEditCollaboratorInvite: callbackify(canAcceptEditCollaboratorInvite),
  canAddXEditCollaborators: callbackify(canAddXEditCollaborators),
  canChangeCollaboratorPrivilegeLevel: callbackify(
    canChangeCollaboratorPrivilegeLevel
  ),
  promises: {
    allowedNumberOfCollaboratorsInProject,
    allowedNumberOfCollaboratorsForUser,
    canAcceptEditCollaboratorInvite,
    canAddXEditCollaborators,
    canChangeCollaboratorPrivilegeLevel,
  },
}
