import NotificationsHandler from "./NotificationsHandler.mjs";
import { callbackifyAll } from "@superpaper/promise-utils";

function dropboxDuplicateProjectNames(userId) {
  return {
    key: `dropboxDuplicateProjectNames-${userId}`,
    async create(projectName) {
      return await NotificationsHandler.promises.createNotification(
        userId,
        this.key,
        "notification_dropbox_duplicate_project_names",
        { projectName },
        null,
        true,
      );
    },
    async read() {
      return await NotificationsHandler.promises.markAsReadWithKey(
        userId,
        this.key,
      );
    },
  };
}

function dropboxUnlinkedDueToLapsedReconfirmation(userId) {
  return {
    key: "drobox-unlinked-due-to-lapsed-reconfirmation",
    async create() {
      return await NotificationsHandler.promises.createNotification(
        userId,
        this.key,
        "notification_dropbox_unlinked_due_to_lapsed_reconfirmation",
        {},
        null,
        true,
      );
    },
    async read() {
      return await NotificationsHandler.promises.markAsReadWithKey(
        userId,
        this.key,
      );
    },
  };
}

function projectInvite(invite, project, sendingUser, user) {
  return {
    key: `project-invite-${invite._id}`,
    async create() {
      const messageOpts = {
        userName: sendingUser.first_name,
        projectName: project.name,
        projectId: project._id.toString(),
        token: invite.token,
      };
      return await NotificationsHandler.promises.createNotification(
        user._id.toString(),
        this.key,
        "notification_project_invite",
        messageOpts,
        invite.expires,
      );
    },
    async read() {
      return await NotificationsHandler.promises.markAsReadByKeyOnly(this.key);
    },
  };
}

function tpdsFileLimit(userId) {
  return {
    key: `tpdsFileLimit-${userId}`,
    async create(projectName, projectId) {
      const messageOpts = {
        projectName,
        projectId,
      };
      return await NotificationsHandler.promises.createNotification(
        userId,
        this.key,
        "notification_tpds_file_limit",
        messageOpts,
        null,
        true,
      );
    },
    async read() {
      return await NotificationsHandler.promises.markAsReadByKeyOnly(this.key);
    },
  };
}

function oldDebugProjects(userId) {
  return {
    key: `old-debug-projects-${userId}`,
    async create() {
      return await NotificationsHandler.promises.createNotification(
        userId,
        this.key,
        "notification_old_debug_projects",
        {},
        null,
        true,
      );
    },
    async read() {
      return await NotificationsHandler.promises.markAsReadWithKey(
        userId,
        this.key,
      );
    },
  };
}

/** @type {Record<string, any>} */
const NotificationsBuilder = {
  // Note: notification keys should be url-safe
  dropboxUnlinkedDueToLapsedReconfirmation(userId) {
    return callbackifyAll(dropboxUnlinkedDueToLapsedReconfirmation(userId));
  },
  dropboxDuplicateProjectNames(userId) {
    return callbackifyAll(dropboxDuplicateProjectNames(userId));
  },
  projectInvite(invite, project, sendingUser, user) {
    return callbackifyAll(projectInvite(invite, project, sendingUser, user));
  },
  tpdsFileLimit(userId) {
    return callbackifyAll(tpdsFileLimit(userId));
  },
};

/** @type {Record<string, any>} */
NotificationsBuilder.promises = {
  dropboxUnlinkedDueToLapsedReconfirmation,
  dropboxDuplicateProjectNames,
  projectInvite,
  tpdsFileLimit,
  oldDebugProjects,
};

export default NotificationsBuilder;
