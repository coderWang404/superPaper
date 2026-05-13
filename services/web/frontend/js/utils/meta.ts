import { User, Features, FeatureUsage } from '../../../types/user'
import { UserSettings } from '../../../types/user-settings'
import { ExposedSettings } from '../../../types/exposed-settings'
import {
  type ImageName,
  OverallThemeMeta,
  type SpellCheckLanguage,
} from '../../../types/project-settings'
import { UserEmailData } from '../../../types/user-email'
import { Notification as NotificationType } from '../../../types/project/dashboard/notification'
import { GetProjectsResponseBody } from '../../../types/project/dashboard/api'
import { Tag } from '../../../app/src/Features/Tags/types'
import { SplitTestInfo } from '../../../types/split-test'
import { AccessToken } from '../../../types/settings-page'
import { SuggestedLanguage } from '../../../types/system-message'
import { PasswordStrengthOptions } from '../../../types/password-strength-options'
import { DefaultNavbarMetadata } from '@/shared/components/types/default-navbar-metadata'
import { FooterMetadata } from '@/shared/components/types/footer-metadata'
import { AdminCapability } from '../../../types/admin-capabilities'
import { UserNotificationPreferences } from '../../../types/notifications'
import { FullHistoryFailure } from '@ol-types/history/projectHistory'

type AlgoliaConfig = {
  appId: string
  apiKey: string
  indexes: {
    wiki: string
  }
}
type ScriptLogType = Record<string, unknown>
type SharingPermissions = Record<string, unknown>

export interface Meta {
  'ol-ExposedSettings': ExposedSettings
  'ol-adminCapabilities': AdminCapability[]
  'ol-adminUserExists': boolean
  'ol-algolia': AlgoliaConfig | undefined
  'ol-allowedExperiments': string[]
  'ol-anonymous': boolean
  'ol-baseAssetPath': string
  'ol-canUseClsiCache': boolean

  // dynamic keys based on permissions
  'ol-cannot-add-secondary-email': boolean
  'ol-cannot-change-password': boolean
  'ol-cannot-delete-own-account': boolean
  'ol-cannot-use-ai': boolean
  'ol-capabilities': Array<'dropbox' | 'chat' | 'use-ai' | 'link-sharing'>

