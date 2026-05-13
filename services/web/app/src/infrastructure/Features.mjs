import Settings from '@superpaper/settings'
import _ from 'lodash'

/**
 * @typedef {Object} Settings
 * @property {Object | undefined}  apis
 * @property {Object | undefined}  apis.linkedUrlProxy
 * @property {string | undefined}  apis.linkedUrlProxy.url
 * @property {boolean | undefined} enableGithubSync
 * @property {boolean | undefined} enableGitBridge
 * @property {boolean | undefined} enableHomepage
 * @property {boolean | undefined} oauth
 * @property {Object | undefined} superpaper
 * @property {Object | undefined} superpaper.oauth
 */

const Features = {
  /**
   * Whether a feature is enabled in the appliation's configuration
   *
   * @param {string} feature
   * @returns {boolean}
   */
  hasFeature(feature) {
    switch (feature) {
      case 'homepage':
        return Boolean(Settings.enableHomepage)
      case 'registration-page':
        return true
      case 'registration':
        return true
      case 'chat':
        return Boolean(Settings.disableChat) === false
      case 'link-sharing':
        return Boolean(Settings.disableLinkSharing) === false
      case 'github-sync':
        return Boolean(Settings.enableGithubSync)
      case 'git-bridge':
        return Boolean(Settings.enableGitBridge)
      case 'oauth':
        return Boolean(Settings.oauth)
      case 'linked-project-file':
        return Boolean(Settings.enabledLinkedFileTypes.includes('project_file'))
      case 'linked-project-output-file':
        return Boolean(
          Settings.enabledLinkedFileTypes.includes('project_output_file')
        )
      case 'link-url':
        return Boolean(
          _.get(Settings, ['apis', 'linkedUrlProxy', 'url']) &&
          Settings.enabledLinkedFileTypes.includes('url')
        )
      default:
        throw new Error(`unknown feature: ${feature}`)
    }
  },
}

export default Features
