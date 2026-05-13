import settings from '@superpaper/settings'
import ObjectPersistor from '@superpaper/object-persistor'

const persistorSettings = settings.filestore
persistorSettings.paths = settings.path
const persistor = ObjectPersistor(persistorSettings)

export default persistor
