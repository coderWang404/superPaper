function clearSource(session) {
  if (session) {
    delete session.registrationSource
  }
}

function clearInbound(session) {
  if (session) {
    delete session.inbound
  }
}

export default {
  clearSource,
  clearInbound,
}