  'ol-compileSettings': {
    compileTimeout: number
  }
  'ol-compilesUserContentDomain': string
  'ol-createdAt': Date
  'ol-csrfToken': string
  'ol-currentUrl': string
  'ol-debugPdfDetach': boolean
  'ol-detachRole': 'detached' | 'detacher' | ''
  'ol-dictionariesRoot': 'string'
  'ol-editorThemes': { name: string; dark: boolean }[]
  'ol-email': string
  'ol-emailAddressLimit': number
  'ol-error': { name: string } | undefined
  'ol-errorType': string | undefined
  'ol-expired': boolean
  'ol-featureUsage': FeatureUsage
  'ol-features': Features
  'ol-footer': FooterMetadata
  'ol-galleryTagName': string
  'ol-gitBridgeEnabled': boolean
  'ol-gitBridgePublicBaseUrl': string
  'ol-hasPassword': boolean
  'ol-hasWriteAccess': boolean
  'ol-historyBlobStats': {
    projectId: string
    textBlobsBytes: number
    binaryBlobsBytes: number
    totalBytes: number
    nTextBlobs: number
    nBinaryBlobs: number
    owned?: boolean
  }[]
  'ol-i18n': { currentLangCode: string }
  'ol-imageNames': ImageName[]
  'ol-inactiveTutorials': string[]
  'ol-inviteToken': string
  'ol-inviterName': string
  'ol-isRegisteredViaGoogle': boolean
  'ol-isRestrictedTokenMember': boolean
  'ol-itm_campaign': string
  'ol-itm_content': string
  'ol-itm_referrer': string
  'ol-joinedGroupName': string
  'ol-labs': boolean
  'ol-labsExperiments': Array<{
    name: string
    title: string
    description: string
    icon: string
    isFull: boolean
    optedIn: boolean
  }>
  'ol-languages': SpellCheckLanguage[]
  'ol-learnedWords': string[]
  'ol-legacyEditorThemes': { name: string; dark: boolean }[]
  'ol-loadingText': string
  'ol-mathJaxPath': string
  'ol-maxDocLength': number
  'ol-maxReconnectGracefullyIntervalMs': number
  'ol-navbar': DefaultNavbarMetadata
  'ol-no-single-dollar': boolean
  'ol-notifications': NotificationType[]
  'ol-otMigrationStage': number
  'ol-overallThemes': OverallThemeMeta[]
  'ol-pages': number
  'ol-passwordStrengthOptions': PasswordStrengthOptions
  'ol-personalAccessTokens': AccessToken[] | undefined
  'ol-postCheckoutRedirect': string
  'ol-postUrl': string
  'ol-prefetchedProjectsBlob': GetProjectsResponseBody | undefined
  'ol-preventCompileOnLoad'?: boolean
  'ol-primaryEmail': { email: string; confirmed: boolean }
  'ol-project': any // TODO
  'ol-projectEntityCounts': { files: number; docs: number }
  'ol-projectHistoryFailures': FullHistoryFailure[]
  'ol-projectName': string
  'ol-projectTags': Tag[]
  'ol-project_id': string
  'ol-ro-mirror-on-client-no-local-storage': boolean
  'ol-script-log': ScriptLogType
  'ol-script-logs': ScriptLogType[]
  'ol-sharingPermissions': SharingPermissions
  'ol-shouldAllowEditingDetails': boolean
  'ol-showAiFeatures': boolean
  'ol-showSymbolPalette': boolean
  'ol-splitTestInfo': { [name: string]: SplitTestInfo }
  'ol-splitTestVariants': { [name: string]: string }
  'ol-suggestedLanguage': SuggestedLanguage | undefined
  'ol-symbolPaletteAvailable': boolean
  'ol-tags': Tag[]
  'ol-translationIoNotLoaded': string
  'ol-translationLoadErrorMessage': string
  'ol-translationMaintenance': string
  'ol-translationUnableToJoin': string
  'ol-useShareJsHash': boolean
  'ol-user': User
  'ol-userEmails': UserEmailData[]
  'ol-userNotificationPreferences': UserNotificationPreferences
  'ol-userSettings': UserSettings
  'ol-user_id': string | undefined
  'ol-usersEmail': string | undefined
  'ol-wikiEnabled': boolean
  'ol-wsUrl': string
}

type DeepPartial<T> =
  T extends Record<string, any> ? { [P in keyof T]?: DeepPartial<T[P]> } : T

export type PartialMeta = DeepPartial<Meta>

export type MetaAttributesCache<
  K extends keyof PartialMeta = keyof PartialMeta,
> = Map<K, PartialMeta[K]>

export type MetaTag = {
  [K in keyof Meta]: {
    name: K
    value: Meta[K]
  }
}[keyof Meta]

// cache for parsed values
window.metaAttributesCache = window.metaAttributesCache || new Map()

export default function getMeta<T extends keyof Meta>(name: T): Meta[T] {
  if (window.metaAttributesCache.has(name)) {
    return window.metaAttributesCache.get(name)
  }
  const element = document.head.querySelector(
    `meta[name="${name}"]`
  ) as HTMLMetaElement
  if (!element) {
    return undefined!
  }
  const plainTextValue = element.content
  let value
  switch (element.dataset.type) {
    case 'boolean':
      // in pug: content=false -> no content field
      // in pug: content=true  -> empty content field
      value = element.hasAttribute('content')
      break
    case 'json':
    case 'number':
      if (!plainTextValue) {
        // JSON.parse('') throws
        value = undefined
      } else {
        value = JSON.parse(plainTextValue)
      }
      break
    default:
      value = plainTextValue
  }
  window.metaAttributesCache.set(name, value)
  return value
}
