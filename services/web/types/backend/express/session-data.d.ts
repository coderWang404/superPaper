import 'express-session'

// Add properties to Express's SessionData object that are expected to be
// present in controllers.
declare module 'express-session' {
  // eslint-disable-next-line no-unused-vars
  interface SessionData {
    postCheckoutRedirect?: string
    postLoginRedirect?: string
    postOnboardingRedirect?: string
    sharedProjectData?: any
    templateData?: any
    // Add further properties as needed
  }
}
