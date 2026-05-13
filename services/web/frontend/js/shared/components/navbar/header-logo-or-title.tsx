import type { DefaultNavbarMetadata } from '@/shared/components/types/default-navbar-metadata'
import getMeta from '@/utils/meta'

export default function HeaderLogoOrTitle({
  brandLogo,
  customLogo,
  title,
}: Pick<DefaultNavbarMetadata, 'customLogo' | 'title'> & {
  brandLogo?: string
}) {
  const { appName } = getMeta('ol-ExposedSettings')
  const logoUrl = customLogo ?? brandLogo
  return (
    <a href="/" aria-label={appName} className="navbar-brand">
      {(customLogo || !title) && (
        <div
          className="navbar-logo"
          style={logoUrl ? { backgroundImage: `url("${logoUrl}")` } : {}}
        />
      )}
      {title && (
        <div className="navbar-title">
          <span>{title}</span>
        </div>
      )}
    </a>
  )
}
