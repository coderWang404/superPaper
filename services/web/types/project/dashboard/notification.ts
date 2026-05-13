type TemplateKey =
  | 'notification_project_invite'
  | 'notification_tpds_file_limit'
  | 'notification_dropbox_duplicate_project_names'
  | 'notification_dropbox_unlinked_due_to_lapsed_reconfirmation'

type NotificationBase = {
  _id?: number
  html?: string
  templateKey: TemplateKey | string
}

export interface NotificationProjectInvite extends NotificationBase {
  templateKey: Extract<TemplateKey, 'notification_project_invite'>
  messageOpts: {
    projectName: string
    userName: string
    projectId: number | string
    token: string
  }
}

export interface NotificationTPDSFileLimit extends NotificationBase {
  templateKey: Extract<TemplateKey, 'notification_tpds_file_limit'>
  messageOpts: {
    projectName: string
    projectId?: string
  }
}

export interface NotificationDropboxDuplicateProjectNames extends NotificationBase {
  templateKey: Extract<
    TemplateKey,
    'notification_dropbox_duplicate_project_names'
  >
  messageOpts: {
    projectName: string
  }
}

interface NotificationDropboxUnlinkedDueToLapsedReconfirmation extends NotificationBase {
  templateKey: Extract<
    TemplateKey,
    'notification_dropbox_unlinked_due_to_lapsed_reconfirmation'
  >
}

export type Notification =
  | NotificationProjectInvite
  | NotificationTPDSFileLimit
  | NotificationDropboxDuplicateProjectNames
  | NotificationDropboxUnlinkedDueToLapsedReconfirmation
