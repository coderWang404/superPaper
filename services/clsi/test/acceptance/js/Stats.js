import { fetchString } from '@superpaper/fetch-utils'
import Settings from '@superpaper/settings'
after(async function () {
  const metrics = await fetchString(`${Settings.apis.clsi.url}/metrics`)
  console.error('-- metrics --')
  console.error(metrics)
  console.error('-- metrics --')
})
