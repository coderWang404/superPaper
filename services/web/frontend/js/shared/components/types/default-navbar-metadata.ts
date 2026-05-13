import type {
  NavbarItemData,
  NavbarSessionUser,
} from '@/shared/components/types/navbar'

export type DefaultNavbarMetadata = {
  customLogo?: string
  title?: string
  canDisplayAdminMenu: boolean
  canDisplayAdminRedirect: boolean
  canDisplayProjectUrlLookup: boolean
  canDisplayScriptLogMenu: boolean
  suppressNavbarRight: boolean
  suppressNavContentLinks: boolean
  showCloseIcon?: boolean
  showSignUpLink: boolean
  currentUrl: string
  sessionUser?: NavbarSessionUser
  adminUrl?: string
  items: NavbarItemData[]
}
