import settings from '@superpaper/settings'
import ObjectPersistor from '@superpaper/object-persistor'
import AbstractPersistor from '@superpaper/object-persistor/src/AbstractPersistor.js'
import Metrics from '@superpaper/metrics'

const persistorSettings = settings.docstore
persistorSettings.Metrics = Metrics

const persistor = settings.docstore.backend
  ? ObjectPersistor(persistorSettings)
  : new AbstractPersistor()

export default persistor
